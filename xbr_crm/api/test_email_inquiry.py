# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for email inquiry capture: an incoming email becomes a pipeline, never a lead."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from xbr_crm.api import email_inquiry
from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status

MAILBOX = "test-crm-incoming@example.com"


def expected_stage():
	if frappe.db.exists("CRM Deal Status", email_inquiry.STAGE):
		return email_inquiry.STAGE
	return default_deal_status()


class TestEmailInquiry(IntegrationTestCase):
	def setUp(self):
		frappe.db.set_single_value("FCRM Settings", "auto_reopen_on_new_communication", 0)
		frappe.db.set_single_value("FCRM Settings", "auto_mark_replied_on_response", 0)
		frappe.db.set_single_value("FCRM Settings", "update_timestamp_on_new_communication", 0)
		self.account = self._make_email_account()

	def tearDown(self):
		frappe.db.rollback()

	def _make_email_account(self, enabled=1):
		name = "Test CRM Incoming" if enabled else "Test CRM Incoming Off"
		if frappe.db.exists("Email Account", name):
			frappe.db.set_value("Email Account", name, "create_lead_from_incoming_email", enabled)
			return frappe.get_doc("Email Account", name)
		account = frappe.get_doc(
			{
				"doctype": "Email Account",
				"email_account_name": name,
				"email_id": MAILBOX if enabled else "test-crm-off@example.com",
				"enable_incoming": 1,
				"create_lead_from_incoming_email": enabled,
			}
		)
		account.flags.ignore_mandatory = True
		account.flags.ignore_validate = True
		account.insert(ignore_permissions=True)
		return account

	def receive(self, sender, full_name=None, account=None, **kwargs):
		doc = frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_type": "Communication",
				"communication_medium": "Email",
				"sent_or_received": "Received",
				"subject": "Course enquiry",
				"sender": sender,
				"sender_full_name": full_name,
				"email_account": (account or self.account).name,
				**kwargs,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc

	def pipelines_for(self, email):
		return frappe.get_all("CRM Deal", filters={"email": email}, pluck="name")

	def test_email_creates_pipeline_not_lead(self):
		leads_before = frappe.db.count("CRM Lead")
		comm = self.receive("priya.sharma@example.com", "Priya Sharma")

		[name] = self.pipelines_for("priya.sharma@example.com")
		deal = frappe.get_doc("CRM Deal", name)
		self.assertEqual(deal.status, expected_stage())
		self.assertEqual((deal.first_name, deal.last_name), ("Priya", "Sharma"))
		self.assertEqual(deal.source, "Email")
		self.assertEqual(deal.custom_created_via, "Email")
		self.assertFalse(deal.deal_owner)
		self.assertEqual(frappe.db.count("CRM Lead"), leads_before)

		comm.reload()
		self.assertEqual((comm.reference_doctype, comm.reference_name), ("CRM Deal", name))

	def test_repeat_email_attaches_to_existing_pipeline(self):
		self.receive("repeat@example.com", "Repeat Sender")
		[name] = self.pipelines_for("repeat@example.com")

		second = self.receive("Repeat@Example.com", "Repeat Sender")

		self.assertEqual(self.pipelines_for("repeat@example.com"), [name])
		second.reload()
		self.assertEqual(second.reference_name, name)

	def test_closed_pipeline_still_blocks_a_duplicate(self):
		self.receive("closed@example.com", "Closed Sender")
		[name] = self.pipelines_for("closed@example.com")
		lost = frappe.get_all("CRM Deal Status", filters={"type": "Lost"}, pluck="name", limit=1)
		if lost:
			frappe.db.set_value("CRM Deal", name, "status", lost[0])

		self.receive("closed@example.com", "Closed Sender")

		self.assertEqual(self.pipelines_for("closed@example.com"), [name])

	def test_existing_contact_is_reused(self):
		contact = frappe.get_doc(
			{"doctype": "Contact", "first_name": "Known", "email_ids": [{"email_id": "known@example.com"}]}
		).insert(ignore_permissions=True)

		self.receive("known@example.com", "Known Person")

		[name] = self.pipelines_for("known@example.com")
		deal = frappe.get_doc("CRM Deal", name)
		self.assertEqual([c.contact for c in deal.contacts], [contact.name])

	def test_name_falls_back_to_email_prefix(self):
		self.receive("noname@example.com")
		[name] = self.pipelines_for("noname@example.com")
		self.assertEqual(frappe.db.get_value("CRM Deal", name, "first_name").lower(), "noname")

	def test_threaded_reply_is_left_alone(self):
		self.receive("thread@example.com", "Thread Person")
		[name] = self.pipelines_for("thread@example.com")

		self.receive("other@example.com", reference_doctype="CRM Deal", reference_name=name)

		self.assertEqual(self.pipelines_for("other@example.com"), [])

	def test_switch_off_creates_nothing(self):
		off = self._make_email_account(enabled=0)
		self.receive("switchedoff@example.com", account=off)
		self.assertEqual(self.pipelines_for("switchedoff@example.com"), [])

	def test_sent_email_creates_nothing(self):
		self.receive("outbound@example.com", sent_or_received="Sent")
		self.assertEqual(self.pipelines_for("outbound@example.com"), [])

	def test_mailbox_own_address_creates_nothing(self):
		self.receive(MAILBOX)
		self.assertEqual(self.pipelines_for(MAILBOX), [])

	def test_rejected_by_inquiry_check(self):
		with patch.object(email_inquiry, "is_inquiry", return_value=False):
			self.receive("junk@example.com", "Junk Sender")
		self.assertEqual(self.pipelines_for("junk@example.com"), [])

	def test_failure_does_not_block_the_email(self):
		with patch.object(email_inquiry, "_create_pipeline", side_effect=Exception("boom")):
			comm = self.receive("broken@example.com", "Broken")
		self.assertTrue(frappe.db.exists("Communication", comm.name))
		self.assertEqual(self.pipelines_for("broken@example.com"), [])
