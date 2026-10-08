import frappe
from frappe.utils import now_datetime


def execute():
	"""Switch reminder emails on, starting now.

	New fields on a single doctype don't get their defaults on an existing site,
	so they are set here. The start time means nothing due before deploy is emailed.
	"""
	for field in ("enable_reminder_emails", "enable_event_reminder_emails", "enable_task_reminder_emails"):
		frappe.db.set_single_value("FCRM Settings", field, 1)
	frappe.db.set_single_value("FCRM Settings", "reminder_emails_enabled_on", now_datetime())
