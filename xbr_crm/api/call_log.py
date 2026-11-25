# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Numbers for a call logged by hand (Create Call Log on a pipeline).

The form fills From and To itself so nobody types the same two numbers every
time: the user's own number and the pipeline's (or lead's, or contact's).
Which goes where depends on the call's type (see the frontend's callLogPrefill).
"""

import frappe

# Where each kind of record keeps the customer's number, best first.
RECORD_NUMBER_FIELDS = {
	"CRM Deal": ("mobile_no", "phone"),
	"CRM Lead": ("mobile_no", "phone"),
	"Contact": ("mobile_no", "phone"),
}


@frappe.whitelist()
def get_prefill(reference_doctype: str | None = None, reference_docname: str | None = None) -> dict:
	return {
		"mine": my_number(),
		"theirs": record_number(reference_doctype, reference_docname),
	}


def my_number(user: str | None = None) -> str:
	"""The user's phone: their telephony agent number (primary first), else the
	mobile or phone on their user profile."""
	user = user or frappe.session.user
	if frappe.db.exists("CRM Telephony Agent", user):
		agent = frappe.get_cached_doc("CRM Telephony Agent", user)
		numbers = sorted(agent.get("phone_nos") or [], key=lambda r: not r.is_primary)
		for value in (agent.mobile_no, *(r.number for r in numbers)):
			if value:
				return value.strip()
	row = frappe.db.get_value("User", user, ["mobile_no", "phone"], as_dict=True) or {}
	return (row.get("mobile_no") or row.get("phone") or "").strip()


def record_number(doctype: str | None, name: str | None) -> str:
	"""The customer's number on the record the call is logged on, if the user
	may read it."""
	fields = RECORD_NUMBER_FIELDS.get(doctype or "")
	if not fields or not name or not frappe.db.exists(doctype, name):
		return ""
	if not frappe.has_permission(doctype, "read", name):
		return ""
	row = frappe.db.get_value(doctype, name, list(fields), as_dict=True) or {}
	number = next((row[f].strip() for f in fields if row.get(f)), "")
	if number or doctype != "CRM Deal":
		return number
	# A pipeline's number normally comes from its primary contact.
	return contact_number(_primary_contact(name))


def _primary_contact(deal: str) -> str | None:
	filters = {"parent": deal, "parenttype": "CRM Deal", "parentfield": "contacts"}
	return frappe.db.get_value("CRM Contacts", {**filters, "is_primary": 1}, "contact") or frappe.db.get_value(
		"CRM Contacts", filters, "contact"
	)


def contact_number(contact: str | None) -> str:
	"""A contact's mobile, else phone, else any number on it (primary first)."""
	if not contact:
		return ""
	row = frappe.db.get_value("Contact", contact, ["mobile_no", "phone"], as_dict=True) or {}
	if row.get("mobile_no") or row.get("phone"):
		return (row.get("mobile_no") or row.get("phone")).strip()
	numbers = frappe.get_all(
		"Contact Phone",
		filters={"parent": contact, "parenttype": "Contact"},
		fields=["phone"],
		order_by="is_primary_mobile_no desc, is_primary_phone desc, idx asc",
		limit=1,
	)
	return (numbers[0].phone or "").strip() if numbers else ""
