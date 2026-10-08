# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""The reminder sources. Each provider returns the reminders due in a window.

Adding a new kind of reminder means adding one entry here: the service then
sends its notification and email exactly like every other kind.
"""

from xbr_crm.reminders import events, tasks

# key -> (label, provider function, FCRM Settings checkbox for its emails,
#         Email Template name)
PROVIDERS = {
	"event": ("Event", events.due_reminders, "enable_event_reminder_emails", "Event Reminder"),
	"task": ("Task", tasks.due_reminders, "enable_task_reminder_emails", "Task Reminder"),
}
