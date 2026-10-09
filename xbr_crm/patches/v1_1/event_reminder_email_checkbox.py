import frappe


def execute():
	"""Turn email on for every existing event reminder.

	Until now the Notification/Email choice was ignored and every event reminder
	was emailed. The choice is now an "email" checkbox that is honoured, so the
	existing rows (per event and the global defaults) are set to Email to keep
	sending what they sent before.
	"""
	frappe.db.sql(
		"""
		update `tabEvent Notifications` set type = 'Email'
		where parenttype in ('Event', 'FCRM Settings') and ifnull(type, '') != 'Email'
		"""
	)
	frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
