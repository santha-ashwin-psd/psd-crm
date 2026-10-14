# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Event reminders: two reminders may not fire at the same moment."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime


class TestEventReminders(IntegrationTestCase):
	def tearDown(self):
		frappe.db.rollback()

	def event(self, reminders, all_day=0):
		return frappe.get_doc(
			{
				"doctype": "Event",
				"subject": "Demo call",
				"event_type": "Private",
				"starts_on": add_days(now_datetime(), 1),
				"all_day": all_day,
				"notifications": [
					{"type": "Notification", "before": b, "interval": i, "time": t} for b, i, t in reminders
				],
			}
		)

	def test_same_reminder_twice_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.event([(5, "minutes", None), (5, "minutes", None)]).insert(ignore_permissions=True)

	def test_same_moment_in_other_units_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.event([(1, "hours", None), (60, "minutes", None)]).insert(ignore_permissions=True)

	def test_different_times_are_allowed(self):
		self.event([(5, "minutes", None), (1, "hours", None)]).insert(ignore_permissions=True)

	def test_all_day_same_offset_different_time_is_allowed(self):
		self.event([(1, "days", "08:00"), (1, "days", "17:00")], all_day=1).insert(ignore_permissions=True)

	def test_all_day_same_offset_same_time_is_refused(self):
		with self.assertRaises(frappe.ValidationError):
			self.event([(1, "days", "08:00"), (1, "days", "08:00:00")], all_day=1).insert(
				ignore_permissions=True
			)
