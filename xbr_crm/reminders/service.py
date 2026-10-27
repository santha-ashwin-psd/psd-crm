# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Deliver every due reminder: in-app notification + email, exactly once.

Runs every minute (see hooks.py). Each run asks every provider which reminders
fell due in the last few minutes and, per recipient:

1. writes a CRM Reminder Log row whose `dedupe_key` is unique — if the row already
   exists the reminder was handled before and is skipped, so nothing is ever sent
   twice, even when runs overlap;
2. CRM users get a CRM Notification (the bell) and, for events, the live pop-up;
3. everyone gets an email rendered from the reminder type's Email Template, sent
   through the email queue as an Automated Message on the linked record (the deal,
   or the event/task itself) so it appears in that record's activity.

Missed reminders: a reminder is only sent while it is at most GRACE_MINUTES old.
If the scheduler was down for longer, the reminder is skipped, never sent late.
Reminders due before reminder emails were switched on are never emailed, and a
reminder whose row has email turned off is only shown in-app. Pipeline follow-up
tasks are the exception: they are always emailed, whatever the email switches say.
"""

import hashlib
from datetime import datetime, timedelta

import frappe
from frappe import _
from frappe.utils import get_url, now_datetime

from xbr_crm import whatsapp_automation
from xbr_crm.reminders.base import (
	DueReminder,
	Recipient,
	describe_offset,
	format_when,
	system_timezone,
	user_timezone,
)
from xbr_crm.reminders.providers import PROVIDERS
from xbr_crm.reminders.templates import DEFAULT_TEMPLATES

# How late a reminder may still go out. Beyond this it is skipped, not sent late.
GRACE_MINUTES = 5

CRM_ROUTES = {
	"CRM Deal": "/pipeline/{}",
	"CRM Lead": "/leads/{}",
	"Contact": "/contacts/{}",
	"CRM Organization": "/organizations/{}",
	"CRM Task": "/tasks/view/list?open={}",
	"Event": "/calendar",
}


def send_due_reminders(now: datetime | None = None):
	"""Scheduler entry point: deliver all reminders due in the last GRACE_MINUTES."""
	if frappe.flags.in_import or frappe.flags.in_patch or frappe.flags.in_install:
		return

	now = now or now_datetime()
	window_start = now - timedelta(minutes=GRACE_MINUTES)
	settings = frappe.get_cached_doc("FCRM Settings")

	for label, provider, email_setting, template in PROVIDERS.values():
		try:
			due = provider(window_start, now)
		except Exception:
			frappe.log_error(title=f"Reminders: {label} provider failed")
			continue

		emails_on = bool(settings.get("enable_reminder_emails")) and bool(settings.get(email_setting))
		for reminder in due:
			for recipient in reminder.recipients:
				try:
					deliver(
						reminder, recipient, emails_on, settings.get("reminder_emails_enabled_on"), template
					)
					frappe.db.commit()
				except Exception:
					frappe.db.rollback()
					frappe.log_error(
						title=f"Reminders: failed for {reminder.reference_doctype} {reminder.reference_name}",
					)


def dedupe_key(reminder: DueReminder, recipient: Recipient) -> str:
	parts = [
		reminder.reference_doctype,
		reminder.reference_name,
		reminder.reminder_key,
		reminder.trigger_at.isoformat(),
		reminder.occurrence_start.isoformat(),
		recipient.email.lower(),
	]
	return hashlib.sha256("|".join(parts).encode()).hexdigest()


def deliver(reminder: DueReminder, recipient: Recipient, emails_on: bool, emails_since, template: str):
	"""Notify one recipient of one reminder, at most once."""
	key = dedupe_key(reminder, recipient)
	if frappe.db.exists("CRM Reminder Log", {"dedupe_key": key}):
		return

	log = frappe.get_doc(
		{
			"doctype": "CRM Reminder Log",
			"status": "Sent",
			"reminder_type": reminder.reminder_type,
			"reference_doctype": reminder.reference_doctype,
			"reference_name": reminder.reference_name,
			"crm_company": reminder.crm_company,
			"recipient": recipient.email,
			"recipient_is_user": 1 if recipient.user else 0,
			"trigger_at": reminder.trigger_at,
			"occurrence_start": reminder.occurrence_start,
			"reminder_key": reminder.reminder_key,
			"dedupe_key": key,
		}
	)
	try:
		# Claimed BEFORE sending: a crash after this point loses one reminder
		# rather than sending it twice.
		log.insert(ignore_permissions=True)
	except (frappe.DuplicateEntryError, frappe.UniqueValidationError):
		return

	notes = []
	if recipient.user:
		notify_in_app(reminder, recipient)
		# Off unless WhatsApp reminders are switched on (FCRM Settings); never raises.
		whatsapp_note = whatsapp_automation.send_reminder(
			reminder,
			recipient,
			format_when(
				reminder.occurrence_start, user_timezone(recipient.user), reminder.context.get("all_day")
			),
		)
		if whatsapp_note:
			notes.append(whatsapp_note)

	send_email = reminder.email and (
		reminder.always_email
		or (
			emails_on and (not emails_since or reminder.trigger_at >= frappe.utils.get_datetime(emails_since))
		)
	)
	if send_email:
		try:
			communication = send_reminder_email(reminder, recipient, template)
			log.db_set(
				{
					"communication": communication,
					"email_queue": frappe.db.get_value(
						"Email Queue", {"communication": communication}, "name"
					),
				},
				update_modified=False,
			)
		except Exception as e:
			log.db_set({"status": "Failed", "message": f"Email failed: {e!s}"[:500]}, update_modified=False)
			frappe.log_error(title=f"Reminder email failed: {reminder.reference_name} -> {recipient.email}")
			return
	else:
		notes.append(
			_(
				"Email not sent: email is off for this reminder, reminder emails are switched off for this type, or it was due before they were switched on."
			)
		)
		if not recipient.user:
			log.db_set({"status": "Skipped", "message": notes[-1]}, update_modified=False)
			return

	if notes:
		log.db_set("message", " ".join(notes), update_modified=False)


# ---------------------------------------------------------------------------
# In-app
# ---------------------------------------------------------------------------


def notify_in_app(reminder: DueReminder, recipient: Recipient):
	"""The bell (CRM Notification) and, for events, the live reminder pop-up."""
	tz = user_timezone(recipient.user)
	when = format_when(reminder.occurrence_start, tz, reminder.context.get("all_day"))
	esc = frappe.utils.escape_html
	label = _(reminder.context.get("category") or reminder.reminder_type.title())
	text = f"""
		<div class="mb-2 leading-5 text-ink-gray-5">
			<span class="font-medium text-ink-gray-9">{esc(_("Reminder"))}:</span>
			<span>{esc(label)}</span>
			<span class="font-medium text-ink-gray-9">{esc(reminder.title)}</span>
			<span>— {esc(when)}</span>
		</div>
	"""
	target_doctype, target_name = _target(reminder)
	frappe.get_doc(
		{
			"doctype": "CRM Notification",
			"from_user": frappe.db.get_value(reminder.reference_doctype, reminder.reference_name, "owner")
			or "Administrator",
			"to_user": recipient.user,
			"type": "Reminder",
			"message": text,
			"notification_text": text,
			"notification_type_doctype": reminder.reference_doctype,
			"notification_type_doc": reminder.reference_name,
			"reference_doctype": target_doctype,
			"reference_name": target_name,
		}
	).insert(ignore_permissions=True)

	if reminder.reminder_type == "event" and reminder.context.get("event"):
		frappe.publish_realtime(
			"event_notification", reminder.context["event"], user=recipient.user, after_commit=True
		)


def _target(reminder: DueReminder) -> tuple[str, str]:
	"""Where the reminder points: the linked CRM record if it still exists, else the item."""
	if (
		reminder.related_doctype
		and reminder.related_name
		and reminder.related_doctype in CRM_ROUTES
		and frappe.db.exists(reminder.related_doctype, reminder.related_name)
	):
		return reminder.related_doctype, reminder.related_name
	return reminder.reference_doctype, reminder.reference_name


# ---------------------------------------------------------------------------
# Email
# ---------------------------------------------------------------------------


def send_reminder_email(reminder: DueReminder, recipient: Recipient, template: str) -> str:
	"""Render the type's Email Template and send it; returns the Communication."""
	from frappe.core.doctype.communication.email import _make

	context = email_context(reminder, recipient)
	subject, body = render_template(template, context)
	target_doctype, target_name = _target(reminder)

	result = _make(
		doctype=target_doctype,
		name=target_name,
		subject=subject,
		content=body,
		recipients=[recipient.email],
		communication_medium="Email",
		communication_type="Automated Message",
		send_email=True,
		now=True,
		sender=_sender(),
	)
	return result["name"]


def _sender() -> str | None:
	"""The default outgoing account; None lets Frappe pick its fallback."""
	account = frappe.db.get_value(
		"Email Account", {"default_outgoing": 1, "enable_outgoing": 1}, ["email_id", "name"], as_dict=True
	)
	return account.email_id if account else None


def render_template(template: str, context: dict) -> tuple[str, str]:
	"""Subject and HTML body from the Email Template, or the built-in default.

	The template is editable in the CRM (Settings → Templates); if it was deleted
	or disabled, the built-in default is used so reminders never stop.
	"""
	if frappe.db.exists("Email Template", template):
		doc = frappe.get_cached_doc("Email Template", template)
		if doc.get("enabled", 1):
			body = doc.response_html if doc.use_html else doc.response
			return frappe.render_template(doc.subject, context), frappe.render_template(body or "", context)
	subject, body = DEFAULT_TEMPLATES[template]["subject"], DEFAULT_TEMPLATES[template]["response_html"]
	return frappe.render_template(subject, context), frappe.render_template(body, context)


def email_context(reminder: DueReminder, recipient: Recipient) -> dict:
	tz = user_timezone(recipient.user) if recipient.user else system_timezone()
	all_day = bool(reminder.context.get("all_day"))
	related_doctype, related_name = _target(reminder)
	base = get_url()

	context = {
		"recipient_name": recipient.full_name or recipient.email,
		"title": reminder.title,
		"reminder_type": _(reminder.context.get("category") or reminder.reminder_type.title()),
		"when": format_when(reminder.occurrence_start, tz, all_day),
		"timezone": tz,
		"time_before": describe_offset(reminder.before, reminder.interval),
		"location": reminder.context.get("location"),
		"meeting_link": reminder.context.get("meeting_link"),
		"description": reminder.context.get("description"),
		"priority": reminder.context.get("priority"),
		"item_url": base + CRM_ROUTES[reminder.reference_doctype].format(reminder.reference_name),
		"related_label": None,
		"related_url": None,
	}
	if related_doctype != reminder.reference_doctype and related_doctype in CRM_ROUTES:
		context["related_label"] = _related_label(related_doctype, related_name)
		context["related_url"] = base + CRM_ROUTES[related_doctype].format(related_name)
	return context


def _related_label(doctype: str, name: str) -> str:
	"""'Pipeline: Acme Corp (PIPE-2026-00012)' — a human name plus the ID."""
	kind = _(doctype.replace("CRM ", "")) if doctype != "CRM Deal" else _("CRM Deal")
	human = None
	if doctype == "CRM Deal":
		row = frappe.db.get_value(doctype, name, ["organization", "first_name", "last_name"], as_dict=True)
		if row:
			human = row.organization or " ".join(filter(None, [row.first_name, row.last_name]))
	elif doctype == "CRM Lead":
		human = frappe.db.get_value(doctype, name, "lead_name")
	label = f"{human} ({name})" if human else name
	return f"{kind}: {label}"
