# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Record which door a lead came through.

`source` cannot answer this. It is a business field the sales team owns and edits
for attribution — "Referral", "Exhibition", "Cold Call" — so it is both editable
after the fact and about marketing channel rather than mechanism. A lead can
truthfully be source="Referral" and still have arrived through the website form.

`custom_created_via` is the system's own record: read-only, set once at insert,
and never guessed. The automated paths declare themselves; anything left over was
a person typing into the CRM, which is the only thing "Manual" should mean.
"""

import frappe

ORIGIN_FIELD = "custom_created_via"

WEBSITE = "Website"
EMAIL = "Email"
WHATSAPP = "WhatsApp"
MANUAL = "Manual"
API = "API"
IMPORT = "Import"


def stamp_origin(doc, method=None):
	"""before_insert: fill in how this record was created, if nothing has.

	An integration that knows its own origin sets the field before calling
	`insert()`, and this leaves it alone. Everything else is classified here.
	"""
	if not doc.meta.has_field(ORIGIN_FIELD):
		return
	if doc.get(ORIGIN_FIELD):
		# An integration already declared itself. Never overwrite that.
		return

	doc.set(ORIGIN_FIELD, detect_origin())


def detect_origin() -> str:
	"""Classify a creation that did not declare itself.

	Order matters: a data import and a background job both run without a browser
	request, so they have to be ruled out before "there is no request, therefore
	a script" turns into the wrong label.
	"""
	# A bulk import, including the Data Import tool.
	if frappe.flags.get("in_import") or frappe.flags.get("in_patch") or frappe.flags.get("in_install"):
		return IMPORT

	# No HTTP request at all: a scheduled job, a console session, a test.
	if not getattr(frappe.local, "request", None):
		return API

	# A request, but not from a logged-in person — a guest endpoint we have not
	# taught to declare itself. Honest to call that API rather than Manual.
	if frappe.session.user in ("Guest", None):
		return API

	return MANUAL
