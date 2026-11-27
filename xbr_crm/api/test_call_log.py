# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Numbers filled into a call logged by hand."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, get_datetime, now_datetime

from xbr_crm.api import call_log

AGENT = "call.agent@example.com"


def _user(email, mobile=None):
	if not frappe.db.exists("User", email):
		user = frappe.get_doc({"doctype": "User", "email": email, "first_name": "Agent", "send_welcome_email": 0})
		user.append("roles", {"role": "Sales User"})
		user.insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "mobile_no", mobile)
	return email


class TestCallLogPrefill(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_user(AGENT, "+919000000001")
		contact = frappe.get_doc({"doctype": "Contact", "first_name": "Call"})
		contact.append("phone_nos", {"phone": "+919876543210", "is_primary_mobile_no": 1})
		contact.insert(ignore_permissions=True)
		deal = frappe.get_doc({"doctype": "CRM Deal", "first_name": "Call", "email": "call.deal@example.com"})
		deal.append("contacts", {"contact": contact.name, "is_primary": 1})
		deal.flags.from_inquiry = True
		self.deal = deal.insert(ignore_permissions=True)
		self.contact = contact

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.db.rollback()

	def test_my_number_comes_from_my_profile(self):
		self.assertEqual(call_log.my_number(AGENT), "+919000000001")

	def test_telephony_agent_number_wins(self):
		frappe.get_doc(
			{"doctype": "CRM Telephony Agent", "user": AGENT, "mobile_no": "+919111111111"}
		).insert(ignore_permissions=True)
		frappe.clear_document_cache("CRM Telephony Agent", AGENT)
		self.assertEqual(call_log.my_number(AGENT), "+919111111111")

	def test_the_pipelines_number(self):
		self.assertEqual(call_log.record_number("CRM Deal", self.deal.name), "+919876543210")

	def test_a_pipeline_without_contacts_has_no_number(self):
		bare = frappe.get_doc({"doctype": "CRM Deal", "first_name": "Bare"})
		bare.flags.from_inquiry = True
		bare.insert(ignore_permissions=True)
		self.assertEqual(call_log.record_number("CRM Deal", bare.name), "")

	def test_no_record_means_no_number(self):
		self.assertEqual(call_log.record_number("CRM Deal", "PIPE-NOPE"), "")
		self.assertEqual(call_log.record_number("ToDo", "x"), "")

	def test_prefill(self):
		self.assertEqual(
			call_log.get_prefill("CRM Deal", self.deal.name),
			{"mine": call_log.my_number(), "theirs": "+919876543210"},
		)

	def _log(self, type_):
		return frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"type": type_,
				"status": "Completed",
				"from": "+919000000001",
				"to": "+919876543210",
				"reference_doctype": "CRM Deal",
				"reference_docname": self.deal.name,
			}
		).insert(ignore_permissions=True)

	def test_outgoing_log_records_me_as_caller(self):
		frappe.set_user(AGENT)
		log = self._log("Outgoing")
		self.assertEqual((log.caller, log.receiver, log.telephony_medium), (AGENT, None, "Manual"))

	def test_incoming_log_records_me_as_receiver(self):
		frappe.set_user(AGENT)
		log = self._log("Incoming")
		self.assertEqual((log.caller, log.receiver), (None, AGENT))


class TestCallLogDateTime(IntegrationTestCase):
	"""A call logged later keeps the time it happened."""

	def setUp(self):
		frappe.set_user("Administrator")

	def tearDown(self):
		frappe.db.rollback()

	def log(self, **values):
		return frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"type": "Outgoing",
				"status": "Completed",
				"from": "+919000000001",
				"to": "+919876543210",
				**values,
			}
		).insert(ignore_permissions=True)

	def test_a_call_from_yesterday_is_dated_yesterday(self):
		yesterday = add_to_date(now_datetime(), days=-1).replace(microsecond=0)
		log = self.log(start_time=yesterday, duration=300)
		row = frappe.db.get_value("CRM Call Log", log.name, ["creation", "start_time", "end_time"], as_dict=True)
		self.assertEqual(get_datetime(row.creation), yesterday)
		self.assertEqual(get_datetime(row.start_time), yesterday)
		self.assertEqual(get_datetime(row.end_time), add_to_date(yesterday, seconds=300))

	def test_no_time_given_means_now(self):
		log = self.log()
		self.assertLess(abs((get_datetime(log.start_time) - now_datetime()).total_seconds()), 60)

	def test_a_call_cant_be_in_the_future(self):
		with self.assertRaises(frappe.ValidationError):
			self.log(start_time=add_to_date(now_datetime(), hours=2))

	def test_correcting_the_time_moves_the_call(self):
		log = self.log()
		two_days_ago = add_to_date(now_datetime(), days=-2).replace(microsecond=0)
		log.start_time = two_days_ago
		log.save(ignore_permissions=True)
		self.assertEqual(get_datetime(frappe.db.get_value("CRM Call Log", log.name, "creation")), two_days_ago)

	def test_provider_calls_are_left_alone(self):
		yesterday = add_to_date(now_datetime(), days=-1)
		log = self.log(telephony_medium="Twilio", start_time=yesterday, id="tw-test-1")
		self.assertNotEqual(get_datetime(log.creation).date(), get_datetime(yesterday).date())
