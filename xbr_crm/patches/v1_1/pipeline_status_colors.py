import json

import frappe

from xbr_crm.install import DEFAULT_DEAL_STATUSES
from xbr_crm.patches.v1_1.pipeline_stages import _load


def execute():
	"""Recolour the eight pipeline stages and put saved kanban boards in board order.

	Sets the colour of each stage, then, for every saved pipeline view, drops the
	colours baked into its kanban columns (so the board derives them afresh from
	the stage) and puts the columns in the board's order, keeping hidden columns
	and per-column settings. Safe to run more than once.
	"""
	if not frappe.db.exists("DocType", "CRM Deal Status"):
		return

	for name, (_type, _probability, color) in DEFAULT_DEAL_STATUSES.items():
		if frappe.db.exists("CRM Deal Status", name):
			frappe.db.set_value("CRM Deal Status", name, "color", color, update_modified=False)

	order = {name: i for i, name in enumerate(DEFAULT_DEAL_STATUSES)}
	for view in frappe.get_all("CRM View Settings", filters={"dt": "CRM Deal"}, fields=["name", "kanban_columns"]):
		columns = _load(view.kanban_columns)
		if not isinstance(columns, list):
			continue
		cleaned = [{k: v for k, v in c.items() if k != "color"} if isinstance(c, dict) else c for c in columns]
		# Stable sort: stages on the board by position, anything else after them.
		cleaned.sort(key=lambda c: order.get(c.get("name"), len(order)) if isinstance(c, dict) else len(order))
		if cleaned != columns:
			frappe.db.set_value(
				"CRM View Settings", view.name, "kanban_columns", json.dumps(cleaned), update_modified=False
			)

	frappe.clear_cache(doctype="CRM Deal Status")
	frappe.clear_cache(doctype="CRM Deal")