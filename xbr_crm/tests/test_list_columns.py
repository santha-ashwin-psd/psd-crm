# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""List views only show columns for fields the doctype actually has."""

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.api.doc import get_data
from xbr_crm.fcrm.doctype.crm_organization.crm_organization import CRMOrganization


class TestListColumns(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")

	def test_saved_view_drops_a_field_the_doctype_lacks(self):
		"""A view saved with a removed custom field shows no empty column for it."""
		data = get_data(
			doctype="CRM Organization",
			filters={},
			order_by="modified desc",
			columns=[
				{"label": "Organization", "type": "Data", "key": "organization_name"},
				{"label": "Gone", "type": "Data", "key": "no_such_field"},
				{"label": "Assigned To", "type": "Text", "key": "_assign"},
			],
			rows=["name", "organization_name"],
		)
		keys = [c["key"] for c in data["columns"]]
		self.assertIn("organization_name", keys)
		self.assertIn("_assign", keys)
		self.assertNotIn("no_such_field", keys)

	def test_organization_status_column_only_with_the_field(self):
		data = CRMOrganization.default_list_data()
		keys = [c["key"] for c in data["columns"]]
		has_status = frappe.get_meta("CRM Organization").has_field("status")
		self.assertEqual("status" in keys, has_status)
		self.assertEqual("status" in data["rows"], has_status)
		# Last Modified stays the final column either way.
		self.assertEqual(keys[-1], "modified")
