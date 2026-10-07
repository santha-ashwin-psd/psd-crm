# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for the Leads on/off switch (`FCRM Settings.enable_leads`).

The setting itself is never written here: the switch is read through
`xbr_crm.utils.leads._setting`, which each test patches, so running the suite
cannot leave the site with Leads switched on or off.
"""

import json
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.api.activities import _without_lead_history
from xbr_crm.utils import leads
from xbr_crm.utils.leads import LEAD_DASHBOARD_CARDS, guard_lead_write, hidden_lead_fields


class _FakeRequest:
	"""Stands in for a browser request, so "a person is using the UI" is true."""

	host = "crm.local"
	method = "POST"
	path = "/api/method/frappe.client.insert"
	url = "http://crm.local/api/method/frappe.client.insert"

	def __init__(self):
		self.headers = {}


class TestLeadsSwitch(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.flags.leads_switch_under_test = True
		self._orig_request = getattr(frappe.local, "request", None)

	def tearDown(self):
		frappe.flags.pop("leads_switch_under_test", None)
		frappe.local.request = self._orig_request

	def _switch(self, enabled: bool):
		return patch.object(leads, "_setting", return_value=enabled)

	def _lead(self):
		return frappe.get_doc({"doctype": "CRM Lead", "first_name": "Switch"})

	# -- the flag itself -----------------------------------------------------

	def test_other_suites_see_leads_as_enabled(self):
		"""Without the opt-in flag, tests run as if Leads were on."""
		frappe.flags.pop("leads_switch_under_test", None)
		with self._switch(False):
			self.assertTrue(leads.leads_enabled())

	def test_follows_setting_when_under_test(self):
		for value in (True, False):
			with self.subTest(enabled=value), self._switch(value):
				self.assertEqual(leads.leads_enabled(), value)

	# -- server-side write guard ---------------------------------------------

	def test_user_write_blocked_when_disabled(self):
		frappe.local.request = _FakeRequest()
		with self._switch(False), self.assertRaises(frappe.PermissionError):
			guard_lead_write(self._lead())

	def test_user_write_allowed_when_enabled(self):
		frappe.local.request = _FakeRequest()
		with self._switch(True):
			guard_lead_write(self._lead())

	def test_integration_write_allowed_when_disabled(self):
		"""`ignore_permissions` writes (the website inquiry API) are not blocked."""
		frappe.local.request = _FakeRequest()
		doc = self._lead()
		doc.flags.ignore_permissions = True
		with self._switch(False):
			guard_lead_write(doc)

	def test_background_write_allowed_when_disabled(self):
		"""No HTTP request means a job or the console, not a person in the UI."""
		frappe.local.request = None
		with self._switch(False):
			guard_lead_write(self._lead())

	def test_convert_to_deal_blocked_when_disabled(self):
		from xbr_crm.fcrm.doctype.crm_lead.crm_lead import convert_to_deal

		lead = frappe.get_doc({"doctype": "CRM Lead", "first_name": "Switch Convert"}).insert(
			ignore_permissions=True
		)
		with self._switch(False), self.assertRaises(frappe.PermissionError):
			convert_to_deal(lead.name)

	# -- hidden fields, dashboard, activity ----------------------------------

	def test_deal_lead_fields_hidden_when_disabled(self):
		with self._switch(False):
			self.assertTrue({"lead", "lead_name"} <= hidden_lead_fields("CRM Deal"))
		with self._switch(True):
			self.assertEqual(hidden_lead_fields("CRM Deal"), set())

	def test_dashboard_omits_lead_cards_when_disabled(self):
		from xbr_crm.api.dashboard import get_dashboard

		with self._switch(False):
			names = {card["name"] for card in get_dashboard()}
		self.assertFalse(names & LEAD_DASHBOARD_CARDS)

	def test_dashboard_save_keeps_hidden_lead_cards(self):
		"""A layout saved while Leads are off must not lose the lead cards."""
		from xbr_crm.fcrm.doctype.crm_dashboard.crm_dashboard import create_default_manager_dashboard

		create_default_manager_dashboard()
		doc = frappe.get_doc("CRM Dashboard", "Manager Dashboard")
		without_leads = [c for c in json.loads(doc.layout) if c["name"] not in LEAD_DASHBOARD_CARDS]
		doc.layout = json.dumps(without_leads)
		with self._switch(False):
			doc.save(ignore_permissions=True)
		saved = {c["name"] for c in json.loads(doc.layout)}
		self.assertTrue(LEAD_DASHBOARD_CARDS <= saved)

	def test_deal_activity_drops_lead_record_keeping(self):
		activities = [
			{"activity_type": "creation", "is_lead": True, "data": "created this lead"},
			{"activity_type": "changed", "is_lead": True, "data": {}},
			{"activity_type": "comment", "is_lead": True, "content": "kept"},
			{"activity_type": "communication", "is_lead": True, "data": {}},
		]
		kept = _without_lead_history(activities)
		self.assertEqual([a["activity_type"] for a in kept], ["comment", "communication"])
		self.assertTrue(all(a["is_lead"] is False for a in kept))
