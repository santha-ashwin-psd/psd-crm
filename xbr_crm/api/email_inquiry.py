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

from xbr_crm.api import contact_form
from xbr_crm.api.lead_origin import EMAIL, ORIGIN_FIELD

# Where a pipeline from email starts. A site without this stage uses the
# board's first Open stage instead (e.g. "New"); see entry_stage().
STAGE = "Interested Leads"

SOURCE = "Email"


def entry_stage() -> str | None:
	"""The stage new inquiry pipelines start in: STAGE when the site has it,
	otherwise the first Open stage on the board."""
	from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status

	return STAGE if frappe.db.exists("CRM Deal Status", STAGE) else default_deal_status()


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
	if not doc.email_account:
		return

	account = frappe.db.get_value(
		"Email Account", doc.email_account, ["email_id", "create_lead_from_incoming_email"], as_dict=True
	)
	if not account or not account.create_lead_from_incoming_email:
		return

	# A website form submission is about the person in the form, not its sender
	# (always the website's own address). Checked before the "already filed" test:
	# mail threading by subject would otherwise put every submission on the first
	# one's pipeline.
	form = contact_form.form_for(doc)
	if form:
		deal = contact_form.handle(doc, form)
		if deal:
			doc.reference_doctype = "CRM Deal"
			doc.reference_name = deal
			doc.save(ignore_permissions=True)
		return

	# Already filed: a reply threaded onto an existing pipeline, or a record
	# someone linked by hand.
	if doc.reference_doctype and doc.reference_name:
		return

	sender = (doc.sender or "").strip().lower()
	if not sender or sender == (account.email_id or "").strip().lower():
		return

	deal = find_pipeline_for_email(sender)
	if not deal:
		if not is_inquiry(doc):
			return
		deal = _create_pipeline(doc, sender)

	doc.reference_doctype = "CRM Deal"
	doc.reference_name = deal
	doc.save(ignore_permissions=True)


def is_inquiry(doc) -> bool:
	"""Whether this email deserves a new pipeline at all.

	With the AI assistant on, the model reads it first: spam, newsletters and
	auto-replies are dropped (and logged as a Skipped CRM AI Decision). Its stage
	pick rides along on doc.flags for _create_pipeline, as a suggestion only: the
	pipeline still starts in STAGE. With AI off, or out of reach, every email
	counts. Replies from senders who already have a pipeline never come here:
	they are filed on that pipeline whatever they say.
	"""
	from xbr_crm.ai import pipeline as ai

	decision = ai.screen_new_email(doc)
	if ai.is_junk(decision):
		ai.log(None, "Skipped", decision, reference_doctype="Communication", reference_name=doc.name)
		return False
	doc.flags.ai_decision = decision
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
	deal.status = entry_stage()
	deal.source = _ensure_source()
	if deal.meta.has_field(ORIGIN_FIELD):
		deal.set(ORIGIN_FIELD, EMAIL)
	# Unassigned on purpose: the sales team picks these up from the board.
	# No value or close date yet, so forecasting's mandatory fields are skipped.
	deal.flags.from_inquiry = True
	from xbr_crm.ai import pipeline as ai

	ai.apply_to_new_pipeline(deal, doc.flags.get("ai_decision"))
	deal.insert(ignore_permissions=True)
	ai.after_new_pipeline(deal)
	# This email was just read to create the pipeline; no second review for it.
	doc.flags.ai_screened = bool(doc.flags.get("ai_decision"))
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