"""Introduce per-company tenancy on an existing single-tenant site.

Creates the `crm_company` field everywhere, folds every existing record and CRM user
into one default company, and leaves `tenancy_strict` OFF so behaviour is unchanged
until an operator deliberately turns isolation on.

Idempotent: re-running is a no-op once FCRM Settings.default_crm_company is set.
"""

import click
import frappe

from crm.fcrm.doctype.crm_company.crm_company import normalize_company_name
from crm.permissions.tenancy import TENANT_DOCTYPES, TENANT_FIELD
from crm.tenancy.install import create_tenancy_custom_fields

CRM_ROLES = ("System Manager", "Sales Manager", "Sales User")


def execute():
	create_tenancy_custom_fields()

	if frappe.db.get_single_value("FCRM Settings", "default_crm_company"):
		return

	company = _ensure_default_company()
	if not company:
		return

	_backfill_records(company)
	_map_existing_users(company)

	frappe.db.set_single_value("FCRM Settings", "default_crm_company", company)
	# Deliberately NOT setting tenancy_strict — an operator flips that by hand once
	# a second company exists and isolation has been verified.
	frappe.db.commit()
	click.secho(f"* CRM tenancy initialised under company: {company}", fg="green")


def _ensure_default_company() -> str | None:
	name = normalize_company_name(
		frappe.db.get_single_value("FCRM Settings", "brand_name")
		or frappe.db.get_single_value("Website Settings", "app_name")
		or "Default Company"
	)
	if len(name) < 2:
		name = "Default Company"

	if frappe.db.exists("CRM Company", name):
		return name

	doc = frappe.new_doc("CRM Company")
	doc.company_name = name
	doc.is_active = 1
	doc.insert(ignore_permissions=True)
	return doc.name


def _backfill_records(company: str):
	"""Stamp existing rows via raw UPDATE.

	Never load these as documents — a site with 100k+ leads would take hours and
	fire every on_update hook along the way.
	"""
	for doctype in TENANT_DOCTYPES:
		if not frappe.db.exists("DocType", doctype):
			continue
		if not frappe.db.table_exists(doctype):
			continue
		if not frappe.get_meta(doctype).has_field(TENANT_FIELD):
			continue

		table = f"tab{doctype}"
		frappe.db.sql(
			f"""UPDATE `{table}`
				SET `{TENANT_FIELD}` = %s
				WHERE `{TENANT_FIELD}` IS NULL OR `{TENANT_FIELD}` = ''""",
			(company,),
		)


def _map_existing_users(company: str):
	"""Give every existing CRM user a member row in the default company.

	Roles are read, never written: `flags.ignore_role_sync` stops the member row's
	on_update from rewriting Has Role / block_modules, which would strip desk access
	from real System Managers.
	"""
	users = frappe.get_all(
		"Has Role",
		filters={"role": ["in", CRM_ROLES], "parenttype": "User"},
		fields=["parent as user"],
		distinct=True,
		pluck="user",
	)
	candidates = [u for u in set(users) if u not in ("Administrator", "Guest")]
	if not candidates:
		return

	enabled = set(
		frappe.get_all(
			"User", filters={"name": ["in", candidates], "enabled": 1}, pluck="name"
		)
	)
	if not enabled:
		return

	# Oldest System Manager becomes the company admin; otherwise the oldest user.
	sys_managers = set(
		frappe.get_all(
			"Has Role",
			filters={"role": "System Manager", "parenttype": "User", "parent": ["in", list(enabled)]},
			pluck="parent",
		)
	)
	ordered = frappe.get_all(
		"User", filters={"name": ["in", list(enabled)]}, order_by="creation asc", pluck="name"
	)
	admin_pick = next((u for u in ordered if u in sys_managers), ordered[0] if ordered else None)

	for user in ordered:
		if frappe.db.exists("CRM Company Member", {"user": user}):
			continue
		roles = set(frappe.get_roles(user))
		if user == admin_pick:
			crm_role = "Company Admin"
		elif "Sales Manager" in roles or "System Manager" in roles:
			crm_role = "Sales Manager"
		else:
			crm_role = "Sales User"

		member = frappe.new_doc("CRM Company Member")
		member.user = user
		member.company = company
		member.crm_role = crm_role
		member.invited_by = ""
		member.flags.ignore_role_sync = True
		member.insert(ignore_permissions=True)
