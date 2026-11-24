# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Task reminders: N minutes/hours/days/weeks before a CRM Task's due date.

Reminders live in the task's `reminders` table. Done and Canceled tasks never
remind. The reminder goes to the assignee, or to whoever created the task when
it is unassigned. Like event reminders, a row of type "Notification" is in-app
only; "Email" rows (and rows saved before the type was offered, which have none)
are also emailed. CRM users also get the live reminder pop-up.
"""

from datetime import datetime

import frappe

from xbr_crm.reminders.base import DueReminder, offset, user_in_company, user_recipient

CLOSED_STATUSES = ("Done", "Canceled")


def due_reminders(window_start: datetime, window_end: datetime) -> list[DueReminder]:
	# A reminder fires at or before the due date, so only tasks due from the
	# start of the window onwards can have one due now.
	tasks = frappe.get_all(
		"CRM Task",
		filters={"status": ("not in", CLOSED_STATUSES), "due_date": (">=", window_start)},
		fields=[
			"name",
			"title",
			"description",
			"due_date",
			"priority",
			"status",
			"assigned_to",
			"owner",
			"crm_company",
			"reference_doctype",
			"reference_docname",
		],
	)
	if not tasks:
		return []
	# CRM Task is auto-increment: its name is an int, but child rows store
	# `parent` as text. Use the text form everywhere.
	for task in tasks:
		task.name = str(task.name)

	rows = frappe.get_all(
		"Event Notifications",
		filters={
			"parenttype": "CRM Task",
			"parentfield": "reminders",
			"parent": ("in", [t.name for t in tasks]),
		},
		fields=["name", "parent", "type", "before", "interval"],
		order_by="idx asc",
	)
	by_task: dict[str, list] = {}
	for row in rows:
		by_task.setdefault(row.parent, []).append(row)

	# Tasks created for a pipeline's follow-up stage (see follow_ups.py).
	follow_ups = set(
		frappe.get_all(
			"CRM Deal",
			filters={"follow_up_task": ("in", [t.name for t in tasks])},
			pluck="follow_up_task",
		)
	)

	due = []
	for task in tasks:
		due_at = frappe.utils.get_datetime(task.due_date)
		for row in by_task.get(task.name, []):
			lead = offset(row.before, row.interval)
			if lead is None:
				continue
			trigger = due_at - lead
			if window_start <= trigger <= window_end:
				reminder = _build(task, row, due_at, trigger)
				reminder.always_email = task.name in follow_ups
				due.append(reminder)
	return due


def _build(task, row, due_at: datetime, trigger: datetime) -> DueReminder:
	return DueReminder(
		reminder_type="task",
		reference_doctype="CRM Task",
		reference_name=task.name,
		reminder_key=row.name,
		trigger_at=trigger,
		occurrence_start=due_at,
		before=int(row.before or 0),
		interval=(row.interval or "").lower(),
		title=task.title or frappe._("Task"),
		crm_company=task.crm_company,
		recipients=_recipients(task),
		related_doctype=task.reference_doctype or None,
		related_name=task.reference_docname or None,
		email=row.type != "Notification",
		context={
			"category": "Task",
			"priority": task.priority,
			"status": task.status,
			"description": task.description,
			# The live pop-up (EventNotificationPopup). One per reminder, so a
			# "1 day before" that was dismissed doesn't hide the "1 hour before".
			"popup": {
				"event_name": f"task:{task.name}:{trigger.isoformat()}",
				"kind": "task",
				"task": task.name,
				"subject": task.title or frappe._("Task"),
				"starts_on": str(due_at),
				"priority": task.priority,
				"owner": task.owner,
			},
		},
	)


def _recipients(task) -> list:
	for user in (task.assigned_to, task.owner):
		recipient = user_recipient(user)
		if recipient and user_in_company(recipient.user, task.crm_company):
			return [recipient]
	return []
