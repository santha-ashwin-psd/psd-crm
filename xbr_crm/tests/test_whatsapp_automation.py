# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""WhatsApp automation (xbr_crm/whatsapp_automation.py).

Nothing here reaches Meta: the one network call frappe_whatsapp makes when a
message is saved (make_post_request) is replaced by a recorder. The suites that
need frappe_whatsapp skip on a site that does not have it installed.
"""

import json
import unittest
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import now_datetime

from xbr_crm import whatsapp_automation as wa

ACCOUNT = "_Test CRM WhatsApp"
TEMPLATE = "_test_crm_template-en"
USER = "test_wa_user@example.com"
SWITCHES = {
	"whatsapp_reminders": 0,
	"whatsapp_reminder_template": None,
	"whatsapp_follow_ups": 0,
	"whatsapp_follow_up_template": None,
	"whatsapp_creates_pipeline": 0,
}


def _set(values):
	for field, value in values.items():
		frappe.db.set_single_value("FCRM Settings", field, value)
	frappe.clear_document_cache("FCRM Settings", "FCRM Settings")


class TestWhatsAppAutomationOff(FrappeTestCase):
	"""Off by default, and silent when switched off or WhatsApp is missing."""

	def setUp(self):
		_set(SWITCHES)

	def tearDown(self):
		_set(SWITCHES)

	def test_everything_off_by_default(self):
		meta = frappe.get_meta("FCRM Settings")
		for field in ("whatsapp_reminders", "whatsapp_follow_ups", "whatsapp_creates_pipeline"):
			self.assertEqual(meta.get_field(field).default, "0", field)

	def test_switched_off_sends_nothing(self):
		with patch.object(wa, "send_template", side_effect=AssertionError("sent while off")):
			recipient = SimpleNamespace(user="Administrator", full_name="Admin", email="a@example.com")
			reminder = SimpleNamespace(title="Call", reference_doctype="Event", reference_name="EV-1")
			self.assertIsNone(wa.send_reminder(reminder, recipient, "today"))
			wa.send_due_follow_ups(now_datetime())
			msg = SimpleNamespace(type="Incoming", get=lambda k, d=None: "+919800000001")
			self.assertIsNone(wa.create_pipeline_for_unknown_number(msg))

	def test_switch_without_template_sends_nothing(self):
		_set({"whatsapp_reminders": 1, "whatsapp_follow_ups": 1})
		with patch.object(wa, "send_template", side_effect=AssertionError("sent without template")):
			recipient = SimpleNamespace(user="Administrator", full_name="Admin", email="a@example.com")
			reminder = SimpleNamespace(title="Call", reference_doctype="Event", reference_name="EV-1")
			self.assertIsNone(wa.send_reminder(reminder, recipient, "today"))
			wa.send_due_follow_ups(now_datetime())

	def test_without_whatsapp_app_nothing_is_attempted(self):
		_set({"whatsapp_reminders": 1, "whatsapp_reminder_template": TEMPLATE})
		with (
			patch.object(wa, "is_available", return_value=False),
			patch.object(wa, "send_template", side_effect=AssertionError("sent without app")),
		):
			recipient = SimpleNamespace(user="Administrator", full_name="Admin", email="a@example.com")
			reminder = SimpleNamespace(title="Call", reference_doctype="Event", reference_name="EV-1")
			self.assertIsNone(wa.send_reminder(reminder, recipient, "today"))


@unittest.skipUnless(
	"frappe_whatsapp" in frappe.get_installed_apps(), "frappe_whatsapp is not installed on this site"
)
class TestWhatsAppAutomation(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Inserted without hooks: saving an account subscribes it at Meta, and
		# saving a template submits it for approval.
		if not frappe.db.exists("WhatsApp Account", ACCOUNT):
			acc = frappe.new_doc("WhatsApp Account")
			acc.update(
				{
					"name": ACCOUNT,
					"account_name": ACCOUNT,
					"url": "https://graph.example.invalid",
					"version": "v17.0",
					"phone_id": "000000",
					"status": "Active",
					"is_default_incoming": 1,
					"is_default_outgoing": 1,
				}
			)
			acc.db_insert()
			# frappe_whatsapp reads the token before calling Meta; any value will
			# do, the call itself is replaced in setUp.
			from frappe.utils.password import set_encrypted_password

			set_encrypted_password("WhatsApp Account", ACCOUNT, "test-token", "token")
		if not frappe.db.exists("WhatsApp Templates", TEMPLATE):
			tpl = frappe.new_doc("WhatsApp Templates")
			tpl.update(
				{
					"name": TEMPLATE,
					"template_name": "_test_crm_template",
					"actual_name": "_test_crm_template",
					"template": "Hi {{1}}, {{2}} {{3}}",
					"language_code": "en",
					"category": "UTILITY",
					"status": "APPROVED",
					"sample_values": "a,b,c",
				}
			)
			tpl.db_insert()
		frappe.db.commit()

	@classmethod
	def tearDownClass(cls):
		frappe.db.delete("WhatsApp Templates", {"name": TEMPLATE})
		frappe.db.delete("WhatsApp Account", {"name": ACCOUNT})
		frappe.db.delete("__Auth", {"doctype": "WhatsApp Account", "name": ACCOUNT})
		frappe.db.commit()
		super().tearDownClass()

	def setUp(self):
		frappe.set_user("Administrator")
		_set(SWITCHES)
		self.sent = []
		self.created = []

		def fake_post(url, headers=None, data=None):
			self.sent.append(json.loads(data))
			return {"messages": [{"id": f"wamid.test{len(self.sent)}"}]}

		self._post = patch(
			"frappe_whatsapp.frappe_whatsapp.doctype.whatsapp_message.whatsapp_message.make_post_request",
			side_effect=fake_post,
		)
		self._post.start()

	def tearDown(self):
		self._post.stop()
		_set(SWITCHES)
		frappe.set_user("Administrator")
		for doctype, name in reversed(self.created):
			if frappe.db.exists(doctype, name):
				frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		frappe.db.delete("WhatsApp Message", {"whatsapp_account": ACCOUNT})
		frappe.db.commit()

	def params(self, payload):
		return [p["text"] for p in payload["template"]["components"][0]["parameters"]]

	# ---- 1. reminders to the team ------------------------------------------

	def _user(self, mobile):
		if not frappe.db.exists("User", USER):
			frappe.get_doc(
				{"doctype": "User", "email": USER, "first_name": "Wa", "send_welcome_email": 0}
			).insert(ignore_permissions=True)
		frappe.db.set_value("User", USER, "mobile_no", mobile)
		return SimpleNamespace(user=USER, full_name="Wa Tester", email=USER)

	def test_reminder_is_sent_to_the_users_mobile(self):
		_set({"whatsapp_reminders": 1, "whatsapp_reminder_template": TEMPLATE})
		recipient = self._user("+919800000010")
		reminder = SimpleNamespace(title="Demo call", reference_doctype="User", reference_name=USER)
		note = wa.send_reminder(reminder, recipient, "Mon 10:00")
		self.assertEqual(note, "Also sent on WhatsApp.")
		self.assertEqual(len(self.sent), 1)
		self.assertEqual(self.sent[0]["to"], "919800000010")
		self.assertEqual(self.sent[0]["template"]["name"], "_test_crm_template")
		self.assertEqual(self.params(self.sent[0]), ["Wa Tester", "Demo call", "Mon 10:00"])

	def test_reminder_user_without_mobile_is_noted_not_sent(self):
		_set({"whatsapp_reminders": 1, "whatsapp_reminder_template": TEMPLATE})
		recipient = self._user(None)
		reminder = SimpleNamespace(title="Demo call", reference_doctype="User", reference_name=USER)
		self.assertIn("no mobile number", wa.send_reminder(reminder, recipient, "Mon 10:00"))
		self.assertEqual(self.sent, [])

	def test_reminder_meta_error_is_reported_not_raised(self):
		_set({"whatsapp_reminders": 1, "whatsapp_reminder_template": TEMPLATE})
		recipient = self._user("+919800000010")
		reminder = SimpleNamespace(title="Demo call", reference_doctype="User", reference_name=USER)
		with patch.object(wa, "send_template", side_effect=Exception("token expired")):
			self.assertIn("token expired", wa.send_reminder(reminder, recipient, "Mon 10:00"))

	# ---- 2. follow-ups to customers ----------------------------------------

	def _deal(self, mobile, follow_up):
		contact = frappe.get_doc({"doctype": "Contact", "first_name": "Priya", "last_name": "Test"})
		if mobile:
			contact.append("phone_nos", {"phone": mobile, "is_primary_mobile_no": 1})
		contact.insert(ignore_permissions=True)
		self.created.append(("Contact", contact.name))

		from xbr_crm.follow_ups import follow_up_stage

		deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"first_name": "Priya",
				"status": follow_up_stage(),
				"next_follow_up": now_datetime() + timedelta(days=1),
				"contacts": [{"contact": contact.name, "is_primary": 1}],
			}
		)
		deal.flags.from_inquiry = True
		deal.insert(ignore_permissions=True)
		self.created.append(("CRM Deal", deal.name))
		frappe.db.set_value("CRM Deal", deal.name, "next_follow_up", follow_up, update_modified=False)
		return deal.name

	def _logs(self, deal):
		return frappe.get_all(
			"CRM Reminder Log",
			filters={"reference_name": deal, "reminder_type": wa.FOLLOW_UP_REMINDER_TYPE},
			fields=["name", "status", "message"],
		)

	def tearDown_logs(self, deal):
		for log in self._logs(deal):
			frappe.delete_doc("CRM Reminder Log", log.name, force=True, ignore_permissions=True)

	def test_follow_up_sent_once_when_due(self):
		_set({"whatsapp_follow_ups": 1, "whatsapp_follow_up_template": TEMPLATE})
		now = now_datetime().replace(microsecond=0)
		deal = self._deal("+919800000020", now - timedelta(minutes=1))
		try:
			wa.send_due_follow_ups(now)
			wa.send_due_follow_ups(now + timedelta(minutes=1))  # a second tick: no repeat
			self.assertEqual(len(self.sent), 1)
			self.assertEqual(self.sent[0]["to"], "919800000020")
			self.assertEqual(self.params(self.sent[0])[0], "Priya")
			self.assertEqual([log.status for log in self._logs(deal)], ["Sent"])
		finally:
			self.tearDown_logs(deal)

	def test_follow_up_not_due_or_too_late_is_not_sent(self):
		_set({"whatsapp_follow_ups": 1, "whatsapp_follow_up_template": TEMPLATE})
		now = now_datetime().replace(microsecond=0)
		future = self._deal("+919800000021", now + timedelta(hours=2))
		late = self._deal("+919800000022", now - timedelta(minutes=wa.GRACE_MINUTES + 10))
		try:
			wa.send_due_follow_ups(now)
			self.assertEqual(self.sent, [])
		finally:
			self.tearDown_logs(future)
			self.tearDown_logs(late)

	def test_follow_up_contact_without_mobile_is_skipped(self):
		_set({"whatsapp_follow_ups": 1, "whatsapp_follow_up_template": TEMPLATE})
		now = now_datetime().replace(microsecond=0)
		deal = self._deal(None, now - timedelta(minutes=1))
		try:
			wa.send_due_follow_ups(now)
			self.assertEqual(self.sent, [])
			self.assertEqual([log.status for log in self._logs(deal)], ["Skipped"])
		finally:
			self.tearDown_logs(deal)

	# ---- 3. pipelines from WhatsApp ----------------------------------------

	def _incoming(self, number, profile="Ravi Kumar"):
		msg = frappe.get_doc(
			{
				"doctype": "WhatsApp Message",
				"type": "Incoming",
				"from": number,
				"message": "Hi, I want a quote",
				"content_type": "text",
				"profile_name": profile,
				"whatsapp_account": ACCOUNT,
			}
		)
		msg.insert(ignore_permissions=True)
		return msg

	def test_unknown_number_creates_contact_and_pipeline(self):
		from xbr_crm.api.lead_origin import ORIGIN_FIELD

		_set({"whatsapp_creates_pipeline": 1})
		msg = self._incoming("919811122233")
		self.assertEqual(msg.reference_doctype, "CRM Deal")
		deal = frappe.get_doc("CRM Deal", msg.reference_name)
		self.created.append(("CRM Deal", deal.name))
		self.created.append(("Contact", deal.contacts[0].contact))
		self.assertEqual(deal.first_name, "Ravi")
		self.assertEqual(deal.source, "WhatsApp")
		if deal.meta.has_field(ORIGIN_FIELD):
			self.assertEqual(deal.get(ORIGIN_FIELD), "WhatsApp")
		self.assertEqual(deal.mobile_no, "+919811122233")

		# The same number again joins the pipeline rather than making another.
		again = self._incoming("919811122233")
		self.assertEqual(again.reference_name, deal.name)

	def test_unknown_number_switched_off_creates_nothing(self):
		before = frappe.db.count("CRM Deal")
		msg = self._incoming("919811122299")
		self.assertFalse(msg.reference_name)
		self.assertEqual(frappe.db.count("CRM Deal"), before)
