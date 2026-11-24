# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Website contact form emails: each submission is its own pipeline. AI is
switched off here (or stubbed), so these tests never reach the network."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from xbr_crm.api import contact_form
from xbr_crm.api.test_email_inquiry import TestEmailInquiry, expected_stage

FORM_SENDER = "info@psdigitise.com"
SUBJECT = "PSDigitise - New Contact Form Submission"


def form_html(**answers):
	values = {
		"Name": "Ravi Kumar",
		"Phone": "+91 98765 43210",
		"Email": "ravi@acme-auto.example.com",
		"Company": "Acme Auto Parts",
		"Current software": "Tally Prime",
		"Industry": "Auto Ancillaries / Components",
		"Users": "6-15 users",
		"Timeline": "1-3 months",
		"Service": "ERPNext Implementation, Frappe HRMS",
		"Message": "We want to move our accounts and stock from Tally to ERPNext.",
	}
	values.update(answers)
	rows = "".join(
		f"<tr><td><strong>{label}:</strong></td><td>{value}</td></tr>" for label, value in values.items() if value
	)
	return (
		"<h2>New Contact Form Submission</h2><p>A new form submission has been received.</p>"
		f"<table>{rows}</table><p>Submission Date: 2026-11-23 19:49:02</p>"
	)


ALL_SERVICES = (
	"ERPNext Implementation, Frappe HRMS, Frappe CRM, Frappe Helpdesk, Frappe LMS, ERPNext Customisation, "
	"Frappe Cloud Hosting, ERPNext Migration or Upgrade, ERPNext AMC & Support, Not sure — need advice"
)


class TestContactForm(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for field in ("auto_reopen_on_new_communication", "auto_mark_replied_on_response", "update_timestamp_on_new_communication"):
			frappe.db.set_single_value("FCRM Settings", field, 0)
		frappe.db.set_single_value("FCRM Settings", "ai_enabled", 0)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		self.account = TestEmailInquiry._make_email_account(self)
		if not frappe.db.exists("CRM Deal Status", contact_form.FORM_STAGE):
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": contact_form.FORM_STAGE, "type": "Open", "position": 99}).insert()
		if not frappe.db.exists("CRM Deal Status", contact_form.JUNK_STAGE):
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": contact_form.JUNK_STAGE, "type": "Lost"}).insert()
		enqueue = patch("frappe.enqueue")
		enqueue.start()
		self.addCleanup(enqueue.stop)

	def tearDown(self):
		frappe.db.rollback()
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")

	def submit(self, **answers):
		return TestEmailInquiry.receive(
			self, FORM_SENDER, "PSDigitise", subject=SUBJECT, content=form_html(**answers)
		)

	def deals(self, email="ravi@acme-auto.example.com"):
		return frappe.get_all("CRM Deal", filters={"email": email}, pluck="name", order_by="creation asc")

	# ------------------------------------------------------------ reading

	def test_reads_the_form_table(self):
		data = contact_form.parse(form_html())
		self.assertEqual(data["name"], "Ravi Kumar")
		self.assertEqual(data["email"], "ravi@acme-auto.example.com")
		self.assertEqual(data["company"], "Acme Auto Parts")
		self.assertEqual(data["services"], ["ERPNext Implementation", "Frappe HRMS"])
		self.assertEqual(data["submitted_on"], "2026-11-23 19:49:02")

	def test_reads_plain_text(self):
		data = contact_form.parse("Name: Asha Rao\nEmail: asha@example.com\nService: Frappe CRM")
		self.assertEqual((data["name"], data["email"], data["services"]), ("Asha Rao", "asha@example.com", ["Frappe CRM"]))

	def test_reads_labels_and_values_in_separate_blocks(self):
		html = (
			"<div><b>Name:</b></div><div>Asha Rao</div>"
			"<div><b>Email:</b></div><div>asha@example.com</div>"
			"<div><b>Phone:</b></div><div>+1 (265) 983-4714</div>"
		)
		data = contact_form.parse(html)
		self.assertEqual(
			(data["name"], data["email"], data["phone"]), ("Asha Rao", "asha@example.com", "+1 (265) 983-4714")
		)

	def test_other_emails_from_the_website_are_not_forms(self):
		comm = frappe._dict(sender=FORM_SENDER, subject="Your invoice")
		self.assertIsNone(contact_form.form_for(comm))
		comm = frappe._dict(sender="someone@example.com", subject=SUBJECT)
		self.assertIsNone(contact_form.form_for(comm))

	# ------------------------------------------------------------ new pipelines

	def test_each_submission_is_its_own_pipeline(self):
		comm = self.submit()
		self.submit(Name="Meena Iyer", Email="meena@example.com")

		[name] = self.deals()
		deal = frappe.get_doc("CRM Deal", name)
		self.assertEqual(deal.status, contact_form.FORM_STAGE)
		self.assertEqual((deal.first_name, deal.last_name), ("Ravi", "Kumar"))
		self.assertEqual(deal.mobile_no, "+919876543210")
		self.assertEqual(deal.organization, "Acme Auto Parts")
		self.assertEqual(deal.industry, "Auto Ancillaries / Components")
		self.assertEqual(deal.custom_current_software, "Tally Prime")
		self.assertEqual(deal.custom_user_count, "6-15 users")
		self.assertEqual(deal.custom_start_timeline, "1-3 months")
		self.assertEqual([r.service for r in deal.custom_services], ["ERPNext Implementation", "Frappe HRMS"])
		self.assertEqual(deal.source, "Website")
		self.assertEqual(deal.custom_created_via, "Website")
		comm.reload()
		self.assertEqual(comm.reference_name, name)

		self.assertEqual(len(self.deals("meena@example.com")), 1)
		self.assertFalse(frappe.get_all("CRM Deal", filters={"email": FORM_SENDER}))

	def test_without_the_interested_stage_it_starts_in_the_entry_stage(self):
		with patch("xbr_crm.api.contact_form.FORM_STAGE", "No Such Stage"):
			self.submit()
		self.assertEqual(frappe.db.get_value("CRM Deal", self.deals()[0], "status"), expected_stage())

	def test_without_any_named_stage_it_starts_in_the_first_open_stage(self):
		from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status

		with (
			patch("xbr_crm.api.contact_form.FORM_STAGE", "No Such Stage"),
			patch("xbr_crm.api.email_inquiry.STAGE", "No Such Stage Either"),
		):
			self.submit()
		status = frappe.db.get_value("CRM Deal", self.deals()[0], "status")
		self.assertEqual(status, default_deal_status())
		self.assertEqual(frappe.get_cached_value("CRM Deal Status", status, "type"), "Open")

	def test_the_message_is_kept_as_a_note(self):
		self.submit()
		[name] = self.deals()
		content = frappe.db.get_value("FCRM Note", {"reference_docname": name}, "content")
		self.assertIn("move our accounts and stock", content)

	def test_unknown_software_is_other(self):
		self.submit(**{"Current software": "Zoho Books"})
		self.assertEqual(frappe.db.get_value("CRM Deal", self.deals()[0], "custom_current_software"), "Other")

	def test_no_way_to_reach_the_person_files_nothing(self):
		comm = self.submit(Email="", Phone="")
		comm.reload()
		self.assertFalse(comm.reference_name)

	# ------------------------------------------------------------ spam

	def test_ticking_every_service_goes_straight_to_junk(self):
		self.submit(Service=ALL_SERVICES, Message="My co-worker Archer has one of these. He says it looks crooked.")
		deal = frappe.get_doc("CRM Deal", self.deals()[0])
		self.assertEqual(deal.status, contact_form.JUNK_STAGE)
		self.assertEqual(deal.lost_reason, contact_form.SPAM_REASON)
		self.assertIn("10 of 10", deal.lost_notes)

	def test_a_link_in_the_message_is_spam(self):
		self.submit(Message="Get more traffic at https://seo.example.com")
		self.assertEqual(frappe.db.get_value("CRM Deal", self.deals()[0], "status"), contact_form.JUNK_STAGE)

	def test_ai_can_mark_spam(self):
		frappe.db.set_single_value("FCRM Settings", "ai_enabled", 1)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		with (
			patch("xbr_crm.ai.pipeline.api_key", return_value="test-key"),
			patch("xbr_crm.ai.client.chat_json", return_value={"spam": True, "confidence": 95, "reason": "An SEO pitch."}),
		):
			self.submit(Message="We offer guaranteed first page ranking for your website.")
		deal = frappe.get_doc("CRM Deal", self.deals()[0])
		self.assertEqual(deal.status, contact_form.JUNK_STAGE)
		self.assertIn("An SEO pitch.", deal.lost_notes)

	def test_unsure_ai_keeps_the_pipeline_open(self):
		frappe.db.set_single_value("FCRM Settings", "ai_enabled", 1)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		with (
			patch("xbr_crm.ai.pipeline.api_key", return_value="test-key"),
			patch("xbr_crm.ai.client.chat_json", return_value={"spam": True, "confidence": 40, "reason": "Maybe."}),
		):
			self.submit()
		self.assertEqual(frappe.db.get_value("CRM Deal", self.deals()[0], "status"), contact_form.FORM_STAGE)

	def test_repeat_spam_stays_on_one_junk_pipeline(self):
		self.submit(Service=ALL_SERVICES)
		self.submit(Service=ALL_SERVICES)
		self.assertEqual(len(self.deals()), 1)

	# ------------------------------------------------------------ same person again

	def test_same_person_again_goes_on_the_open_pipeline_and_notifies(self):
		self.submit()
		[name] = self.deals()
		frappe.db.set_value("CRM Deal", name, "deal_owner", self._sales_user())

		comm = self.submit(Service="Frappe CRM", Message="Also interested in CRM.")
		self.assertEqual(self.deals(), [name])
		comm.reload()
		self.assertEqual(comm.reference_name, name)
		self.assertEqual(frappe.db.count("FCRM Note", {"reference_docname": name}), 2)
		services = [r.service for r in frappe.get_doc("CRM Deal", name).custom_services]
		self.assertEqual(services, ["ERPNext Implementation", "Frappe HRMS", "Frappe CRM"])
		self.assertTrue(
			frappe.db.exists(
				"CRM Notification",
				{"to_user": self._sales_user(), "type": "Enquiry", "reference_name": name},
			)
		)

	def test_same_person_after_closing_gets_a_new_pipeline(self):
		self.submit()
		[name] = self.deals()
		won = frappe.db.get_value("CRM Deal Status", {"type": "Won"}, "name")
		frappe.db.set_value("CRM Deal", name, "status", won)
		self.submit()
		self.assertEqual(len(self.deals()), 2)

	def _sales_user(self):
		email = "form.owner@example.com"
		if not frappe.db.exists("User", email):
			user = frappe.get_doc(
				{"doctype": "User", "email": email, "first_name": "Form", "send_welcome_email": 0}
			)
			user.append("roles", {"role": "Sales User"})
			user.insert(ignore_permissions=True)
		return email
