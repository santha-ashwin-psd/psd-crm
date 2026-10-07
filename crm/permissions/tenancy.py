"""Per-company data isolation.

Every tenant-scoped doctype carries a `crm_company` custom field. These hooks keep
one company from reading another's records.

Two things to know before changing anything here:

1. Frappe ANDs every registered `permission_query_conditions` hook for a doctype
   (`frappe/model/db_query.py`), so this composes with `org_hierarchy` automatically.
   Do NOT add a wrapper that tries to merge them.

2. `has_permission` must return **True**, never None, when it has no opinion.
   `frappe/permissions.py` does `if not controller_permission: return bool(...)`,
   so a None here reads as a denial and locks everyone out.

`FCRM Settings.tenancy_strict` is the rollout switch. While it is off (the default),
a user with no company mapping and a record with no company both behave exactly as
they did before tenancy existed — which is what lets this land on a live single-tenant
site without blanking every list.
"""

import frappe
from frappe.utils.caching import request_cache

TENANT_FIELD = "crm_company"

# Doctypes that carry `crm_company`. Shared configuration (statuses, sources,
# industries, territories, lost reasons, field layouts, FCRM Settings) is
# deliberately global and must NOT be added here.
TENANT_DOCTYPES = (
	"CRM Lead",
	"CRM Deal",
	"CRM Task",
	"FCRM Note",
	"CRM Call Log",
	"CRM Organization",
	"Contact",
	# Not optional: org_hierarchy walks a single global lft/rgt nested set, so
	# without a company column two tenants' trees resolve each other's members.
	"CRM Sales Hierarchy",
)

# System Manager is the platform-operator role and sees everything.
_BYPASS_ROLES = {"System Manager"}


def is_bypass(user: str | None = None) -> bool:
	user = user or frappe.session.user
	# "Administrator" is a user, not a role — frappe.get_roles() never returns it,
	# so it has to be checked explicitly before the role lookup.
	if user == "Administrator":
		return True
	if not user or user == "Guest":
		return False
	return bool(set(frappe.get_roles(user)) & _BYPASS_ROLES)


@request_cache
def get_user_company(user: str | None = None) -> str | None:
	user = user or frappe.session.user
	if not user or user in ("Administrator", "Guest"):
		return None
	return frappe.db.get_value("CRM Company Member", {"user": user}, "company")


@request_cache
def is_strict() -> bool:
	try:
		return bool(frappe.db.get_single_value("FCRM Settings", "tenancy_strict"))
	except Exception:
		return False


def default_company() -> str | None:
	try:
		return frappe.db.get_single_value("FCRM Settings", "default_crm_company")
	except Exception:
		return None


def _has_tenant_field(doctype: str) -> bool:
	try:
		return bool(frappe.get_meta(doctype).has_field(TENANT_FIELD))
	except Exception:
		return False


def get_permission_query_conditions(user=None, doctype=None) -> str:
	"""SQL fragment restricting a list query to the caller's company.

	`doctype` arrives as a kwarg from frappe.call, which is what lets one function
	serve every tenant doctype instead of a closure per doctype.
	"""
	user = user or frappe.session.user
	if not doctype or is_bypass(user) or not _has_tenant_field(doctype):
		return ""

	company = get_user_company(user)
	# Column must be table-qualified: CRM's list query joins ToDo, so a bare
	# `crm_company` would be ambiguous or bind to the wrong table.
	col = f"`tab{doctype}`.`{TENANT_FIELD}`"

	if not company:
		# Unmapped user: invisible under strict, unchanged behaviour otherwise.
		return "1=0" if is_strict() else ""

	esc = frappe.db.escape(company)
	if is_strict():
		return f"{col} = {esc}"
	# Lenient: un-backfilled rows stay visible so nothing disappears mid-migration.
	return f"({col} = {esc} OR {col} IS NULL OR {col} = '')"


def has_permission(doc, ptype=None, user=None, **kwargs) -> bool:
	user = user or frappe.session.user
	if is_bypass(user):
		return True
	# Creates are stamped in before_insert; there is nothing to check yet.
	if ptype == "create" or not getattr(doc, "name", None):
		return True

	doc_company = getattr(doc, TENANT_FIELD, None)
	if not doc_company:
		return not is_strict()

	company = get_user_company(user)
	if not company:
		return not is_strict()
	return doc_company == company


def stamp_company(doc, method=None):
	"""Tag a new record with its creator's company (before_insert)."""
	if not _has_tenant_field(doc.doctype):
		return
	if getattr(doc, TENANT_FIELD, None):
		return
	# Falling back to the default company keeps Administrator-created records from
	# landing unscoped and vanishing from every tenant's list under strict mode.
	company = get_user_company(frappe.session.user) or default_company()
	if company:
		doc.set(TENANT_FIELD, company)


def tenant_criterion(table):
	"""pypika Criterion for raw frappe.qb queries, or None when not applicable.

	Permission hooks only cover DatabaseQuery; anything built with frappe.qb
	(the dashboard, parts of the session API) has to apply this by hand.
	"""
	user = frappe.session.user
	if is_bypass(user):
		return None

	company = get_user_company(user)
	col = getattr(table, TENANT_FIELD)

	if not company:
		if not is_strict():
			return None
		# Match nothing rather than everything.
		return col == "__no_company__"

	if is_strict():
		return col == company
	return col.isnull() | (col == "") | (col == company)
