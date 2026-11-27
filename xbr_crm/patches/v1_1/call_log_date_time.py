"""Show "Call Date & Time" (start_time) in Create Call Log, so a call made
earlier (yesterday, say) can be logged with the time it happened.

Adds the field to the existing Quick Entry layout right after Duration (or at
the end of the first column if Duration was removed). Leaves a layout that
already has it alone.
"""

import json

import frappe

LAYOUT = "CRM Call Log-Quick Entry"


def execute():
	if not frappe.db.exists("CRM Fields Layout", LAYOUT):
		return
	doc = frappe.get_doc("CRM Fields Layout", LAYOUT)
	try:
		layout = json.loads(doc.layout or "[]")
	except ValueError:
		return
	columns = [c for section in layout for c in section.get("columns") or []]
	if not columns or any("start_time" in (c.get("fields") or []) for c in columns):
		return
	target = next((c for c in columns if "duration" in (c.get("fields") or [])), columns[0])
	fields = target.setdefault("fields", [])
	at = fields.index("duration") + 1 if "duration" in fields else len(fields)
	fields.insert(at, "start_time")
	doc.layout = json.dumps(layout)
	doc.save(ignore_permissions=True)
