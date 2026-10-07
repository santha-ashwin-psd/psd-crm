# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for `custom_created_via` — how a record got into the CRM.

The thing worth protecting here is that this field stays *independent of*
`source`. `source` is editable by the sales team and is about attribution;
this is the system's own record of mechanism. A test that let them drift into
being the same field would hide a real regression.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.api.lead_origin import API, EMAIL, IMPORT, MANUAL, ORIGIN_FIELD, WEBSITE


class _FakeRequest:
	"""Stands in for a browser request, so "a person is using the UI" is true."""

	host = "crm.local"
	method = "POST"
	url = "http://crm.local/app/crm-lead/new"

	def __init__(self):
		self.headers = {}


class TestLeadOrigin(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		self._orig_request = getattr(frappe.local, "request", None)

	def tearDown(self):
		frappe.local.request = self._orig_request
		for flag in ("in_import", "in_patch", "in_install"):
			frappe.flags.pop(flag, None)

	def _new_lead(self, **kwargs):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Origin",
				"mobile_no": "+919000000001",
				**kwargs,
			}
		)
		doc.insert(ignore_permissions=True)
		return doc

	def test_field_exists_on_lead_and_deal(self):
		for doctype in ("CRM Lead", "CRM Deal"):
			with self.subTest(doctype=doctype):
				self.assertTrue(frappe.get_meta(doctype).has_field(ORIGIN_FIELD))

	def test_field_is_read_only(self):
		"""It is a system fact, not something a user corrects after the event."""
		field = frappe.get_meta("CRM Lead").get_field(ORIGIN_FIELD)
		self.assertTrue(field.read_only)

	def test_a_person_in_the_ui_is_manual(self):
		frappe.local.request = _FakeRequest()
		lead = self._new_lead()
		self.assertEqual(lead.get(ORIGIN_FIELD), MANUAL)

	def test_a_script_with_no_request_is_api_not_manual(self):
		"""A scheduled job or console insert is not a person typing."""
		frappe.local.request = None
		lead = self._new_lead()
		self.assertEqual(lead.get(ORIGIN_FIELD), API)

	def test_a_guest_request_is_api(self):
		"""A guest endpoint that has not been taught to declare itself."""
		frappe.local.request = _FakeRequest()
		frappe.set_user("Guest")
		try:
			lead = self._new_lead()
		finally:
			frappe.set_user("Administrator")
		self.assertEqual(lead.get(ORIGIN_FIELD), API)

	def test_an_import_is_import(self):
		frappe.local.request = None
		frappe.flags.in_import = True
		lead = self._new_lead()
		self.assertEqual(lead.get(ORIGIN_FIELD), IMPORT)

	def test_an_integration_that_declares_itself_is_not_overwritten(self):
		"""The website endpoint and the email hook set this before insert."""
		frappe.local.request = _FakeRequest()
		for declared in (WEBSITE, EMAIL):
			with self.subTest(declared=declared):
				lead = self._new_lead(**{ORIGIN_FIELD: declared})
				self.assertEqual(lead.get(ORIGIN_FIELD), declared)

	def test_origin_is_independent_of_source(self):
		"""The whole reason this field exists.

		A lead can honestly be attributed to a referral while having physically
		arrived through the website form. Overloading `source` would force a choice
		between those two true statements.
		"""
		if not frappe.db.exists("CRM Lead Source", "Referral"):
			self.skipTest("Referral source not present on this site")

		frappe.local.request = _FakeRequest()
		lead = self._new_lead(source="Referral", **{ORIGIN_FIELD: WEBSITE})

		self.assertEqual(lead.source, "Referral")
		self.assertEqual(lead.get(ORIGIN_FIELD), WEBSITE)

	def test_existing_leads_are_left_blank_not_guessed(self):
		"""Records predating the field have no honest answer.

		Back-filling "Manual" onto a million historical rows would be inventing
		data; blank correctly reads as "we do not know".
		"""
		field = frappe.get_meta("CRM Lead").get_field(ORIGIN_FIELD)
		self.assertIn("", (field.options or "").split("\n"))
