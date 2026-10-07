# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""The Leads on/off switch (`FCRM Settings.enable_leads`).

Leads are hidden, not removed: the CRM Lead doctype, its data and its code all
stay, so turning the setting back on restores the feature as it was. While it is
off, the UI hides every lead entry point and the server refuses lead writes that
come from a person, so a stale tab or a hand-crafted API call cannot create one.

Integrations that write with `ignore_permissions` (the website inquiry API) are
deliberately not blocked here — they authenticate by other means and are switched
over separately.
"""

import frappe
from frappe import _

# Dashboard cards that only make sense when leads exist.
LEAD_DASHBOARD_CARDS = frozenset(
	{
		"total_leads",
		"average_time_to_close_a_lead",
		"leads_by_source",
	}
)

# Deal fields that point back at the lead a deal was converted from.
DEAL_LEAD_FIELDS = frozenset({"lead", "lead_name"})


def _setting() -> bool:
	return bool(frappe.db.get_single_value("FCRM Settings", "enable_leads", cache=True))


def leads_enabled() -> bool:
	"""Whether the Leads feature is switched on.

	Under the test runner Leads count as on: the existing suites exercise lead
	behaviour and must not depend on, or change, the site's own setting. Tests of
	the switch itself opt back in with `frappe.flags.leads_switch_under_test`.
	"""
	if frappe.flags.in_test and not frappe.flags.get("leads_switch_under_test"):
		return True
	return _setting()


def hidden_lead_fields(doctype: str) -> set[str]:
	"""Fieldnames to leave out of column, filter, sort and group-by pickers.

	Empty while Leads are on. While they are off: the deal's back-reference to
	its lead, plus any field on the doctype that links to CRM Lead.
	"""
	if leads_enabled():
		return set()

	hidden = set(DEAL_LEAD_FIELDS) if doctype == "CRM Deal" else set()
	try:
		meta = frappe.get_meta(doctype)
	except frappe.DoesNotExistError:
		return hidden
	hidden.update(f.fieldname for f in meta.fields if f.fieldtype == "Link" and f.options == "CRM Lead")
	return hidden


def leads_disabled_message() -> str:
	return _("Leads are disabled. Enable them in Settings → General to use leads.")


def throw_if_leads_disabled():
	if not leads_enabled():
		frappe.throw(leads_disabled_message(), frappe.PermissionError, title=_("Leads disabled"))


def guard_lead_write(doc):
	"""Refuse a user-initiated lead write while leads are disabled.

	Skipped for writes made with `ignore_permissions` (server-side integrations),
	for background jobs and the console (no HTTP request, so no person clicked
	anything), and during install, migrate and patches.
	"""
	if doc.flags.ignore_permissions:
		return
	if not getattr(frappe.local, "request", None):
		return
	if frappe.flags.in_install or frappe.flags.in_migrate or frappe.flags.in_patch:
		return
	throw_if_leads_disabled()
