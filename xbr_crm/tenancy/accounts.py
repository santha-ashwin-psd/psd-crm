# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Account states shared by invites and signup."""

import json

import frappe


def is_removed_member(email: str) -> bool:
	"""Whether `email` is a CRM user an admin removed from their company.

	Removing a member (tenancy/admin.py::remove_member) disables the User and
	deletes their CRM Company Member row rather than deleting the User, because
	their records still reference them. Such an account can be brought back by a
	new invite.

	Only accounts that provably went through that path qualify: disabled, in no
	company, not a System Manager, and with a deleted CRM Company Member row on
	record. A user disabled for any other reason (by the site admin, say) is never
	treated as removed, so a company admin cannot re-enable it through an invite.
	"""
	if not email or email in ("Administrator", "Guest"):
		return False
	enabled = frappe.db.get_value("User", email, "enabled")
	if enabled is None or enabled:
		return False
	if frappe.db.exists("CRM Company Member", {"user": email}):
		return False
	if "System Manager" in frappe.get_roles(email):
		return False

	# LIKE narrows the scan; the JSON check makes it exact (`_` and `%` in an
	# address are LIKE wildcards).
	candidates = frappe.get_all(
		"Deleted Document",
		filters={
			"deleted_doctype": "CRM Company Member",
			"data": ["like", f"%{json.dumps(email)}%"],
		},
		pluck="data",
		limit=20,
	)
	for data in candidates:
		try:
			if json.loads(data).get("user") == email:
				return True
		except (TypeError, ValueError):
			continue
	return False
