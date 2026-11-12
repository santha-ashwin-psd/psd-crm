# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Pipeline stages: where a new pipeline starts, and the stage-replacement patch."""

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status
from xbr_crm.install import DEFAULT_DEAL_STATUSES
from xbr_crm.patches.v1_1.pipeline_statuses_v2 import LEGACY_TO_CURRENT, _remap


class TestPipelineStages(FrappeTestCase):
	def test_new_pipeline_starts_at_the_first_open_stage(self):
		expected = frappe.get_all(
			"CRM Deal Status", filters={"type": "Open"}, order_by="position asc", pluck="name", limit=1
		)[0]
		self.assertEqual(default_deal_status(), expected)

	def test_default_board_is_the_eight_stages_in_order(self):
		self.assertEqual(
			list(DEFAULT_DEAL_STATUSES),
			[
				"Interested Leads",
				"Prospect",
				"Counselling",
				"Follow-up",
				"Won",
				"Lost",
				"Archive",
				"Future Opportunity",
			],
		)

	def test_default_board_starts_with_interested_leads(self):
		first, (status_type, _probability, _color) = next(iter(DEFAULT_DEAL_STATUSES.items()))
		self.assertEqual(first, "Interested Leads")
		self.assertEqual(status_type, "Open")

	def test_board_types(self):
		types = {name: spec[0] for name, spec in DEFAULT_DEAL_STATUSES.items()}
		self.assertEqual(types["Won"], "Won")
		self.assertEqual(types["Lost"], "Lost")
		self.assertEqual(types["Archive"], "Lost")
		self.assertEqual(types["Future Opportunity"], "On Hold")
		self.assertEqual(types["Follow-up"], "Ongoing")

	def test_every_old_stage_maps_to_a_new_one(self):
		for old, new in LEGACY_TO_CURRENT.items():
			with self.subTest(old=old):
				self.assertIn(new, DEFAULT_DEAL_STATUSES)

	def test_stage_filter_values_are_remapped(self):
		"""A saved `status` filter may be a name or an operator with a list."""
		self.assertEqual(_remap("Closed Won"), "Won")
		self.assertEqual(_remap("Won"), "Won")
		self.assertEqual(_remap("Qualification"), "Prospect")
		self.assertEqual(
			_remap(["in", ["Closed Won", "Closed Lost", "Ready to Close"]]),
			["in", ["Won", "Lost", "Follow-up"]],
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


# The live board: a kanban view saved before the stage change. The patch renamed
# its columns in place, and two old stages became Follow-up.
OLD_SAVED_BOARD = [
	{"name": "Qualification"},
	{"name": "Demo/Making"},
	{"name": "Proposal/Quotation", "page_length": 40},
	{"name": "Negotiation"},
	{"name": "Ready to Close"},
	{"name": "Won"},
	{"name": "Lost", "delete": True},
]


class TestSavedKanbanBoards(FrappeTestCase):
	def test_patch_rename_keeps_one_column_per_stage(self):
		from xbr_crm.patches.v1_1.pipeline_stages import _dedupe_columns

		renamed = _dedupe_columns([dict(c, name=_remap(c["name"])) for c in OLD_SAVED_BOARD])
		names = [c["name"] for c in renamed]
		self.assertEqual(names.count("Follow-up"), 1)
		self.assertEqual(len(names), len(set(names)))

	def test_stale_board_shows_every_stage_once(self):
		"""A board already saved with duplicates and old names is repaired on load."""
		from xbr_crm.api.doc import normalise_kanban_columns

		stale = [dict(c, name=_remap(c["name"])) for c in OLD_SAVED_BOARD] + [{"name": "Removed Stage"}]
		order = list(DEFAULT_DEAL_STATUSES)
		out = normalise_kanban_columns(stale, order)
		names = [c["name"] for c in out]

		self.assertEqual(sorted(names), sorted(order), "every current stage exactly once")
		self.assertNotIn("Removed Stage", names)
		# Archive and Future Opportunity were not on the old board: each lands
		# after the stage that precedes it.
		self.assertEqual(names.index("Archive"), names.index("Lost") + 1)
		self.assertEqual(names.index("Future Opportunity"), names.index("Archive") + 1)

	def test_users_own_order_and_settings_are_kept(self):
		from xbr_crm.api.doc import normalise_kanban_columns

		saved = [
			{"name": "Won"},
			{"name": "Interested Leads", "page_length": 40},
			{"name": "Lost", "delete": True},
		]
		out = normalise_kanban_columns(saved, list(DEFAULT_DEAL_STATUSES))
		names = [c["name"] for c in out]
		self.assertLess(names.index("Won"), names.index("Interested Leads"), "user's order kept")
		self.assertEqual(out[names.index("Interested Leads")]["page_length"], 40)
		self.assertTrue(out[names.index("Lost")]["delete"], "hidden column stays hidden")

	def test_board_loaded_with_a_stale_column_list(self):
		from xbr_crm.api.doc import get_data

		frappe.set_user("Administrator")
		stale = [dict(c, name=_remap(c["name"])) for c in OLD_SAVED_BOARD]
		data = get_data(
			doctype="CRM Deal",
			filters={},
			order_by="modified desc",
			column_field="status",
			kanban_columns=stale,
			view={"view_type": "kanban"},
		)
		names = [c["name"] for c in data["kanban_columns"]]
		self.assertEqual(len(names), len(set(names)), names)
		self.assertTrue(set(DEFAULT_DEAL_STATUSES) <= set(names))
		self.assertEqual(len(data["data"]), len(names), "one data column per board column")