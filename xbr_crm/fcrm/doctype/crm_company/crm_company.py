# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import now_datetime


class CRMCompany(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		company_name: DF.Data
		created_on: DF.Datetime | None
		email: DF.Data | None
		is_active: DF.Check
		owner_user: DF.Link | None
	# end: auto-generated types

	def validate(self):
		# The doc name IS the company name (autoname: field:company_name), so the
		# name has to be trimmed and whitespace-collapsed before insert or
		# "Acme  Ltd" and "Acme Ltd" become two different tenants.
		self.company_name = normalize_company_name(self.company_name)
		if not self.company_name:
			frappe.throw(_("Company name is required."))
		if len(self.company_name) < 2:
			frappe.throw(_("Company name must be at least 2 characters."))
		if not self.created_on:
			self.created_on = now_datetime()


def normalize_company_name(name: str | None) -> str:
	"""Trim and collapse internal whitespace.

	Shared with the signup API so the name checked for availability is byte-for-byte
	the name that later becomes the doc name.
	"""
	return " ".join((name or "").strip().split())
