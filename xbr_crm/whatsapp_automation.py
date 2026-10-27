# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""WhatsApp automation (FCRM Settings → WhatsApp Automation). All off by default.

1. Reminders to the team — when an event or task reminder fires, each CRM user it
   goes to also gets it on WhatsApp, at the mobile number on their User.
2. Follow-ups to customers — when a pipeline in the follow-up stage reaches its
   follow-up date, its contact gets a WhatsApp message.
3. Pipelines from WhatsApp — a message from a number the CRM does not know
   creates a Contact and a Pipeline, the way an inquiry email does.

Everything here needs the frappe_whatsapp app with a default outgoing WhatsApp
Account. Messages a business starts must use a template Meta has approved, so
features 1 and 2 also need a template name; without one they stay silent.
Nothing in this module raises into its caller: a WhatsApp failure never stops a
reminder, an email or an incoming message.

Template parameters, in order ({{1}}, {{2}}, ... in the approved template):
    reminder:  recipient name, item title, when
    follow-up: contact first name, owner name, organisation
"""

import hashlib
import json
from datetime import datetime, timedelta

import frappe
from frappe.utils import now_datetime

# A follow-up is only sent while it is at most this old; never sent late.
GRACE_MINUTES = 5

FOLLOW_UP_REMINDER_TYPE = "whatsapp_follow_up"


def is_available() -> bool:
	"""Whether WhatsApp messages can be sent on this site at all."""
	return "frappe_whatsapp" in frappe.get_installed_apps() and bool(
		frappe.db.exists("DocType", "WhatsApp Message")
	)


def _setting(fieldname: str):
	return frappe.get_cached_doc("FCRM Settings").get(fieldname)


def _enabled(switch: str, template_field: str | None = None) -> bool:
	if not _setting(switch) or not is_available():
		return False
	return not template_field or bool((_setting(template_field) or "").strip())


def send_template(to: str, template: str, params: list, reference_doctype: str, reference_name: str) -> str:
	"""Send an approved template and return the WhatsApp Message name.

	frappe_whatsapp sends to Meta while inserting the message, so an error from
	Meta raises here; callers catch it.
	"""
	doc = frappe.get_doc(
		{
			"doctype": "WhatsApp Message",
			"type": "Outgoing",
			"to": to,
			"message_type": "Template",
			"use_template": 1,
			"template": template,
			"content_type": "text",
			"reference_doctype": reference_doctype,
			"reference_name": reference_name,
			# Body values in template order: {"1": ..., "2": ...}.
			"body_param": json.dumps({str(i): str(v or "") for i, v in enumerate(params, 1)}),
		}
	)
	doc.insert(ignore_permissions=True)
	return doc.name


# ---------------------------------------------------------------------------
# 1. Reminders to the team
# ---------------------------------------------------------------------------


def send_reminder(reminder, recipient, when: str) -> str | None:
	"""WhatsApp a due reminder to a CRM user. Returns a note for the reminder log.

	Called by reminders.service.deliver once per reminder and recipient, inside
	its exactly-once claim, so this never sends twice.
	"""
	if not recipient.user or not _enabled("whatsapp_reminders", "whatsapp_reminder_template"):
		return None
	mobile = frappe.db.get_value("User", recipient.user, "mobile_no")
	if not mobile:
		return frappe._("WhatsApp not sent: no mobile number on the user.")
	try:
		send_template(
			mobile,
			_setting("whatsapp_reminder_template").strip(),
			[recipient.full_name or recipient.user, reminder.title, when],
			reminder.reference_doctype,
			reference_name=reminder.reference_name,
		)
		return frappe._("Also sent on WhatsApp.")
	except Exception as e:
		frappe.log_error(title=f"WhatsApp reminder failed: {reminder.reference_name} -> {recipient.user}")
		return frappe._("WhatsApp failed: {0}").format(str(e)[:200])


# ---------------------------------------------------------------------------
# 2. Follow-ups to customers
# ---------------------------------------------------------------------------


def send_due_follow_ups(now: datetime | None = None):
	"""Scheduler (every minute): WhatsApp contacts whose follow-up is due now."""
	if frappe.flags.in_import or frappe.flags.in_patch or frappe.flags.in_install:
		return
	if not _enabled("whatsapp_follow_ups", "whatsapp_follow_up_template"):
		return

	from xbr_crm.follow_ups import follow_up_stage

	now = now or now_datetime()
	deals = frappe.get_all(
		"CRM Deal",
		filters={
			"status": follow_up_stage(),
			"next_follow_up": ["between", [now - timedelta(minutes=GRACE_MINUTES), now]],
		},
		fields=["name", "next_follow_up", "deal_owner", "organization", "crm_company"],
	)
	for deal in deals:
		try:
			_follow_up(deal)
			frappe.db.commit()
		except Exception:
			frappe.db.rollback()
			frappe.log_error(title=f"WhatsApp follow-up failed: {deal.name}")


def _follow_up(deal):
	contact = _primary_contact(deal.name)
	mobile = contact and (contact.mobile_no or contact.phone)
	key = _dedupe_key(deal.name, deal.next_follow_up)
	if frappe.db.exists("CRM Reminder Log", {"dedupe_key": key}):
		return

	log = frappe.get_doc(
		{
			"doctype": "CRM Reminder Log",
			"status": "Sent",
			"reminder_type": FOLLOW_UP_REMINDER_TYPE,
			"reference_doctype": "CRM Deal",
			"reference_name": deal.name,
			"crm_company": deal.get("crm_company"),
			"recipient": mobile or (contact and contact.name) or "-",
			"recipient_is_user": 0,
			"trigger_at": deal.next_follow_up,
			"occurrence_start": deal.next_follow_up,
			"reminder_key": "whatsapp_follow_up",
			"dedupe_key": key,
		}
	)
	try:
		# Claimed before sending: a crash afterwards loses one message rather
		# than sending it twice.
		log.insert(ignore_permissions=True)
	except (frappe.DuplicateEntryError, frappe.UniqueValidationError):
		return

	if not mobile:
		log.db_set(
			{
				"status": "Skipped",
				"message": "WhatsApp follow-up not sent: the contact has no mobile number.",
			},
			update_modified=False,
		)
		return

	owner = frappe.db.get_value("User", deal.deal_owner, "full_name") if deal.deal_owner else ""
	try:
		send_template(
			mobile,
			_setting("whatsapp_follow_up_template").strip(),
			[contact.first_name or "", owner or "", deal.organization or ""],
			"CRM Deal",
			deal.name,
		)
	except Exception as e:
		log.db_set({"status": "Failed", "message": f"WhatsApp failed: {e!s}"[:500]}, update_modified=False)
		frappe.log_error(title=f"WhatsApp follow-up failed: {deal.name}")


def _primary_contact(deal_name: str):
	rows = frappe.get_all(
		"CRM Contacts",
		filters={"parenttype": "CRM Deal", "parent": deal_name},
		fields=["contact", "is_primary"],
		order_by="is_primary desc, idx asc",
		limit=1,
	)
	if not rows:
		return None
	return frappe.db.get_value(
		"Contact", rows[0].contact, ["name", "first_name", "mobile_no", "phone"], as_dict=True
	)


def _dedupe_key(deal: str, follow_up) -> str:
	return hashlib.sha256(f"whatsapp_follow_up|{deal}|{follow_up}".encode()).hexdigest()


# ---------------------------------------------------------------------------
# 3. Pipelines from WhatsApp
# ---------------------------------------------------------------------------

SOURCE = "WhatsApp"


def create_pipeline_for_unknown_number(doc) -> tuple[str, str] | None:
	"""For an incoming message from a number the CRM does not know, create a
	Contact and a Pipeline and return ("CRM Deal", name). None when off or on error.

	Called from api/whatsapp.validate after the number lookup found nothing.
	"""
	if doc.type != "Incoming" or not _setting("whatsapp_creates_pipeline"):
		return None
	number = (doc.get("from") or "").strip()
	if not number:
		return None
	try:
		from xbr_crm.api.email_inquiry import STAGE
		from xbr_crm.api.lead_origin import ORIGIN_FIELD, WHATSAPP

		first_name, last_name = _split_name(doc.get("profile_name"), number)
		mobile = number if number.startswith("+") else f"+{number}"

		contact = frappe.new_doc("Contact")
		contact.first_name = first_name
		contact.last_name = last_name
		contact.append("phone_nos", {"phone": mobile, "is_primary_mobile_no": 1})
		contact.insert(ignore_permissions=True)

		deal = frappe.new_doc("CRM Deal")
		deal.first_name = first_name
		deal.last_name = last_name
		deal.mobile_no = mobile
		deal.append("contacts", {"contact": contact.name, "is_primary": 1})
		deal.status = STAGE if frappe.db.exists("CRM Deal Status", STAGE) else None
		deal.source = _ensure_source()
		if deal.meta.has_field(ORIGIN_FIELD):
			deal.set(ORIGIN_FIELD, WHATSAPP)
		# Unassigned, like email inquiries: the team picks it up from the board.
		deal.flags.from_inquiry = True
		deal.insert(ignore_permissions=True)
		return "CRM Deal", deal.name
	except Exception:
		frappe.log_error(title=f"WhatsApp: pipeline not created for {number}")
		return None


def _split_name(profile_name: str | None, number: str) -> tuple[str, str]:
	parts = (profile_name or "").split()
	if not parts:
		return number, ""
	return parts[0], " ".join(parts[1:])


def _ensure_source() -> str:
	if not frappe.db.exists("CRM Lead Source", SOURCE):
		frappe.get_doc({"doctype": "CRM Lead Source", "source_name": SOURCE}).insert(ignore_permissions=True)
	return SOURCE
