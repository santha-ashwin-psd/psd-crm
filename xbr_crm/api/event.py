# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _

_MINUTES_PER = {"minutes": 1, "hours": 60, "days": 1440, "weeks": 10080}


def before_validate(doc, method=None):
	link_attendees(doc)
	reject_duplicate_reminders(doc)


def reject_duplicate_reminders(doc):
	"""Stop two reminders that fire at the same moment.

	"1 hour" and "60 minutes" are the same reminder. On an all-day event the time
	of day is part of it: "1 day before at 8am" and "at 5pm" are different.
	"""
	seen = set()
	for row in doc.get("notifications") or []:
		minutes = int(row.before or 0) * _MINUTES_PER.get(row.interval, 0)
		key = (minutes, str(row.time or "08:00")[:5]) if doc.all_day else minutes
		if key in seen:
			frappe.throw(
				_("Two reminders are set for the same time. Remove one."),
				title=_("Duplicate reminder"),
			)
		seen.add(key)


def link_attendees(doc):
	"""Give every attendee the record link Event Participants requires.

	The attendee picker lets people type any email. Event Participants needs a
	reference (doctype + name) for each row, so a typed address with no link made
	the whole event fail to save with a MandatoryError. Each unlinked attendee is
	linked to:

	1. the Contact that owns the email, if there is one;
	2. otherwise the record the event belongs to (e.g. the deal it was created on).

	If neither exists the save is stopped with a message naming the address,
	rather than dropping the attendee or inventing a contact.
	"""
	for row in doc.get("event_participants") or []:
		if row.reference_doctype and row.reference_docname:
			continue
		email = (row.email or "").strip()
		if not email:
			continue

		contact = frappe.db.get_value("Contact Email", {"email_id": email, "parenttype": "Contact"}, "parent")
		if contact:
			row.reference_doctype, row.reference_docname = "Contact", contact
		elif doc.reference_doctype and doc.reference_docname:
			row.reference_doctype, row.reference_docname = doc.reference_doctype, doc.reference_docname
		else:
			frappe.throw(
				_(
					"{0} isn't a contact yet. Add them as a contact first, or create this event from a deal or contact."
				).format(frappe.bold(email)),
				title=_("Attendee not linked"),
			)
