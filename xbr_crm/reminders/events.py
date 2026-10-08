# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Calendar event reminders (meetings, calls, any Event).

Reminders come from the event's own `notifications` table or, when it has none,
from the global defaults in FCRM Settings (Calendar tab) — one list for timed
events, one for all-day events. Repeating events are reminded for every
occurrence. Only Open events remind; Completed, Closed and Cancelled ones don't.
"""

from datetime import date, datetime, time, timedelta

import frappe
from frappe.utils import add_months, getdate

from xbr_crm.reminders.base import (
	DueReminder,
	Recipient,
	offset,
	related_company,
	user_in_company,
	user_recipient,
)

WEEKDAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
MONTH_STEPS = {"Monthly": 1, "Quarterly": 3, "Half Yearly": 6, "Yearly": 12}

EVENT_FIELDS = [
	"name",
	"subject",
	"description",
	"starts_on",
	"ends_on",
	"all_day",
	"owner",
	"status",
	"event_category",
	"location",
	"google_meet_link",
	"reference_doctype",
	"reference_docname",
	"repeat_this_event",
	"repeat_on",
	"repeat_till",
	*WEEKDAYS,
]


def due_reminders(window_start: datetime, window_end: datetime) -> list[DueReminder]:
	events = _candidate_events(window_start)
	if not events:
		return []

	own = _reminder_rows([e.name for e in events])
	settings = frappe.get_cached_doc("FCRM Settings")
	defaults_timed = [("global:" + r.name, r) for r in settings.get("event_notifications") or []]
	defaults_all_day = [("global:" + r.name, r) for r in settings.get("all_day_event_notifications") or []]

	due = []
	for event in events:
		rows = own.get(event.name)
		if rows:
			reminders = [(r.name, r) for r in rows]
		else:
			reminders = defaults_all_day if event.all_day else defaults_timed
		for key, row in reminders:
			for occurrence, trigger in _due_occurrences(event, row, window_start, window_end):
				due.append(_build(event, key, row, occurrence, trigger))
	return due


def _candidate_events(window_start: datetime) -> list:
	"""Open events that could have a reminder due now: upcoming ones, and every
	repeating event still repeating.

	A reminder always fires at or before its event (offsets are never negative),
	except an all-day reminder at a time of day on the event's own date — hence
	one day of slack.
	"""
	since = window_start - timedelta(days=1)
	return frappe.get_all(
		"Event",
		filters={"status": "Open"},
		or_filters=[
			["starts_on", ">=", since],
			["repeat_this_event", "=", 1],
		],
		fields=EVENT_FIELDS,
	)


def _reminder_rows(event_names: list[str]) -> dict[str, list]:
	rows = frappe.get_all(
		"Event Notifications",
		filters={"parenttype": "Event", "parentfield": "notifications", "parent": ("in", event_names)},
		fields=["name", "parent", "type", "before", "interval", "time"],
		order_by="idx asc",
	)
	out: dict[str, list] = {}
	for row in rows:
		out.setdefault(row.parent, []).append(row)
	return out


def _due_occurrences(event, row, window_start: datetime, window_end: datetime):
	"""(occurrence_start, trigger_at) pairs whose trigger falls in the window."""
	lead = offset(row.before, row.interval)
	if lead is None:
		return []

	starts_on = frappe.utils.get_datetime(event.starts_on)
	results = []

	if event.all_day and row.time and (row.interval or "").lower() in ("days", "weeks"):
		# All-day reminders fire at a time of day, N days/weeks before the date.
		at = row.time if isinstance(row.time, time) else frappe.utils.get_time(row.time)
		for trigger_date in _dates_between(window_start, window_end):
			trigger = datetime.combine(trigger_date, at)
			if not (window_start <= trigger <= window_end):
				continue
			occurrence_date = trigger_date + lead
			if _occurs_on(event, occurrence_date):
				results.append((datetime.combine(occurrence_date, starts_on.time()), trigger))
		return results

	# Timed reminders fire `lead` before the occurrence starts.
	for occurrence_date in _dates_between(window_start + lead, window_end + lead):
		occurrence = datetime.combine(occurrence_date, starts_on.time())
		trigger = occurrence - lead
		if window_start <= trigger <= window_end and _occurs_on(event, occurrence_date):
			results.append((occurrence, trigger))
	return results


def _dates_between(start: datetime, end: datetime) -> list[date]:
	days = []
	current = start.date()
	while current <= end.date():
		days.append(current)
		current += timedelta(days=1)
	return days


def _occurs_on(event, day: date) -> bool:
	"""Whether the event (or one of its repeats) starts on `day`."""
	first = getdate(event.starts_on)
	if day < first:
		return False
	if not event.repeat_this_event:
		return day == first
	if event.repeat_till and day > getdate(event.repeat_till):
		return False

	if event.repeat_on == "Daily":
		return True
	if event.repeat_on == "Weekly":
		chosen = [i for i, wd in enumerate(WEEKDAYS) if event.get(wd)]
		return day.weekday() in (chosen or [first.weekday()])
	step = MONTH_STEPS.get(event.repeat_on)
	if step:
		months = (day.year - first.year) * 12 + (day.month - first.month)
		return months >= 0 and months % step == 0 and getdate(add_months(first, months)) == day
	return day == first


def _build(event, key, row, occurrence: datetime, trigger: datetime) -> DueReminder:
	company = related_company(event.reference_doctype, event.reference_docname)
	if not company:
		from xbr_crm.permissions.tenancy import get_user_company

		company = get_user_company(event.owner)

	return DueReminder(
		reminder_type="event",
		reference_doctype="Event",
		reference_name=event.name,
		reminder_key=key,
		trigger_at=trigger,
		occurrence_start=occurrence,
		before=int(row.before or 0),
		interval=(row.interval or "").lower(),
		title=event.subject or frappe._("Event"),
		crm_company=company,
		recipients=_recipients(event, company),
		related_doctype=event.reference_doctype or None,
		related_name=event.reference_docname or None,
		context={
			"category": event.event_category or "Event",
			"all_day": bool(event.all_day),
			"location": event.location,
			"meeting_link": event.google_meet_link,
			"description": event.description,
			"ends_on": event.ends_on,
			"event": {
				"event_name": event.name,
				"subject": event.subject,
				"description": event.description,
				"starts_on": str(occurrence),
				"ends_on": str(event.ends_on) if event.ends_on else None,
				"all_day_event": event.all_day,
				"owner": event.owner,
			},
		},
	)


def _recipients(event, company: str | None) -> list[Recipient]:
	"""The owner, participating CRM users, and external participants.

	A participant whose email belongs to a CRM user is treated as that user (in-app
	notification + email); any other email is an external participant (email only).
	CRM users from another company are left out.
	"""
	recipients: dict[str, Recipient] = {}

	owner = user_recipient(event.owner)
	if owner and user_in_company(owner.user, company):
		recipients[owner.email.lower()] = owner

	emails = frappe.get_all(
		"Event Participants", filters={"parenttype": "Event", "parent": event.name}, pluck="email"
	)
	for email in {(e or "").strip() for e in emails if e}:
		if not email or email.lower() in recipients:
			continue
		user = frappe.db.get_value("User", {"email": email}, "name")
		if user:
			found = user_recipient(user)
			if found and user_in_company(user, company):
				recipients[email.lower()] = found
			continue
		if frappe.utils.validate_email_address(email):
			recipients[email.lower()] = Recipient(email=email)

	return list(recipients.values())
