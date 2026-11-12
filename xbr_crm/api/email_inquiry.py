# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Email inquiry capture.

    an email arrives at a mailbox with "Create Pipeline from Incoming Emails" on
      -> Frappe's scheduler pulls it and inserts a Communication
      -> Communication.after_insert lands here
      -> the sender already has a pipeline? attach the email to it
      -> otherwise create a Pipeline (CRM Deal) in the first stage

No lead is ever created. Website inquiries (api/web_lead.py) enter further along
the board because the visitor filled a qualifying form; an email has not been
qualified by anyone yet, so it starts at the beginning.
"""

import frappe

from xbr_crm.api.lead_origin import EMAIL, ORIGIN_FIELD

# Where a pipeline from email starts. Falls back to the board's first open stage
# when a site has renamed or removed this one.
STAGE = "Interested Leads"

SOURCE = "Email"


def create_pipeline_from_incoming_email(doc, method=None):
	"""Communication.after_insert: turn a new inquiry email into a pipeline.

	Never raises. This runs inside the mail pull; an exception here would stop the
	email itself being saved, which is worse than a missed pipeline.
	"""
	try:
		_handle(doc)
	except Exception:
		frappe.log_error(title="Email inquiry: pipeline not created", reference_doctype="Communication")


def _handle(doc):
	if doc.doctype != "Communication" or doc.sent_or_received != "Received":
		return
	# Already filed: a reply threaded onto an existing pipeline, or a record
	# someone linked by hand.
	if doc.reference_doctype and doc.reference_name:
		return
	if not doc.email_account:
		return

	account = frappe.db.get_value(
		"Email Account", doc.email_account, ["email_id", "create_lead_from_incoming_email"], as_dict=True
	)
	if not account or not account.create_lead_from_incoming_email:
		return

	sender = (doc.sender or "").strip().lower()
	if not sender or sender == (account.email_id or "").strip().lower():
		return

	if not is_inquiry(doc):
		return

	deal = find_pipeline_for_email(sender) or _create_pipeline(doc, sender)

	doc.reference_doctype = "CRM Deal"
	doc.reference_name = deal
	doc.save(ignore_permissions=True)


def is_inquiry(doc) -> bool:
	"""Whether this email deserves a pipeline at all.

	Every email counts for now. This is the single place a junk/relevance check
	(planned: an AI review of the message) plugs in; return False to drop it.
	"""
	return True


def find_pipeline_for_email(email: str) -> str | None:
	"""The newest pipeline for this email address, open ones first.

	Matches the pipeline's own email and its linked contacts' emails, so a
	pipeline whose primary contact changed is still found.
	"""
	rows = frappe.db.sql(
		"""
		select d.name
		from `tabCRM Deal` d
		left join `tabCRM Deal Status` s on s.name = d.status
		where lower(d.email) = %(email)s
			or d.name in (
				select dc.parent
				from `tabCRM Contacts` dc
				join `tabContact Email` ce on ce.parent = dc.contact and ce.parenttype = 'Contact'
				where dc.parenttype = 'CRM Deal' and dc.parentfield = 'contacts'
					and lower(ce.email_id) = %(email)s
			)
		order by coalesce(s.type, '') in ('Won', 'Lost'), d.creation desc
		limit 1
		""",
		{"email": email},
	)
	return rows[0][0] if rows else None


def _create_pipeline(doc, sender: str) -> str:
	first_name, last_name = _split_name(doc.sender_full_name, sender)
	contact = _find_contact(sender) or _create_contact(first_name, last_name, sender)

	deal = frappe.new_doc("CRM Deal")
	deal.first_name = first_name
	deal.last_name = last_name
	deal.append("contacts", {"contact": contact, "is_primary": 1})
	deal.status = STAGE if frappe.db.exists("CRM Deal Status", STAGE) else None
	deal.source = _ensure_source()
	if deal.meta.has_field(ORIGIN_FIELD):
		deal.set(ORIGIN_FIELD, EMAIL)
	# Unassigned on purpose: the sales team picks these up from the board.
	# No value or close date yet, so forecasting's mandatory fields are skipped.
	deal.flags.from_inquiry = True
	deal.insert(ignore_permissions=True)
	return deal.name


def _split_name(full_name: str | None, sender: str) -> tuple[str, str]:
	parts = (full_name or "").split()
	if not parts:
		return sender.split("@")[0], ""
	return parts[0], " ".join(parts[1:])


def _find_contact(email: str) -> str | None:
	rows = frappe.db.sql(
		"""
		select c.name
		from `tabContact` c
		join `tabContact Email` e on e.parent = c.name and e.parenttype = 'Contact'
		where lower(e.email_id) = %(email)s
		order by c.creation desc
		limit 1
		""",
		{"email": email},
	)
	return rows[0][0] if rows else None


def _create_contact(first_name: str, last_name: str, email: str) -> str:
	contact = frappe.new_doc("Contact")
	contact.first_name = first_name
	contact.last_name = last_name
	contact.append("email_ids", {"email_id": email, "is_primary": 1})
	contact.insert(ignore_permissions=True)
	return contact.name


def _ensure_source() -> str:
	"""The 'Email' source record, created once if missing."""
	if not frappe.db.exists("CRM Lead Source", SOURCE):
		frappe.get_doc({"doctype": "CRM Lead Source", "source_name": SOURCE}).insert(ignore_permissions=True)
	return SOURCE