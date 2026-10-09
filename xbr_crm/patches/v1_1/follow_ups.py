import json

import frappe

CARD = {
	"name": "overdue_follow_ups",
	"type": "number_chart",
	"tooltip": "Pipelines whose follow-up date has passed",
}
GRID_COLUMNS = 20


def execute():
	"""Follow-up settings with their defaults, and the overdue card on the dashboard.

	New fields on a single doctype do not get their defaults on an existing site,
	so they are set here.
	"""
	if not frappe.db.get_single_value("FCRM Settings", "follow_up_stage") and frappe.db.exists(
		"CRM Deal Status", "Followup"
	):
		frappe.db.set_single_value("FCRM Settings", "follow_up_stage", "Followup")
	if not frappe.db.get_single_value("FCRM Settings", "stuck_follow_up_days"):
		frappe.db.set_single_value("FCRM Settings", "stuck_follow_up_days", 10)
		frappe.db.set_single_value("FCRM Settings", "enable_stuck_follow_up_alerts", 1)

	if not frappe.db.exists("CRM Dashboard", "Manager Dashboard"):
		return
	layout = json.loads(frappe.db.get_value("CRM Dashboard", "Manager Dashboard", "layout") or "[]")
	updated = add_card_to_kpi_row(layout, CARD)
	if updated is not layout:
		frappe.db.set_value(
			"CRM Dashboard", "Manager Dashboard", "layout", json.dumps(updated), update_modified=False
		)


def add_card_to_kpi_row(layout: list, card: dict, beside: str = "ongoing_deals") -> list:
	"""The layout with `card` added to the row holding `beside`, widths re-spread.

	Returns the same list untouched when the card is already there or there is
	no such row.
	"""
	if any(item.get("name") == card["name"] for item in layout):
		return layout
	anchor = next((item for item in layout if item.get("name") == beside), None)
	if not anchor:
		return layout
	y = anchor["layout"]["y"]
	height = anchor["layout"].get("h", 3)
	row = sorted(
		(item for item in layout if item.get("layout", {}).get("y") == y),
		key=lambda item: item["layout"].get("x", 0),
	)
	new_item = dict(card, layout={"x": 0, "y": y, "w": 1, "h": height, "i": card["name"]})
	row.append(new_item)
	width, extra = divmod(GRID_COLUMNS, len(row))
	x = 0
	for i, item in enumerate(row):
		w = width + (1 if i < extra else 0)
		item["layout"] = {**item["layout"], "x": x, "w": w}
		x += w
	return [*layout, new_item]
