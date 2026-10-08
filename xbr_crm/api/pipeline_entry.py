# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Helpers behind the Create Pipeline form.

Contact search, the live duplicate warning, and the clean-up and matching that
`create_deal` applies. Every lookup is limited to the company the new pipeline
will belong to, so one company's form never offers or links another company's
contacts and organisations.
"""

import re

import frappe
from frappe import _

from xbr_crm.api.web_lead import normalize_mobile
from xbr_crm.permissions.tenancy import default_company, get_user_company, is_strict

INTERNATIONAL = re.compile(r"^\+\d{8,15}$")


def entry_company() -> str | None:
	"""The company a pipeline created now is stamped with (see tenancy.stamp_company)."""
	return get_user_company(frappe.session.user) or default_company()


def clean_mobile(raw: str | None) -> str | None:
	"""Indian numbers as +91XXXXXXXXXX; other numbers kept only in +<country> form.

	Raises a validation error for anything that is neither.
	"""
	raw = (raw or "").strip()
	if not raw:
		return None
	indian = normalize_mobile(raw)
	if indian:
		return indian
	compact = "+" + re.sub(r"\D", "", raw) if raw.startswith("+") else None
	if compact and INTERNATIONAL.match(compact):
		return compact
	frappe.throw(
		_("Enter a valid 10-digit mobile number, or an international number starting with +"),
		title=_("Invalid mobile number"),
	)


def clean_email(raw: str | None) -> str | None:
	email = (raw or "").strip().lower()
	if not email:
		return None
	if not frappe.utils.validate_email_address(email):
		frappe.throw(_("{0} is not a valid email address").format(email), title=_("Invalid email"))
	return email


def _scope(alias: str) -> tuple[str, dict]:
	"""SQL condition restricting `alias` to the entry company, plus its params."""
	company = entry_company()
	if not company:
		return "1=1", {}
	if is_strict():
		return f"{alias}.crm_company = %(company)s", {"company": company}
	# Lenient tenancy: records not yet assigned to a company are shared.
	return f"({alias}.crm_company = %(company)s or ifnull({alias}.crm_company, '') = '')", {
		"company": company
	}


def _contacts(names: list[str], matched_on: dict | None = None) -> list[dict]:
	if not names:
		return []
	rows = frappe.get_all(
		"Contact",
		filters={"name": ("in", names)},
		fields=["name", "full_name", "first_name", "last_name", "email_id", "mobile_no", "company_name"],
	)
	by_name = {r.name: r for r in rows}
	out = []
	for name in names:
		row = by_name.get(name)
		if not row:
			continue
		out.append(
			{
				"name": row.name,
				"full_name": row.full_name or " ".join(filter(None, [row.first_name, row.last_name])),
				"email": row.email_id,
				"mobile_no": row.mobile_no,
				"organization": row.company_name
				if row.company_name and frappe.db.exists("CRM Organization", row.company_name)
				else None,
				"matched_on": (matched_on or {}).get(name),
			}
		)
	return out


def matching_contacts(email: str | None, mobile_no: str | None, limit: int = 5) -> list[dict]:
	"""This company's contacts with the same mobile (any format) or email, newest first."""
	condition, params = _scope("c")
	found: dict[str, str] = {}

	if mobile_no:
		rows = frappe.db.sql(
			f"""
			select c.name, p.phone
			from `tabContact` c
			join `tabContact Phone` p on p.parent = c.name and p.parenttype = 'Contact'
			where {condition} and p.phone like %(tail)s
			order by c.creation desc
			""",
			{**params, "tail": f"%{mobile_no[-4:]}"},
			as_dict=True,
		)
		for row in rows:
			same = normalize_mobile(row.phone) == mobile_no or (
				"+" + re.sub(r"\D", "", row.phone or "") == mobile_no
			)
			if same:
				found.setdefault(row.name, "mobile")

	if email:
		rows = frappe.db.sql(
			f"""
			select c.name
			from `tabContact` c
			join `tabContact Email` e on e.parent = c.name and e.parenttype = 'Contact'
			where {condition} and lower(e.email_id) = %(email)s
			order by c.creation desc
			""",
			{**params, "email": email},
			as_dict=True,
		)
		for row in rows:
			found.setdefault(row.name, "email")

	names = list(found)[:limit]
	return _contacts(names, found)


def matching_organization(name: str | None) -> str | None:
	"""This company's organisation with exactly this name, if any."""
	if not name:
		return None
	condition, params = _scope("o")
	rows = frappe.db.sql(
		f"""
		select o.name from `tabCRM Organization` o
		where {condition} and o.organization_name = %(org)s
		order by o.creation asc limit 1
		""",
		{**params, "org": name.strip()},
	)
	return rows[0][0] if rows else None


@frappe.whitelist()
def find_duplicates(email: str | None = None, mobile_no: str | None = None) -> list[dict]:
	"""Contacts the form should warn about. Malformed input simply matches nothing."""
	frappe.has_permission("Contact", "read", throw=True)
	try:
		mobile = clean_mobile(mobile_no)
	except frappe.ValidationError:
		mobile = None
	frappe.clear_messages()
	email = (email or "").strip().lower()
	if email and not frappe.utils.validate_email_address(email):
		email = None
	if not (email or mobile):
		return []
	return matching_contacts(email or None, mobile)


@frappe.whitelist()
def search_contacts(txt: str = "", limit: int = 8) -> list[dict]:
	"""Contacts by name, email or mobile, within what the user may see."""
	txt = (txt or "").strip()
	limit = min(int(limit or 8), 20)
	or_filters = []
	if txt:
		like = f"%{txt}%"
		or_filters = [["full_name", "like", like], ["email_id", "like", like]]
		digits = re.sub(r"\D", "", txt)
		if len(digits) >= 4:
			or_filters.append(["mobile_no", "like", f"%{digits[-10:]}%"])
	names = frappe.get_list(
		"Contact",
		or_filters=or_filters,
		pluck="name",
		order_by="modified desc",
		limit=limit,
	)
	return _contacts(names)
