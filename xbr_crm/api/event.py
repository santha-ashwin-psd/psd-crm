# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _


def before_validate(doc, method=None):
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
