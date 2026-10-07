# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime

# The member row is the source of truth for which company a user belongs to and
# what they may do inside it. Frappe's own `Has Role` rows are a derived mirror,
# rewritten by _sync_user_role() whenever this row changes.
#
# Note "Company Admin" maps to Sales Manager, NOT System Manager: System Manager
# is the tenancy *bypass* role (see xbr_crm/permissions/tenancy.py), so granting it to
# a tenant admin would let them read every other company's data.
ROLE_MAP = {
	"Company Admin": ("Sales Manager", "Sales User"),
	"Sales Manager": ("Sales Manager", "Sales User"),
	"Sales User": ("Sales User",),
}

CRM_ROLES = ("System Manager", "Sales Manager", "Sales User")


class CRMCompanyMember(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company: DF.Link
		crm_role: DF.Literal["Company Admin", "Sales Manager", "Sales User"]
		invited_by: DF.Link | None
		is_company_admin: DF.Check
		joined_on: DF.Datetime | None
		user: DF.Link
	# end: auto-generated types

	def validate(self):
		if self.user in ("Administrator", "Guest"):
			frappe.throw(_("{0} cannot be a company member.").format(self.user))
		if not self.joined_on:
			self.joined_on = now_datetime()
		# Admin-ness is implied by the role; keep the flag from drifting out of sync.
		self.is_company_admin = 1 if self.crm_role == "Company Admin" else 0

	def on_update(self):
		self._sync_user_role()

	def _sync_user_role(self):
		"""Mirror this row's role onto the linked User.

		Skipped when `flags.ignore_role_sync` is set — the backfill patch sets it so
		that mapping existing users into the default company does not rewrite the
		roles and block_modules of real System Managers.
		"""
		if self.flags.ignore_role_sync:
			return
		if not self.user or not frappe.db.exists("User", self.user):
			return

		from xbr_crm.api.user import remove_roles, update_module_in_user

		try:
			user_doc = frappe.get_doc("User", self.user)
			remove_roles(user_doc, *CRM_ROLES)
			user_doc.append_roles(*ROLE_MAP.get(self.crm_role, ("Sales User",)))
			# Confines the user to the CRM module (blocks every other Module Def),
			# which is also what check_app_permission() looks for.
			update_module_in_user(user_doc, "FCRM")
			user_doc.save(ignore_permissions=True)
		except Exception as exc:
			frappe.log_error(
				f"Role sync failed for {self.user}: {exc}", "CRM Company Member"
			)


def get_user_company(user: str | None = None) -> str | None:
	"""The company a user belongs to, or None for Administrator/Guest/unmapped."""
	user = user or frappe.session.user
	if not user or user in ("Administrator", "Guest"):
		return None
	return frappe.db.get_value("CRM Company Member", {"user": user}, "company")
