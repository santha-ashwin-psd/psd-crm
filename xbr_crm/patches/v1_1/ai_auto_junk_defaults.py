"""Give sites that already have FCRM Settings the defaults of the "Move junk
automatically" settings: 90% confidence and a 12-hour wait.

A Single's field defaults only apply to a new site; an existing one would read
0 (move at any confidence, with no wait). Only values never set are filled.
"""

import frappe


def execute():
	if not frappe.db.get_single_value("FCRM Settings", "ai_auto_junk_confidence"):
		frappe.db.set_single_value("FCRM Settings", "ai_auto_junk_confidence", 90)
	# 0 is a valid choice here ("move straight away"), so only fill a value that
	# was never stored.
	if not frappe.db.exists("Singles", {"doctype": "FCRM Settings", "field": "ai_auto_junk_after_hours"}):
		frappe.db.set_single_value("FCRM Settings", "ai_auto_junk_after_hours", 12)
