import json

import frappe

RENAMES = {
	"Organization Details": "Institution Details",
	"Select Organization": "Select Institution",
	"Organization": "Institution",
}


def execute():
	"""Show "Institution" where the pipeline layouts said "Organization".

	Only the saved section titles change; field names (`organization`...) and the
	CRM Organization doctype keep their names, so no data moves. Safe to run
	more than once.
	"""
	if not frappe.db.exists("DocType", "CRM Fields Layout"):
		return

	for name in frappe.get_all("CRM Fields Layout", filters={"dt": "CRM Deal"}, pluck="name"):
		raw = frappe.db.get_value("CRM Fields Layout", name, "layout")
		try:
			layout = json.loads(raw) if raw else None
		except ValueError:
			continue
		if layout is None:
			continue
		renamed = _rename(layout)
		if renamed != layout:
			frappe.db.set_value("CRM Fields Layout", name, "layout", json.dumps(renamed), update_modified=False)
		frappe.clear_cache(doctype="CRM Fields Layout")


def _rename(node):
	"""Rename every `label` value in a layout tree (sections, tabs, columns)."""
	if isinstance(node, list):
		return [_rename(n) for n in node]
	if isinstance(node, dict):
		return {
			k: (RENAMES.get(v, v) if k == "label" and isinstance(v, str) else _rename(v))
			for k, v in node.items()
		}
	return node