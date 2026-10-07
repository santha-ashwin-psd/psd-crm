# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Audit trail for inbound website inquiries.

Every request that reaches the endpoint writes exactly one row here — success,
duplicate or error — so a submission that failed validation can be read back and
replayed by hand instead of being lost with the HTTP response.
"""

import json

import frappe
from frappe.model.document import Document

# Keys we refuse to persist even if the website sends them. The API key travels
# in a header and never reaches the payload, but a misconfigured caller could put
# a secret in the body, and this table is readable by every System Manager.
REDACTED_KEYS = {"api_key", "apikey", "x-lead-api-key", "password", "secret", "token", "captcha_secret"}

REDACTED = "***redacted***"


class CRMWebLeadLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		client_ip: DF.Data | None
		crm_company: DF.Link | None
		form_type: DF.Data | None
		key_name: DF.Data | None
		lead: DF.Link | None
		message: DF.SmallText | None
		payload: DF.Code | None
		result: DF.Literal["success", "duplicate", "error"]
		submission_hash: DF.Data | None
		traceback: DF.Code | None
	# end: auto-generated types

	pass


def redact(payload: dict | None) -> dict:
	"""Copy of `payload` with anything secret-shaped replaced."""
	if not isinstance(payload, dict):
		return {}
	return {k: (REDACTED if k.lower() in REDACTED_KEYS else v) for k, v in payload.items()}


def write_log(
	result: str,
	payload: dict | None = None,
	key=None,
	lead: str | None = None,
	message: str | None = None,
	traceback: str | None = None,
	client_ip: str | None = None,
	submission_hash: str | None = None,
) -> str | None:
	"""Record one inbound request. Never raises into the caller.

	Logging must not be able to turn a successful lead into a failed HTTP response,
	so every failure here is swallowed and reported to the error log instead.
	"""
	try:
		doc = frappe.new_doc("CRM Web Lead Log")
		doc.result = result
		doc.lead = lead
		doc.message = (message or "")[:500] or None
		doc.traceback = traceback
		doc.client_ip = client_ip
		doc.submission_hash = submission_hash
		doc.form_type = (payload or {}).get("form_type")
		doc.payload = json.dumps(redact(payload), indent=2, default=str)
		if key is not None:
			doc.key_name = key.name
			doc.crm_company = key.crm_company
		# The log is written while the session is Guest, which holds no permission
		# on this doctype by design — the endpoint has already authenticated the
		# caller by API key at this point.
		doc.insert(ignore_permissions=True)
		return doc.name
	except Exception:
		frappe.log_error(
			title="CRM Web Lead Log write failed",
			message=frappe.get_traceback(with_context=True),
		)
		return None
