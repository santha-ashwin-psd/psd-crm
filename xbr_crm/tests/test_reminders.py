# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Reminder delivery: every reminder emailed once, at its own time.

The service is run with a fixed `now` far in the future so nothing else on the
site is due, and the providers are narrowed to the records made here.
"""

from datetime import datetime, timedelta
from unittest.mock import patch

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.reminders import providers, service

NOW = datetime(2031, 3, 10, 10, 0, 0)  # a Monday
USER_A = "test_reminder_a@example.com"
USER_B = "test_reminder_b@example.com"
USER_OTHER = "test_reminder_other_co@example.com"
EXTERNAL = "client.reminder@example.org"
CO_A = "_Test Reminder Co A"
CO_B = "_Test Reminder Co B"


def _user(email, tz=None):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{
				"doctype": "User",
				"email": email,
				"first_name": email.split("@")[0].replace("_", " ").title(),
				"send_welcome_email": 0,
				"roles": [{"role": "Sales User"}],
			}
		).insert(ignore_permissions=True)
	frappe.db.set_value("User", email, "time_zone", tz)


def _company(name, member=None):
	if not frappe.db.exists("CRM Company", name):
		frappe.get_doc({"doctype": "CRM Company", "company_name": name}).insert(ignore_permissions=True)
	if member and not frappe.db.exists("CRM Company Member", member):
		frappe.get_doc({"doctype": "CRM Company Member", "user": member, "company": name}).insert(
			ignore_permissions=True
		)


OUTGOING = "_Test Reminder Outgoing"


class ReminderTestCase(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		# Reminders need a default outgoing account. In tests Frappe skips the
		# SMTP check and never really sends, so a placeholder is enough.
		if not frappe.db.exists("Email Account", OUTGOING):
			frappe.get_doc(
				{
					"doctype": "Email Account",
					"email_account_name": OUTGOING,
					"email_id": "reminders@example.com",
					"enable_outgoing": 1,
					"default_outgoing": 1,
					"smtp_server": "localhost",
					"no_smtp_authentication": 1,
				}
			).insert(ignore_permissions=True)
			frappe.db.commit()

	@classmethod
	def tearDownClass(cls):
		frappe.db.delete("Email Account", {"name": OUTGOING})
		frappe.db.commit()
		super().tearDownClass()

	def setUp(self):
		frappe.set_user("Administrator")
		_user(USER_A)
		_user(USER_B, tz="America/New_York")
		_user(USER_OTHER)
		_company(CO_A)
		_company(CO_B, member=USER_OTHER)
		self.items: list[tuple[str, str]] = []
		self._settings(
			{
				"enable_reminder_emails": 1,
				"enable_event_reminder_emails": 1,
				"enable_task_reminder_emails": 1,
				"reminder_emails_enabled_on": NOW - timedelta(days=30),
			}
		)
		self._narrow = patch.dict(
			service.PROVIDERS,
			{key: self._only_mine(value) for key, value in providers.PROVIDERS.items()},
		)
		self._narrow.start()

	def tearDown(self):
		self._narrow.stop()
		names = [name for _, name in self.items]
		if names:
			comms = frappe.get_all(
				"CRM Reminder Log", {"reference_name": ("in", names)}, pluck="communication"
			)
			comms = [c for c in comms if c]
			if comms:
				frappe.db.delete(
					"Email Queue Recipient",
					{
						"parent": (
							"in",
							frappe.get_all("Email Queue", {"communication": ("in", comms)}, pluck="name")
							or [""],
						)
					},
				)
				frappe.db.delete("Email Queue", {"communication": ("in", comms)})
				frappe.db.delete("Communication Link", {"parent": ("in", comms)})
				frappe.db.delete("Communication", {"name": ("in", comms)})
			frappe.db.delete("CRM Reminder Log", {"reference_name": ("in", names)})
			frappe.db.delete("CRM Notification", {"notification_type_doc": ("in", names)})
		for doctype, name in self.items:
			frappe.db.delete("Event Notifications", {"parent": name})
			frappe.db.delete("Event Participants", {"parent": name})
			frappe.db.delete("ToDo", {"reference_name": name, "reference_type": doctype})
			frappe.db.delete(doctype, {"name": name})
		frappe.db.commit()

	def _only_mine(self, value):
		label, provider, setting, template = value

		def narrowed(start, end):
			mine = {str(name) for _, name in self.items}
			return [r for r in provider(start, end) if r.reference_name in mine]

		return (label, narrowed, setting, template)

	def _settings(self, values):
		for field, value in values.items():
			frappe.db.set_single_value("FCRM Settings", field, value)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")

	def run_at(self, when):
		service.send_due_reminders(now=when)

	def logs(self, name, **filters):
		return frappe.get_all(
			"CRM Reminder Log",
			filters={"reference_name": name, **filters},
			fields=["recipient", "status", "trigger_at", "occurrence_start", "email_queue", "communication"],
			order_by="trigger_at asc",
		)

	def sent(self, log):
		"""Subject + body as sent (the Communication; the queue holds encoded MIME)."""
		subject, content = frappe.db.get_value("Communication", log.communication, ["subject", "content"])
		return subject + "\n" + content

	def queued(self, name):
		"""Email Queue rows for this item's reminders."""
		comms = [log.communication for log in self.logs(name) if log.communication]
		if not comms:
			return []
		return frappe.get_all("Email Queue", {"communication": ("in", comms)}, pluck="name")


class TestTaskReminders(ReminderTestCase):
	def task(self, due, reminders, **values):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Task",
				"title": values.pop("title", "Call the client back"),
				"status": values.pop("status", "Todo"),
				"priority": "High",
				"due_date": due,
				"assigned_to": values.pop("assigned_to", USER_A),
				"reminders": [{"type": "Email", "before": b, "interval": i} for b, i in reminders],
				**values,
			}
		).insert(ignore_permissions=True)
		self.items.append(("CRM Task", doc.name))
		frappe.db.commit()
		return doc

	def test_offsets_fire_at_their_own_time(self):
		due = NOW + timedelta(days=1)
		for before, interval, lead in (
			(5, "minutes", timedelta(minutes=5)),
			(30, "minutes", timedelta(minutes=30)),
			(1, "days", timedelta(days=1)),
		):
			with self.subTest(f"{before} {interval}"):
				task = self.task(due, [(before, interval)])
				trigger = due - lead
				self.run_at(trigger - timedelta(minutes=1))
				self.assertEqual(self.logs(task.name), [], "not early")
				self.run_at(trigger)
				logs = self.logs(task.name)
				self.assertEqual(len(logs), 1)
				self.assertEqual(logs[0].trigger_at, trigger)
				self.assertEqual(logs[0].recipient, USER_A)
				self.assertEqual(len(self.queued(task.name)), 1)

	def test_never_sent_twice(self):
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		for minute in range(0, 6):  # every scheduler tick inside the grace window
			self.run_at(NOW + timedelta(minutes=minute))
		self.assertEqual(len(self.logs(task.name)), 1)
		self.assertEqual(len(self.queued(task.name)), 1)

	def test_multiple_reminders_each_fire(self):
		due = NOW + timedelta(hours=2)
		task = self.task(due, [(10, "minutes"), (1, "hours"), (2, "hours")])
		for lead in (timedelta(hours=2), timedelta(hours=1), timedelta(minutes=10)):
			self.run_at(due - lead)
		self.assertEqual(len(self.logs(task.name)), 3)
		self.assertEqual(len(self.queued(task.name)), 3)

	def test_reschedule_reminds_again_at_the_new_time(self):
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		self.run_at(NOW)
		task.reload()
		task.due_date = NOW + timedelta(days=1, minutes=10)
		task.save(ignore_permissions=True)
		frappe.db.commit()
		self.run_at(NOW + timedelta(days=1))
		self.assertEqual([log.trigger_at for log in self.logs(task.name)], [NOW, NOW + timedelta(days=1)])

	def test_offset_change_reminds_at_the_new_offset(self):
		due = NOW + timedelta(hours=1)
		task = self.task(due, [(30, "minutes")])
		task.reload()
		task.reminders[0].before = 1
		task.reminders[0].interval = "hours"
		task.save(ignore_permissions=True)
		frappe.db.commit()
		self.run_at(due - timedelta(minutes=30))
		self.assertEqual(self.logs(task.name), [], "old offset no longer fires")
		self.run_at(due - timedelta(hours=1))
		self.assertEqual(len(self.logs(task.name)), 1)

	def test_done_cancelled_and_deleted_tasks_are_silent(self):
		done = self.task(NOW + timedelta(minutes=10), [(10, "minutes")], status="Done")
		cancelled = self.task(NOW + timedelta(minutes=10), [(10, "minutes")], status="Canceled")
		deleted = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		frappe.delete_doc("CRM Task", deleted.name, force=True, ignore_permissions=True)
		frappe.db.commit()
		self.run_at(NOW)
		for task in (done, cancelled, deleted):
			self.assertEqual(self.logs(task.name), [])

	def test_late_beyond_grace_is_skipped_not_sent(self):
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		self.run_at(NOW + timedelta(minutes=service.GRACE_MINUTES + 1))
		self.assertEqual(self.logs(task.name), [])
		self.run_at(NOW + timedelta(minutes=service.GRACE_MINUTES))  # still inside: sent
		self.assertEqual(len(self.logs(task.name)), 1)

	def test_unassigned_task_reminds_its_creator(self):
		frappe.set_user(USER_A)
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")], assigned_to=None)
		frappe.set_user("Administrator")
		self.run_at(NOW)
		self.assertEqual([log.recipient for log in self.logs(task.name)], [USER_A])

	def test_other_company_user_is_never_reminded(self):
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")], assigned_to=USER_OTHER)
		frappe.db.set_value("CRM Task", task.name, "crm_company", CO_A)
		frappe.db.commit()
		self.run_at(NOW)
		self.assertEqual(self.logs(task.name), [])

	def test_in_app_notification_points_at_the_task(self):
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		self.run_at(NOW)
		note = frappe.get_all(
			"CRM Notification",
			{"notification_type_doc": task.name, "to_user": USER_A, "type": "Reminder"},
			["type", "reference_doctype", "reference_name"],
		)
		self.assertEqual(len(note), 1)
		self.assertEqual(note[0].type, "Reminder")
		self.assertEqual((note[0].reference_doctype, note[0].reference_name), ("CRM Task", str(task.name)))

	def test_type_switch_off_keeps_in_app_but_no_email(self):
		self._settings({"enable_task_reminder_emails": 0})
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		self.run_at(NOW)
		self.assertEqual(len(self.logs(task.name)), 1)
		self.assertEqual(self.queued(task.name), [])
		self.assertTrue(
			frappe.db.exists("CRM Notification", {"notification_type_doc": task.name, "type": "Reminder"})
		)

	def test_global_switch_off_sends_no_email(self):
		self._settings({"enable_reminder_emails": 0})
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		self.run_at(NOW)
		self.assertEqual(self.queued(task.name), [])

	def test_nothing_due_before_switch_on_is_emailed(self):
		self._settings({"reminder_emails_enabled_on": NOW + timedelta(minutes=1)})
		task = self.task(NOW + timedelta(minutes=10), [(10, "minutes")])
		self.run_at(NOW)
		self.assertEqual(self.queued(task.name), [])

	def test_email_content(self):
		task = self.task(
			NOW + timedelta(minutes=30), [(30, "minutes")], description="<p>Ask about the renewal</p>"
		)
		self.run_at(NOW)
		queue = frappe.get_doc("Email Queue", self.queued(task.name)[0])
		self.assertEqual([r.recipient for r in queue.recipients], [USER_A])
		message = self.sent(self.logs(task.name)[0])
		self.assertIn("Due</td>", message)
		self.assertIn("Task reminder: Call the client back", message)
		self.assertIn("30 minutes before", message)
		self.assertIn("High", message)
		self.assertIn("Ask about the renewal", message)
		self.assertIn(f"/tasks/view/list?open={task.name}", message)


class TestEventReminders(ReminderTestCase):
	def event(self, starts_on, reminders=None, participants=(), email=True, **values):
		doc = frappe.get_doc(
			{
				"doctype": "Event",
				"subject": values.pop("subject", "Product demo"),
				"event_type": "Private",
				"event_category": "Meeting",
				"starts_on": starts_on,
				"status": values.pop("status", "Open"),
				"location": "Board room",
				"notifications": [
					{
						"type": "Email" if email else "Notification",
						"before": b,
						"interval": i,
						**({"time": t} if t else {}),
					}
					for b, i, t in (reminders or [])
				],
				**values,
			}
		)
		frappe.set_user(values.get("owner") or USER_A)
		doc.flags.ignore_mandatory = True
		doc.insert(ignore_permissions=True)
		frappe.set_user("Administrator")
		# Added directly: Event.on_update would otherwise file a Communication
		# per participant, which is Frappe's behaviour, not ours.
		for email in participants:
			frappe.get_doc(
				{
					"doctype": "Event Participants",
					"parent": doc.name,
					"parenttype": "Event",
					"parentfield": "event_participants",
					"email": email,
					"reference_doctype": "Contact",
				}
			).db_insert()
		self.items.append(("Event", doc.name))
		frappe.db.commit()
		return doc

	def test_owner_user_participant_and_external_participant(self):
		event = self.event(
			NOW + timedelta(minutes=10), [(10, "minutes", None)], participants=[USER_B, EXTERNAL]
		)
		self.run_at(NOW)
		logs = {log.recipient: log for log in self.logs(event.name)}
		self.assertEqual(set(logs), {USER_A, USER_B, EXTERNAL})
		self.assertTrue(all(log.email_queue for log in logs.values()))
		# External guests get the email only; CRM users also get the bell.
		bell = frappe.get_all(
			"CRM Notification", {"notification_type_doc": event.name, "type": "Reminder"}, pluck="to_user"
		)
		self.assertEqual(sorted(bell), sorted([USER_A, USER_B]))

	def test_email_unchecked_reminds_in_app_only(self):
		event = self.event(
			NOW + timedelta(minutes=10), [(10, "minutes", None)], participants=[EXTERNAL], email=False
		)
		self.run_at(NOW)
		logs = {log.recipient: log for log in self.logs(event.name)}
		self.assertEqual(set(logs), {USER_A, EXTERNAL})
		self.assertFalse(any(log.email_queue for log in logs.values()))
		self.assertEqual(logs[EXTERNAL].status, "Skipped")
		self.assertTrue(
			frappe.db.exists("CRM Notification", {"notification_type_doc": event.name, "to_user": USER_A})
		)

	def test_global_defaults_apply_when_event_has_none(self):
		settings = frappe.get_single("FCRM Settings")
		saved = [(r.type, r.before, r.interval) for r in settings.event_notifications]
		settings.set("event_notifications", [{"type": "Email", "before": 15, "interval": "minutes"}])
		settings.save(ignore_permissions=True)
		frappe.db.commit()
		try:
			event = self.event(NOW + timedelta(minutes=15))
			self.run_at(NOW)
			self.assertEqual(len(self.logs(event.name)), 1)
		finally:
			settings.reload()
			settings.set(
				"event_notifications", [{"type": t, "before": b, "interval": i} for t, b, i in saved]
			)
			settings.save(ignore_permissions=True)
			frappe.db.commit()

	def test_cancelled_and_completed_events_are_silent(self):
		for status in ("Cancelled", "Completed", "Closed"):
			event = self.event(NOW + timedelta(minutes=10), [(10, "minutes", None)], status=status)
			self.run_at(NOW)
			self.assertEqual(self.logs(event.name), [], status)

	def test_daily_repeat_reminds_every_occurrence_once(self):
		event = self.event(
			NOW + timedelta(minutes=10),
			[(10, "minutes", None)],
			repeat_this_event=1,
			repeat_on="Daily",
			repeat_till=(NOW + timedelta(days=2)).date(),
		)
		for day in range(4):
			self.run_at(NOW + timedelta(days=day))
			self.run_at(NOW + timedelta(days=day, minutes=1))  # a second tick: no repeat
		self.assertEqual(
			[log.occurrence_start for log in self.logs(event.name)],
			[NOW + timedelta(days=d, minutes=10) for d in range(3)],
			"one per day, none after repeat_till",
		)

	def test_weekly_repeat_only_on_chosen_days(self):
		event = self.event(
			NOW + timedelta(minutes=10),
			[(10, "minutes", None)],
			repeat_this_event=1,
			repeat_on="Weekly",
			monday=1,
			wednesday=1,
		)
		for day in range(7):
			self.run_at(NOW + timedelta(days=day))
		days = [log.occurrence_start.strftime("%A") for log in self.logs(event.name)]
		self.assertEqual(days, ["Monday", "Wednesday"])

	def test_monthly_repeat(self):
		event = self.event(
			NOW + timedelta(minutes=10), [(10, "minutes", None)], repeat_this_event=1, repeat_on="Monthly"
		)
		self.run_at(NOW + timedelta(days=31))  # 10 April: occurs
		self.run_at(NOW + timedelta(days=15))  # 25 March: does not
		self.assertEqual(
			[log.occurrence_start for log in self.logs(event.name)], [datetime(2031, 4, 10, 10, 10)]
		)

	def test_all_day_event_day_before_at_time(self):
		event = self.event(datetime(2031, 3, 11, 0, 0), [(1, "days", "10:00:00")], all_day=1)
		self.run_at(NOW)
		logs = self.logs(event.name)
		self.assertEqual(len(logs), 1)
		self.assertEqual(logs[0].trigger_at, NOW)

	def test_rescheduled_event_reminds_again(self):
		event = self.event(NOW + timedelta(minutes=10), [(10, "minutes", None)])
		self.run_at(NOW)
		frappe.db.set_value("Event", event.name, "starts_on", NOW + timedelta(hours=3, minutes=10))
		frappe.db.commit()
		self.run_at(NOW + timedelta(hours=3))
		self.assertEqual(len(self.logs(event.name)), 2)

	def test_time_shown_in_each_recipients_timezone(self):
		event = self.event(NOW + timedelta(minutes=10), [(10, "minutes", None)], participants=[USER_B])
		self.run_at(NOW)
		by_recipient = {log.recipient: log for log in self.logs(event.name)}
		system_tz = service.system_timezone()
		a = self.sent(by_recipient[USER_A])
		b = self.sent(by_recipient[USER_B])
		self.assertIn(f"({system_tz})", a)
		self.assertIn("(America/New_York)", b)

	def test_email_has_location_link_and_linked_pipeline(self):
		deal = frappe.get_doc({"doctype": "CRM Deal", "organization": None, "first_name": "Riya"}).insert(
			ignore_permissions=True
		)
		self.items.append(("CRM Deal", deal.name))
		event = self.event(
			NOW + timedelta(minutes=10),
			[(10, "minutes", None)],
			google_meet_link="https://meet.google.com/abc-defg-hij",
			reference_doctype="CRM Deal",
			reference_docname=deal.name,
		)
		self.run_at(NOW)
		log = self.logs(event.name)[0]
		message = self.sent(log)
		self.assertIn("When</td>", message)
		self.assertIn("Board room", message)
		self.assertIn("https://meet.google.com/abc-defg-hij", message)
		self.assertIn(f"/pipeline/{deal.name}", message)
		# Logged on the pipeline, so it shows in the pipeline's activity.
		comm = frappe.db.get_value(
			"Communication",
			log.communication,
			["reference_doctype", "reference_name", "communication_type"],
			as_dict=True,
		)
		self.assertEqual((comm.reference_doctype, comm.reference_name), ("CRM Deal", deal.name))
		self.assertEqual(comm.communication_type, "Automated Message")
