# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Pipeline stages: where a new pipeline starts, and the stage-rename patch."""

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status
from xbr_crm.install import DEFAULT_DEAL_STATUSES
from xbr_crm.patches.v1_1.pipeline_stages import OLD_TO_NEW, _remap


class TestPipelineStages(FrappeTestCase):
	def test_new_pipeline_starts_at_the_first_open_stage(self):
		expected = frappe.get_all(
			"CRM Deal Status", filters={"type": "Open"}, order_by="position asc", pluck="name", limit=1
		)[0]
		self.assertEqual(default_deal_status(), expected)

	def test_default_board_starts_with_needs_analysis(self):
		first, (status_type, _probability, _color) = next(iter(DEFAULT_DEAL_STATUSES.items()))
		self.assertEqual(first, "Needs Analysis")
		self.assertEqual(status_type, "Open")

	def test_board_types(self):
		types = {name: spec[0] for name, spec in DEFAULT_DEAL_STATUSES.items()}
		self.assertEqual(types["Future Requirements"], "On Hold")
		self.assertEqual(types["Disqualified"], "Lost")
		self.assertEqual(types["Existing Customer"], "Won")
		self.assertEqual(types["Closed Won"], "Won")
		self.assertEqual(types["Closed Lost"], "Lost")

	def test_every_old_stage_maps_to_a_new_one(self):
		for old, new in OLD_TO_NEW.items():
			with self.subTest(old=old):
				self.assertIn(new, DEFAULT_DEAL_STATUSES)

	def test_stage_filter_values_are_remapped(self):
		"""A saved `status` filter may be a name or an operator with a list."""
		self.assertEqual(_remap("Won"), "Closed Won")
		self.assertEqual(_remap("Qualification"), "Qualification")
		self.assertEqual(
			_remap(["in", ["Won", "Lost", "Ready to Close"]]),
			["in", ["Closed Won", "Closed Lost", "Negotiation/Review"]],
		)
		self.assertEqual(_remap(42), 42)

	def test_kanban_columns_follow_stage_position(self):
		"""The board shows stages in their configured order, not by edit time."""
		from xbr_crm.api.doc import get_data

		frappe.set_user("Administrator")
		data = get_data(
			doctype="CRM Deal",
			filters={},
			order_by="modified desc",
			column_field="status",
			view={"view_type": "kanban"},
		)
		# Same tie-break as the board: test fixtures add stages that share positions.
		expected = frappe.get_all("CRM Deal Status", order_by="position asc, modified asc", pluck="name")
		self.assertEqual([c["name"] for c in data["kanban_columns"]], expected)
