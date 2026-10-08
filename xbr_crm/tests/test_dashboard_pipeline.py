# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Dashboard behaviour for pipelines: the stage funnel and hidden-card layout.

Independent of whatever else is on the site: the funnel is read for a user who
owns only the pipelines created here, and the stage order is read from the site
rather than assumed.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.api.dashboard import GRID_COLUMNS, _without_cards, get_stage_reach_counts

FUNNEL_USER = "test_funnel_owner@example.com"


class TestStageFunnel(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		if not frappe.db.exists("User", FUNNEL_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": FUNNEL_USER,
					"first_name": "Funnel",
					"send_welcome_email": 0,
					"roles": [{"role": "Sales User"}],
				}
			).insert(ignore_permissions=True)
		self.deals = []
		self.working = [
			s.name
			for s in frappe.get_all(
				"CRM Deal Status",
				filters={"type": ("in", ["Open", "Ongoing"])},
				fields=["name"],
				order_by="position asc, modified asc",
			)
		]
		self.won = frappe.get_all("CRM Deal Status", {"type": "Won"}, pluck="name", limit=1)[0]
		self.lost = frappe.get_all("CRM Deal Status", {"type": "Lost"}, pluck="name", limit=1)[0]

	def tearDown(self):
		for name in self.deals:
			frappe.db.delete("CRM Status Change Log", {"parent": name})
			frappe.db.delete("ToDo", {"reference_name": name})
			frappe.db.delete("DocShare", {"share_name": name})
			frappe.db.delete("CRM Deal", {"name": name})
		frappe.db.commit()

	def _deal(self, status):
		deal = frappe.get_doc({"doctype": "CRM Deal", "status": status, "deal_owner": FUNNEL_USER}).insert(
			ignore_permissions=True
		)
		self.deals.append(deal.name)
		return deal.name

	def test_each_stage_counts_pipelines_that_reached_it(self):
		self.assertGreaterEqual(len(self.working), 3)
		self._deal(self.working[0])  # still at the first stage
		self._deal(self.working[2])  # got to the third stage
		self._deal(self.won)  # won: went through every stage
		lost = self._deal(self.working[1])  # reached the second stage...
		frappe.db.set_value("CRM Deal", lost, "status", self.lost)  # ...then was lost
		frappe.db.commit()

		today = frappe.utils.nowdate()
		counts = {r["stage"]: r["count"] for r in get_stage_reach_counts(today, today, FUNNEL_USER)}

		self.assertEqual(counts[self.working[0]], 4)
		self.assertEqual(counts[self.working[1]], 3)
		self.assertEqual(counts[self.working[2]], 2)
		self.assertEqual(counts[self.working[-1]], 1)
		self.assertEqual(counts["Won"], 1)

	def test_funnel_only_narrows(self):
		self._deal(self.working[0])
		self._deal(self.won)
		frappe.db.commit()
		today = frappe.utils.nowdate()
		values = [r["count"] for r in get_stage_reach_counts(today, today, FUNNEL_USER)]
		self.assertEqual(values, sorted(values, reverse=True))

	def test_no_pipelines_means_no_bars(self):
		"""An empty funnel returns nothing, so the dashboard shows its empty state."""
		self.assertEqual(get_stage_reach_counts("2000-01-01", "2000-01-02", FUNNEL_USER), [])


class TestHiddenCardLayout(FrappeTestCase):
	def card(self, name, x, y, w, h=3):
		return {"name": name, "layout": {"x": x, "y": y, "w": w, "h": h}}

	def test_rows_that_lost_a_card_fill_the_width(self):
		layout = [
			self.card("total_leads", 0, 0, 7),
			self.card("ongoing", 7, 0, 7),
			self.card("won", 14, 0, 6),
			self.card("avg_won", 0, 3, 5),
			self.card("avg_lead_close", 10, 3, 5),
			self.card("avg_close", 15, 3, 5),
			self.card("trend", 0, 6, 10, 9),
			self.card("forecast", 10, 6, 10, 9),
		]
		out = {c["name"]: c["layout"] for c in _without_cards(layout, {"total_leads", "avg_lead_close"})}

		self.assertNotIn("total_leads", out)
		self.assertEqual((out["ongoing"]["x"], out["ongoing"]["w"]), (0, 10))
		self.assertEqual((out["won"]["x"], out["won"]["w"]), (10, 10))
		self.assertEqual((out["avg_won"]["x"], out["avg_won"]["w"]), (0, 10))
		self.assertEqual((out["avg_close"]["x"], out["avg_close"]["w"]), (10, 10))
		# Rows that lost nothing are left exactly as saved.
		self.assertEqual(out["trend"], {"x": 0, "y": 6, "w": 10, "h": 9})
		for y in (0, 3):
			row = [g for g in out.values() if g["y"] == y]
			self.assertEqual(sum(g["w"] for g in row), GRID_COLUMNS)
