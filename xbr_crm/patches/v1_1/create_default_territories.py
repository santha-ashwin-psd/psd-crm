import frappe

from xbr_crm.install import add_default_territories


def execute():
	"""Back-fill CRM Territory on sites installed before it was seeded.

	The doctype has always existed but nothing populated it, so the Territory
	field looked broken on every existing site. `add_default_territories` skips
	names that already exist, so this is safe to re-run.
	"""
	if not frappe.db.exists("DocType", "CRM Territory"):
		return

	add_default_territories()
	frappe.db.commit()
