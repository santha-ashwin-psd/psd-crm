# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""The follow-up stage: task + reminder, probability, overdue, stuck alerts."""

from datetime import timedelta
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, get_datetime, now_datetime

from xbr_crm import follow_ups
from xbr_crm.api.dashboard import get_overdue_follow_ups
from xbr_crm.patches.v1_1.follow_ups import add_card_to_kpi_row

OWNER = "test_follow_owner@example.com"
MANAGER = "test_follow_manager@example.com"


def _user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0],
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert(ignore_permissions=True)


class FollowUpCase(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		_user(OWNER)
		_user(MANAGER)
		self.stage = follow_ups.follow_up_stage()
		self.assertTrue(frappe.db.exists("CRM Deal Status", self.stage))
		self.first = frappe.get_all(
			"CRM Deal Status", {"type": "Open"}, pluck="name", order_by="position asc", limit=1
		)[0]
		self.deals = []

	def tearDown(self):
		frappe.set_user("Administrator")
		for name in self.deals:
			for task in frappe.get_all("CRM Task", {"reference_docname": name}, pluck="name"):
				frappe.db.delete("Event Notifications", {"parent": str(task)})
				frappe.db.delete("ToDo", {"reference_name": str(task)})
			frappe.db.delete("CRM Task", {"reference_docname": name})
			frappe.db.delete("FCRM Note", {"reference_docname": name})
			frappe.db.delete("CRM Status Change Log", {"parent": name})
			frappe.db.delete("ToDo", {"reference_name": name})
			frappe.db.delete("CRM Deal", {"name": name})
		frappe.db.commit()

	def deal(self, **values):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"status": values.pop("status", self.first),
				"deal_owner": OWNER,
				"organization_name": None,
				"first_name": "Follow",
				**values,
			}
		).insert(ignore_permissions=True)
		self.deals.append(doc.name)
		return doc

	def move(self, deal, **values):
		deal.reload()
		deal.update(values)
		deal.save(ignore_permissions=True)
		return deal

	def task_of(self, deal):
		deal.reload()
		return frappe.get_doc("CRM Task", deal.follow_up_task) if deal.follow_up_task else None


class TestFollowUpTask(FollowUpCase):
	def test_moving_to_the_stage_creates_a_dated_task_with_a_reminder(self):
		when = get_datetime(add_days(now_datetime(), 2)).replace(microsecond=0)
		deal = self.move(
			self.deal(), status=self.stage, next_follow_up=when, follow_up_note="Call about fees"
		)
		task = self.task_of(deal)
		self.assertIsNotNone(task)
		self.assertEqual(get_datetime(task.due_date), when)
		self.assertEqual(task.assigned_to, OWNER)
		self.assertEqual((task.reference_doctype, task.reference_docname), ("CRM Deal", deal.name))
		self.assertIn("Call about fees", task.description)
		self.assertEqual([(r.before, r.interval) for r in task.reminders], [(0, "minutes")])

	def test_no_date_given_means_tomorrow_at_ten(self):
		deal = self.move(self.deal(), status=self.stage)
		self.assertEqual(get_datetime(deal.next_follow_up), follow_ups.default_follow_up_time())
		self.assertIsNotNone(self.task_of(deal))

	def test_a_new_date_moves_the_same_task(self):
		deal = self.move(self.deal(), status=self.stage, next_follow_up=add_days(now_datetime(), 1))
		first = self.task_of(deal).name
		later = get_datetime(add_days(now_datetime(), 5)).replace(microsecond=0)
		deal = self.move(deal, next_follow_up=later)
		self.assertEqual(self.task_of(deal).name, first)
		self.assertEqual(get_datetime(self.task_of(deal).due_date), later)
		self.assertEqual(frappe.db.count("CRM Task", {"reference_docname": deal.name}), 1)

	def test_a_finished_task_is_not_reused(self):
		deal = self.move(self.deal(), status=self.stage, next_follow_up=add_days(now_datetime(), 1))
		frappe.db.set_value("CRM Task", deal.follow_up_task, "status", "Done")
		deal = self.move(deal, next_follow_up=add_days(now_datetime(), 3))
		self.assertEqual(frappe.db.count("CRM Task", {"reference_docname": deal.name}), 2)

	def test_other_stages_create_no_task(self):
		deal = self.deal(next_follow_up=add_days(now_datetime(), 1))
		self.assertIsNone(self.task_of(deal))


class TestProbability(FollowUpCase):
	def stage_probability(self, stage):
		return frappe.db.get_value("CRM Deal Status", stage, "probability")

	def test_default_probability_follows_the_stage(self):
		deal = self.deal()
		self.assertEqual(deal.probability, self.stage_probability(self.first))
		deal = self.move(deal, status=self.stage)
		self.assertEqual(deal.probability, self.stage_probability(self.stage))

	def test_a_hand_set_probability_is_kept(self):
		deal = self.deal()
		deal = self.move(deal, probability=33)
		deal = self.move(deal, status=self.stage)
		self.assertEqual(deal.probability, 33)

	def test_a_probability_set_with_the_stage_change_is_kept(self):
		deal = self.move(self.deal(), status=self.stage, probability=77)
		self.assertEqual(deal.probability, 77)


class TestOverdue(FollowUpCase):
	def test_overdue_once_the_date_passes(self):
		deal = self.move(self.deal(), status=self.stage, next_follow_up=add_days(now_datetime(), 1))
		self.assertFalse(follow_ups.is_overdue(deal.status, deal.next_follow_up))
		frappe.db.set_value("CRM Deal", deal.name, "next_follow_up", add_days(now_datetime(), -1))
		self.assertTrue(follow_ups.is_overdue(deal.status, add_days(now_datetime(), -1)))

	def test_dashboard_counts_overdue_follow_ups_for_the_owner(self):
		deal = self.move(self.deal(), status=self.stage, next_follow_up=add_days(now_datetime(), 1))
		before = get_overdue_follow_ups(user=OWNER)["value"]
		frappe.db.set_value("CRM Deal", deal.name, "next_follow_up", add_days(now_datetime(), -1))
		self.assertEqual(get_overdue_follow_ups(user=OWNER)["value"], before + 1)
		# Leaving the stage clears it from the count.
		self.move(deal, status=self.first)
		self.assertEqual(get_overdue_follow_ups(user=OWNER)["value"], before)


class TestStuck(FollowUpCase):
	def age(self, deal, days):
		"""Pretend everything about the pipeline happened `days` ago."""
		old = now_datetime() - timedelta(days=days)
		frappe.db.sql("update `tabCRM Deal` set creation=%s where name=%s", (old, deal.name))
		frappe.db.sql("update `tabCRM Status Change Log` set creation=%s where parent=%s", (old, deal.name))
		frappe.db.sql("update `tabCRM Task` set modified=%s where reference_docname=%s", (old, deal.name))

	def stuck_names(self, days=10):
		return [d.name for d in follow_ups.stuck_deals(days)]

	def test_no_activity_for_the_set_days_is_stuck(self):
		deal = self.move(self.deal(), status=self.stage)
		self.age(deal, 11)
		self.assertIn(deal.name, self.stuck_names(10))
		self.assertNotIn(deal.name, self.stuck_names(12), "the days setting is respected")

	def test_recent_activity_is_not_stuck(self):
		deal = self.move(self.deal(), status=self.stage)
		self.age(deal, 11)
		frappe.get_doc(
			{
				"doctype": "FCRM Note",
				"title": "Spoke to them",
				"reference_doctype": "CRM Deal",
				"reference_docname": deal.name,
			}
		).insert(ignore_permissions=True)
		self.assertNotIn(deal.name, self.stuck_names(10))

	def test_reminder_emails_do_not_count_as_activity(self):
		deal = self.move(self.deal(), status=self.stage)
		self.age(deal, 11)
		frappe.get_doc(
			{
				"doctype": "Communication",
				"communication_type": "Automated Message",
				"communication_medium": "Email",
				"subject": "Task reminder",
				"reference_doctype": "CRM Deal",
				"reference_name": deal.name,
			}
		).insert(ignore_permissions=True)
		self.assertIn(deal.name, self.stuck_names(10))
		frappe.db.delete("Communication", {"reference_name": deal.name})

	def test_daily_email_goes_to_owner_and_manager(self):
		deal = self.move(self.deal(), status=self.stage)
		self.age(deal, 11)
		frappe.cache.delete_value(f"xbr_crm:stuck_follow_ups:{frappe.utils.getdate()}")
		sent = []
		with (
			patch.object(follow_ups, "manager_of", lambda user: MANAGER if user == OWNER else None),
			patch.object(frappe, "sendmail", lambda **kw: sent.append(kw)),
			patch.object(
				follow_ups,
				"stuck_deals",
				lambda days, now=None: [d for d in self.real_stuck(days) if d.name == deal.name],
			),
		):
			follow_ups.send_stuck_follow_up_alerts()
			follow_ups.send_stuck_follow_up_alerts()  # a second run the same day sends nothing
		self.assertEqual(sorted(kw["recipients"][0] for kw in sent), sorted([OWNER, MANAGER]))
		self.assertIn(f"/pipeline/{deal.name}", sent[0]["message"])

	def test_switched_off_sends_nothing(self):
		frappe.db.set_single_value("FCRM Settings", "enable_stuck_follow_up_alerts", 0)
		try:
			sent = []
			with patch.object(frappe, "sendmail", lambda **kw: sent.append(kw)):
				follow_ups.send_stuck_follow_up_alerts()
			self.assertEqual(sent, [])
		finally:
			frappe.db.set_single_value("FCRM Settings", "enable_stuck_follow_up_alerts", 1)

	real_stuck = staticmethod(follow_ups.stuck_deals)


class TestDashboardPatch(FrappeTestCase):
	def test_card_joins_the_kpi_row_once(self):
		layout = [
			{"name": "ongoing_deals", "layout": {"x": 0, "y": 0, "w": 10, "h": 3}},
			{"name": "won_deals", "layout": {"x": 10, "y": 0, "w": 10, "h": 3}},
			{"name": "sales_trend", "layout": {"x": 0, "y": 3, "w": 20, "h": 9}},
		]
		card = {"name": "overdue_follow_ups", "type": "number_chart"}
		out = add_card_to_kpi_row(layout, card)
		row = [c for c in out if c["layout"]["y"] == 0]
		self.assertEqual(
			[c["name"] for c in sorted(row, key=lambda c: c["layout"]["x"])][-1], "overdue_follow_ups"
		)
		self.assertEqual(sum(c["layout"]["w"] for c in row), 20)
		self.assertIs(add_card_to_kpi_row(out, card), out, "already there: unchanged")
