# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""The follow-up stage: a dated task with a reminder, overdue and stuck pipelines.

- Moving a pipeline into the follow-up stage (FCRM Settings → Follow-ups, default
  "Follow-up") needs a follow-up date. The form asks for one; any other route gets
  tomorrow at 10:00. The CRM then creates a task for the pipeline owner, due at
  that time, with an email + in-app reminder. A new date moves the same task.
- Overdue: in the follow-up stage with the follow-up date passed.
- Stuck: in the follow-up stage with no activity (stage change, email, comment,
  note, task, call) for N days (default 10). Owners, and their manager in the
  sales hierarchy, get a daily email listing theirs.
"""

from datetime import datetime, time, timedelta

import frappe
from frappe import _
from frappe.utils import add_days, cint, get_datetime, get_url, getdate, now_datetime

DEFAULT_STAGE = "Follow-up"
DEFAULT_STUCK_DAYS = 10
DEFAULT_HOUR = 10  # follow-up time used when none is given: tomorrow at 10:00
CLOSED_TASK_STATUSES = ("Done", "Canceled")


def follow_up_stage() -> str:
	return frappe.db.get_single_value("FCRM Settings", "follow_up_stage") or DEFAULT_STAGE


def default_follow_up_time(now: datetime | None = None) -> datetime:
	now = now or now_datetime()
	return datetime.combine(getdate(add_days(now, 1)), time(DEFAULT_HOUR))


# ---------------------------------------------------------------------------
# Follow-up task (CRM Deal validate / on_update)
# ---------------------------------------------------------------------------


def prepare(deal):
	"""In validate: make sure a pipeline in the follow-up stage has a date, and
	note whether its task needs creating or moving."""
	if deal.status != follow_up_stage():
		return
	entering = deal.is_new() or deal.has_value_changed("status")
	if entering and not deal.next_follow_up:
		deal.next_follow_up = default_follow_up_time()
	if not deal.next_follow_up:
		return
	if (
		entering
		or deal.has_value_changed("next_follow_up")
		or deal.has_value_changed("follow_up_note")
		or not _open_task(deal.follow_up_task)
	):
		deal.flags.sync_follow_up_task = True


def sync_task(deal):
	"""In on_update: create the follow-up task, or move the open one to the new date."""
	if not deal.flags.get("sync_follow_up_task"):
		return
	deal.flags.sync_follow_up_task = False

	title = _("Follow up: {0}").format(deal_label(deal))
	description = frappe.utils.escape_html(deal.follow_up_note or "").replace("\n", "<br>")
	assignee = deal.deal_owner or frappe.session.user

	task = _open_task(deal.follow_up_task)
	if task:
		task.update(
			{
				"title": title,
				"due_date": deal.next_follow_up,
				"description": description or task.description,
				"assigned_to": assignee,
			}
		)
		task.save(ignore_permissions=True)
		return

	task = frappe.get_doc(
		{
			"doctype": "CRM Task",
			"title": title,
			"description": description,
			"status": "Todo",
			"priority": "Medium",
			"due_date": deal.next_follow_up,
			"assigned_to": assignee,
			"reference_doctype": "CRM Deal",
			"reference_docname": deal.name,
			"crm_company": deal.get("crm_company"),
			# Email + in-app reminder at the follow-up time.
			"reminders": [{"type": "Email", "before": 0, "interval": "minutes"}],
		}
	).insert(ignore_permissions=True)
	deal.db_set("follow_up_task", task.name, update_modified=False)


def _open_task(name):
	if not name or not frappe.db.exists("CRM Task", name):
		return None
	task = frappe.get_doc("CRM Task", name)
	return None if task.status in CLOSED_TASK_STATUSES else task


def deal_label(deal) -> str:
	person = " ".join(filter(None, [deal.get("first_name"), deal.get("last_name")]))
	return deal.get("organization") or person or deal.name


# ---------------------------------------------------------------------------
# Overdue
# ---------------------------------------------------------------------------


def is_overdue(status: str | None, next_follow_up, now: datetime | None = None) -> bool:
	return bool(
		status == follow_up_stage()
		and next_follow_up
		and get_datetime(next_follow_up) < (now or now_datetime())
	)


# ---------------------------------------------------------------------------
# Stuck pipelines (daily email)
# ---------------------------------------------------------------------------

# Things that count as working on a pipeline. Reminder emails are "Automated
# Message" communications and deliberately do not count.
ACTIVITY_QUERIES = (
	"select max(creation) from `tabCRM Status Change Log` where parenttype='CRM Deal' and parent=%(deal)s",
	"""select max(creation) from `tabCommunication` where reference_doctype='CRM Deal'
		and reference_name=%(deal)s and communication_type='Communication'""",
	"""select max(creation) from `tabComment` where reference_doctype='CRM Deal'
		and reference_name=%(deal)s and comment_type='Comment'""",
	"select max(modified) from `tabFCRM Note` where reference_doctype='CRM Deal' and reference_docname=%(deal)s",
	"select max(modified) from `tabCRM Task` where reference_doctype='CRM Deal' and reference_docname=%(deal)s",
	"select max(creation) from `tabCRM Call Log` where reference_doctype='CRM Deal' and reference_docname=%(deal)s",
)


def last_activity(deal_name: str, created) -> datetime:
	times = [get_datetime(created)]
	for query in ACTIVITY_QUERIES:
		value = frappe.db.sql(query, {"deal": deal_name})[0][0]
		if value:
			times.append(get_datetime(value))
	return max(times)


def stuck_deals(days: int, now: datetime | None = None) -> list[dict]:
	"""Pipelines in the follow-up stage with no activity for `days` days."""
	now = now or now_datetime()
	cutoff = now - timedelta(days=days)
	deals = frappe.get_all(
		"CRM Deal",
		filters={"status": follow_up_stage()},
		fields=[
			"name",
			"deal_owner",
			"organization",
			"first_name",
			"last_name",
			"next_follow_up",
			"creation",
		],
	)
	stuck = []
	for deal in deals:
		last = last_activity(deal.name, deal.creation)
		if last < cutoff:
			deal.last_activity = last
			deal.idle_days = (now - last).days
			stuck.append(deal)
	return stuck


def manager_of(user: str | None) -> str | None:
	"""The user's manager in the sales hierarchy, if one is set."""
	if not user:
		return None
	parent = frappe.db.get_value("CRM Sales Hierarchy", {"user": user}, "reports_to")
	return frappe.db.get_value("CRM Sales Hierarchy", parent, "user") if parent else None


def send_stuck_follow_up_alerts(now: datetime | None = None):
	"""Daily: each owner gets their stuck pipelines, each manager their team's."""
	if not cint(frappe.db.get_single_value("FCRM Settings", "enable_stuck_follow_up_alerts")):
		return
	days = cint(frappe.db.get_single_value("FCRM Settings", "stuck_follow_up_days")) or DEFAULT_STUCK_DAYS
	now = now or now_datetime()

	# Once a day, even if the scheduler fires twice.
	guard = f"xbr_crm:stuck_follow_ups:{getdate(now)}"
	if frappe.cache.get_value(guard):
		return
	frappe.cache.set_value(guard, 1, expires_in_sec=26 * 3600)

	by_recipient: dict[str, list] = {}
	for deal in stuck_deals(days, now):
		owner = deal.deal_owner
		if owner:
			by_recipient.setdefault(owner, []).append(deal)
		manager = manager_of(owner)
		if manager and manager != owner:
			by_recipient.setdefault(manager, []).append(deal)

	for user, deals in by_recipient.items():
		email = frappe.db.get_value("User", {"name": user, "enabled": 1}, "email")
		if not email or user in ("Administrator", "Guest"):
			continue
		try:
			frappe.sendmail(
				recipients=[email],
				subject=_("{0} pipeline(s) stuck in follow-up for {1}+ days").format(len(deals), days),
				message=_digest_html(deals, days, user),
			)
		except Exception:
			frappe.log_error(title=f"Stuck follow-up alert failed for {user}")


def _digest_html(deals: list, days: int, user: str) -> str:
	base = get_url()
	esc = frappe.utils.escape_html
	cell = "padding:6px 12px 6px 0;border-bottom:1px solid #e5e7eb;vertical-align:top"
	rows = "".join(
		f"""<tr>
			<td style="{cell}"><a href="{base}/pipeline/{esc(d.name)}" style="color:#2563eb">{esc(deal_label(d))}</a></td>
			<td style="{cell}">{esc(frappe.db.get_value("User", d.deal_owner, "full_name") or d.deal_owner or "")}</td>
			<td style="{cell}">{d.idle_days} {esc(_("days"))}</td>
			<td style="{cell}">{esc(frappe.utils.format_datetime(d.next_follow_up) if d.next_follow_up else "—")}</td>
		</tr>"""
		for d in sorted(deals, key=lambda d: d.idle_days, reverse=True)
	)
	name = esc(frappe.db.get_value("User", user, "first_name") or "")
	return f"""<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;color:#111827">
		<p>{esc(_("Hi"))} {name},</p>
		<p>{esc(_("These pipelines are in the follow-up stage and have had no activity (calls, emails, notes, comments or tasks) for {0} days or more.").format(days))}</p>
		<table style="border-collapse:collapse;font-size:14px">
			<tr style="color:#6b7280;text-align:left">
				<th style="{cell}">{esc(_("Pipeline"))}</th><th style="{cell}">{esc(_("Owner"))}</th>
				<th style="{cell}">{esc(_("No activity for"))}</th><th style="{cell}">{esc(_("Follow-up date"))}</th>
			</tr>{rows}
		</table>
		<p style="color:#6b7280;font-size:12px">{esc(_("Change the number of days, or turn these emails off, in CRM Settings → Follow-ups."))}</p>
	</div>"""