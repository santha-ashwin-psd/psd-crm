"""Company-admin actions: invite and manage the members of your own company.

The company is always derived from the *caller's* own member row, never from a
request parameter — that is what stops one company's admin from acting on another's.
"""

import secrets
import string

import frappe
from frappe import _

from crm.permissions.tenancy import default_company, get_user_company, is_bypass
from crm.tenancy import emails
from crm.tenancy.auth import signin_url

# "Company Admin" deliberately does not map to System Manager — that role bypasses
# tenancy entirely (see crm/permissions/tenancy.py), so handing it to a tenant
# would let them read every other company's data.
ASSIGNABLE_ROLES = ("Company Admin", "Sales Manager", "Sales User")


def _require_company_admin() -> str:
	"""Return the caller's company, or throw. Platform admins fall back to the default."""
	user = frappe.session.user
	if not user or user == "Guest":
		frappe.throw(_("Not permitted"), frappe.PermissionError)

	if is_bypass(user):
		company = get_user_company(user) or default_company()
		if not company:
			frappe.throw(_("No CRM Company exists yet."), frappe.PermissionError)
		return company

	row = frappe.db.get_value(
		"CRM Company Member", {"user": user}, ["company", "is_company_admin"], as_dict=True
	)
	if not row:
		frappe.throw(_("Your user is not linked to any company."), frappe.PermissionError)
	if not row.is_company_admin:
		frappe.throw(_("Only a company admin can do this."), frappe.PermissionError)
	return row.company


def _gen_temp_password(n: int = 12) -> str:
	alphabet = string.ascii_letters + string.digits
	return "".join(secrets.choice(alphabet) for _ in range(n))


@frappe.whitelist(methods=["POST"])
def invite_user(
	email: str,
	first_name: str = "",
	last_name: str = "",
	role: str = "Sales User",
) -> dict:
	"""Create a user in the caller's company and email them a temporary password."""
	company = _require_company_admin()
	email = (email or "").strip().lower()

	if not email:
		frappe.throw(_("Email is required."))
	frappe.utils.validate_email_address(email, throw=True)
	if role not in ASSIGNABLE_ROLES:
		frappe.throw(_("Invalid role: {0}").format(role))
	if frappe.db.exists("User", email):
		frappe.throw(_("A user with email {0} already exists.").format(email))

	temp_password = _gen_temp_password()
	first_name = (first_name or "").strip() or email.split("@")[0].title()

	user = frappe.new_doc("User")
	user.email = email
	user.first_name = first_name
	user.last_name = (last_name or "").strip()
	user.user_type = "System User"
	user.enabled = 1
	user.send_welcome_email = 0  # we send our own, via the system SMTP
	user.flags.ignore_password_policy = True

	# See crm/tenancy/auth.py: Frappe's "no roles enabled" warning links into the
	# blocked desk, and the member row below grants the roles a moment later.
	muted = frappe.flags.mute_messages
	frappe.flags.mute_messages = True
	try:
		user.insert(ignore_permissions=True)
	finally:
		frappe.flags.mute_messages = muted

	from frappe.utils.password import update_password

	update_password(email, temp_password)

	member = frappe.new_doc("CRM Company Member")
	member.user = email
	member.company = company
	member.crm_role = role
	member.invited_by = frappe.session.user
	member.insert(ignore_permissions=True)  # on_update grants roles + FCRM module

	frappe.db.commit()

	sent = emails.send_invite(email, first_name, company, temp_password, role, signin_url())
	return {"success": True, "user": email, "company": company, "role": role, "email_sent": sent}


@frappe.whitelist(methods=["POST"])
def invite_users(emails: str, role: str = "Sales User") -> dict:
	"""Invite several people at once.

	One bad address must not discard the rest, so each is attempted independently
	and the caller gets a per-email breakdown instead of a single throw.
	"""
	_require_company_admin()  # fail fast before doing any work

	from frappe.utils import split_emails

	candidates = [e.strip().lower() for e in split_emails(emails or "") if e.strip()]
	if not candidates:
		return {"invited": [], "skipped": [], "failed": []}

	invited, skipped, failed = [], [], []
	seen = set()
	for email in candidates:
		if email in seen:
			continue
		seen.add(email)
		if frappe.db.exists("User", email):
			skipped.append(email)
			continue
		try:
			invite_user(email=email, role=role)
			invited.append(email)
		except Exception as exc:
			frappe.log_error(frappe.get_traceback(), f"CRM invite failed: {email}")
			failed.append({"email": email, "reason": str(exc)})

	return {"invited": invited, "skipped": skipped, "failed": failed}


@frappe.whitelist()
def get_company_members() -> list[dict]:
	"""Members of the caller's company, for the Users settings screen."""
	company = _require_company_admin()
	members = frappe.get_all(
		"CRM Company Member",
		filters={"company": company},
		fields=["user", "crm_role", "is_company_admin", "invited_by", "joined_on"],
		order_by="joined_on asc",
	)
	if not members:
		return []

	info = {
		u.name: u
		for u in frappe.get_all(
			"User",
			filters={"name": ["in", [m.user for m in members]]},
			fields=["name", "full_name", "user_image", "enabled"],
		)
	}
	for m in members:
		u = info.get(m.user) or {}
		m.full_name = u.get("full_name") or m.user
		m.user_image = u.get("user_image")
		m.enabled = u.get("enabled", 0)
	return members


@frappe.whitelist(methods=["POST"])
def update_member_role(user: str, role: str) -> dict:
	company = _require_company_admin()
	if role not in ASSIGNABLE_ROLES:
		frappe.throw(_("Invalid role: {0}").format(role))

	name = frappe.db.get_value("CRM Company Member", {"user": user, "company": company})
	if not name:
		frappe.throw(_("{0} is not a member of your company.").format(user), frappe.PermissionError)
	if user == frappe.session.user:
		frappe.throw(_("You cannot change your own role."))

	member = frappe.get_doc("CRM Company Member", name)
	member.crm_role = role
	member.save(ignore_permissions=True)
	frappe.db.commit()
	return {"success": True, "user": user, "role": role}


@frappe.whitelist(methods=["POST"])
def remove_member(user: str) -> dict:
	"""Detach a user from the company and disable their login."""
	company = _require_company_admin()
	if user == frappe.session.user:
		frappe.throw(_("You cannot remove yourself."))
	if user in ("Administrator", "Guest"):
		frappe.throw(_("This user cannot be removed."))

	name = frappe.db.get_value("CRM Company Member", {"user": user, "company": company})
	if not name:
		frappe.throw(_("{0} is not a member of your company.").format(user), frappe.PermissionError)

	frappe.delete_doc("CRM Company Member", name, ignore_permissions=True)
	# Disable rather than delete: their leads, deals and activity still reference them.
	frappe.db.set_value("User", user, "enabled", 0)
	frappe.db.commit()
	return {"success": True, "user": user}
