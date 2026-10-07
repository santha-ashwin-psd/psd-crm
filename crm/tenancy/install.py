"""Idempotent tenancy setup: the `crm_company` custom fields and the default company.

Split out of crm/install.py so the whole feature can be reverted by deleting the
`crm/tenancy` package and two hook entries.
"""

import click
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from crm.permissions.tenancy import TENANT_DOCTYPES, TENANT_FIELD


def _field_spec(insert_after: str | None = None) -> dict:
	spec = {
		"fieldname": TENANT_FIELD,
		"fieldtype": "Link",
		"label": "CRM Company",
		"options": "CRM Company",
		# Set by before_insert, never by the user; hidden so it does not clutter
		# every form. search_index matters — without it the extra predicate turns
		# index-covered list queries on large tables into scans.
		"read_only": 1,
		"no_copy": 1,
		"hidden": 1,
		"search_index": 1,
		"print_hide": 1,
	}
	if insert_after:
		spec["insert_after"] = insert_after
	return spec


def create_tenancy_custom_fields():
	"""Add `crm_company` to every tenant-scoped doctype. Safe to re-run."""
	pending = {}
	for doctype in TENANT_DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		if frappe.get_meta(doctype).has_field(TENANT_FIELD):
			continue
		pending[doctype] = [_field_spec()]

	if not pending:
		return

	click.secho(f"* Installing tenancy field in {len(pending)} doctype(s)")
	create_custom_fields(pending)
	for doctype in pending:
		frappe.clear_cache(doctype=doctype)


def setup_tenancy():
	"""Entry point called from crm.install.after_install."""
	create_tenancy_custom_fields()
