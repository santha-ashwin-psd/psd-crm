import json

import frappe

from xbr_crm.install import DEFAULT_DEAL_STATUSES

# Old stage -> the new stage its pipelines move to. "Qualification" keeps its name.
OLD_TO_NEW = {
	"Demo/Making": "Needs Analysis",
	"Proposal/Quotation": "Proposal/Price Quote",
	"Negotiation": "Negotiation/Review",
	"Ready to Close": "Negotiation/Review",
	"Won": "Closed Won",
	"Lost": "Closed Lost",
}


def execute():
	"""Replace the default pipeline stages with the IEA board's ten stages.

	Creates or updates the new stages (order, type, probability, colour), moves
	every pipeline off the old stages, follows them in the few settings that store
	a stage name, then removes the old stages. Stages a site added itself are kept,
	after the new ones. Status-change history stores names as plain text, so past
	entries keep reading as they did. Safe to run more than once.
	"""
	if not frappe.db.exists("DocType", "CRM Deal Status"):
		return

	for position, (name, (status_type, probability, color)) in enumerate(DEFAULT_DEAL_STATUSES.items(), 1):
		values = {"type": status_type, "probability": probability, "color": color, "position": position}
		if frappe.db.exists("CRM Deal Status", name):
			frappe.db.set_value("CRM Deal Status", name, values, update_modified=False)
		else:
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": name, **values}).insert(
				ignore_permissions=True
			)

	for old, new in OLD_TO_NEW.items():
		frappe.db.sql("update `tabCRM Deal` set status = %s where status = %s", (new, old))

	_remap_settings()

	for old in OLD_TO_NEW:
		if frappe.db.exists("CRM Deal Status", old):
			frappe.delete_doc("CRM Deal Status", old, force=True, ignore_permissions=True)

	# Any stage the site created itself goes after the new board, in its old order.
	extra = frappe.get_all(
		"CRM Deal Status",
		filters={"name": ("not in", list(DEFAULT_DEAL_STATUSES))},
		order_by="position asc",
		pluck="name",
	)
	for offset, name in enumerate(extra, len(DEFAULT_DEAL_STATUSES) + 1):
		frappe.db.set_value("CRM Deal Status", name, "position", offset, update_modified=False)

	frappe.clear_cache(doctype="CRM Deal Status")
	frappe.clear_cache(doctype="CRM Deal")


def _remap_settings():
	"""Follow the stage rename in the settings that store a stage by name."""
	if frappe.db.exists("DocType", "ERPNext CRM Settings"):
		current = frappe.db.get_single_value("ERPNext CRM Settings", "deal_status")
		if current in OLD_TO_NEW:
			frappe.db.set_single_value("ERPNext CRM Settings", "deal_status", OLD_TO_NEW[current])

	# Saved pipeline views: a `status` filter, and the kanban column list.
	for view in frappe.get_all(
		"CRM View Settings", filters={"dt": "CRM Deal"}, fields=["name", "filters", "kanban_columns"]
	):
		updates = {}
		filters = _load(view.filters)
		if isinstance(filters, dict) and "status" in filters:
			remapped = dict(filters, status=_remap(filters["status"]))
			if remapped != filters:
				updates["filters"] = json.dumps(remapped)
		columns = _load(view.kanban_columns)
		if isinstance(columns, list):
			remapped = [
				dict(c, name=_remap(c["name"])) if isinstance(c, dict) and "name" in c else c for c in columns
			]
			remapped = _dedupe_columns(remapped)
			if remapped != columns:
				updates["kanban_columns"] = json.dumps(remapped)
		if updates:
			frappe.db.set_value("CRM View Settings", view.name, updates, update_modified=False)


def _dedupe_columns(columns: list) -> list:
	"""Two old stages map onto Negotiation/Review: keep one column per stage."""
	seen = set()
	out = []
	for column in columns:
		name = column.get("name") if isinstance(column, dict) else None
		if name and name in seen:
			continue
		seen.add(name)
		out.append(column)
	return out


def _load(raw):
	try:
		return json.loads(raw) if raw else None
	except ValueError:
		return None


def _remap(value):
	"""An old stage name (or a list/filter of them) with the new names in place."""
	if isinstance(value, str):
		return OLD_TO_NEW.get(value, value)
	if isinstance(value, list):
		return [_remap(v) for v in value]
	return value
