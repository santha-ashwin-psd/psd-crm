"""Recovery commands for a site whose Settings menu entry has gone missing.

Not whitelisted — these are `bench execute` only, never reachable over HTTP.

The Settings dropdown entry is the one menu item that cannot be repaired from
the UI: the screen for editing the dropdown list *is* Settings. If the row is
missing or hidden, the only way back in is from the command line.
"""

import frappe

SETTINGS_ITEM = "settings"


def show_dropdown_items() -> list[dict]:
	"""Print the site's user-menu rows. Run this first — it tells you whether the
	Settings entry is missing entirely or merely hidden, which is a different fix.

	    bench --site <site> execute crm.utils.repair.show_dropdown_items
	"""
	settings = frappe.get_single("FCRM Settings")
	rows = [
		{
			"idx": r.idx,
			"name1": r.name1,
			"label": r.label,
			"type": r.type,
			"hidden": r.hidden,
			"is_standard": r.is_standard,
		}
		for r in (settings.dropdown_items or [])
	]

	if not rows:
		print("No dropdown items at all — run crm.install.add_standard_dropdown_items")
		return rows

	print(f"{'idx':>4}  {'name1':<16} {'label':<24} {'hidden':<7} standard")
	for r in rows:
		print(f"{r['idx']:>4}  {r['name1'] or '':<16} {r['label'] or '':<24} {r['hidden']!s:<7} {r['is_standard']}")

	item = next((r for r in rows if r["name1"] == SETTINGS_ITEM), None)
	if item is None:
		print("\n-> The 'settings' row is MISSING. Fix: crm.utils.repair.fix_settings_menu")
	elif item["hidden"]:
		print("\n-> The 'settings' row exists but is HIDDEN. Fix: crm.utils.repair.fix_settings_menu")
	else:
		print(
			"\n-> The 'settings' row is present and visible, so the menu is not the "
			"cause. Check the browser console for a JS error, confirm the frontend "
			"was rebuilt (yarn build), and hard-reload to clear the cached bundle."
		)
	return rows


def fix_settings_menu() -> dict:
	"""Restore the Settings entry: add it if absent, unhide it if hidden.

	    bench --site <site> execute crm.utils.repair.fix_settings_menu

	Only ever touches the Settings row. Other entries — including any the site
	has deliberately hidden — are left exactly as they are.
	"""
	from crm.install import add_standard_dropdown_items

	added = add_standard_dropdown_items()

	settings = frappe.get_single("FCRM Settings")
	row = next((r for r in (settings.dropdown_items or []) if r.name1 == SETTINGS_ITEM), None)

	if row is None:
		# add_standard_dropdown_items should have created it; if it did not, the
		# hook itself is missing, which means the app is not properly installed.
		frappe.throw(
			"Could not create the Settings dropdown item. Check that the crm app is "
			"installed on this site (bench --site <site> list-apps)."
		)

	unhidden = False
	if row.hidden:
		row.hidden = 0
		settings.save()
		unhidden = True

	frappe.db.commit()
	frappe.clear_cache()

	result = {"added": added, "unhidden": unhidden, "visible": True}
	print(
		f"Settings menu repaired: added={added or 'nothing'}, unhidden={unhidden}.\n"
		"Ask the user to hard-reload the browser (Cmd/Ctrl+Shift+R)."
	)
	return result
