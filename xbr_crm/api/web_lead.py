# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Website inquiry capture.

One flow, kept deliberately small:

    visitor submits a form on ieagents.co.in
      -> the website's PHP backend checks its own captcha
      -> PHP POSTs the fields here with the secret in `X-Lead-Api-Key`
      -> we create a Pipeline (CRM Deal) for the person's Contact

The key identifies the tenant (CRM Company), so an inquiry can never land in the
wrong company's CRM. Server-to-server only: no CORS headers are sent, so a
browser cannot call this, and the key never has to leave the website's server.

Every request — accepted or rejected — is written to CRM Web Lead Log.

Tenancy: `stamp_company` normally takes `crm_company` from the session user, but
our session is Guest, which maps to no company. So `crm_company` is set from the
key on the Contact, the Deal and its Notes BEFORE insert.
"""

import hashlib
import json
import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit

from xbr_crm.api.lead_origin import ORIGIN_FIELD, WEBSITE
from xbr_crm.fcrm.doctype.crm_web_lead_key.crm_web_lead_key import resolve_key
from xbr_crm.fcrm.doctype.crm_web_lead_log.crm_web_lead_log import write_log

SOURCE = "Website"

# Website field -> CRM Deal field. Only these are written, so a payload cannot set
# arbitrary fields (`status`, `deal_owner`, `crm_company`...). Email and mobile
# are not here: they belong to the Contact, and the deal copies them from it.
FIELD_MAP = {
	"first_name": "first_name",
	"last_name": "last_name",
	"city": "custom_city",
	"form_type": "custom_form_type",
	"highest_qualification": "custom_highest_qualification",
	"course_level": "custom_course_level",
	"preferred_state": "custom_preferred_state",
	"start_timeline": "custom_start_timeline",
	"page_url": "custom_page_url",
}

# Every field we accept. Anything else in the payload is ignored.
INPUT_FIELDS = (*FIELD_MAP, "email", "mobile_no")

# The CRM's text fields hold 140 characters. A longer page_url is trimmed (it is
# only context); anything else that long is not a real form value and is refused.
MAX_LENGTH = 140
TRIMMED_FIELDS = ("page_url",)

# Shown in the note added to a pipeline, in this order.
NOTE_FIELDS = (
	("form_type", "Form"),
	("city", "City"),
	("highest_qualification", "Highest Qualification"),
	("course_level", "Course Level"),
	("preferred_state", "Preferred State"),
	("start_timeline", "Start Timeline"),
	("page_url", "Page"),
)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

# An identical submission inside this window is treated as a retry of the first
# (e.g. PHP re-sending after a timeout) and changes nothing.
RETRY_WINDOW_MINUTES = 10


class InquiryError(Exception):
	"""A rejected request: the HTTP status to return and a stable error `code`."""

	def __init__(self, message: str, http_status: int = 400, code: str = "error"):
		super().__init__(message)
		self.message = message
		self.http_status = http_status
		self.code = code


# ---------------------------------------------------------------------------
# Endpoint
# ---------------------------------------------------------------------------


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=30, seconds=60)
def capture_inquiry(**kwargs):
	"""Create a Pipeline (CRM Deal) from a website inquiry.

	Accepts a JSON or form-encoded body. Returns
	{success, pipeline, contact, duplicate, message} — plus `code` on failure —
	with HTTP 200 (created or duplicate), 400 (invalid), 401 (bad key),
	403 (IP not allowed), 429 (rate limited) or 500.
	"""
	payload = {k: v for k, v in kwargs.items() if k != "cmd"}
	client_ip = frappe.local.request_ip
	key = None

	try:
		key = _authenticate(client_ip)
		data = _clean(payload)
		fingerprint = submission_fingerprint(key.name, data)
		result = _create_or_record(key, data, fingerprint)
		write_log(
			result="duplicate" if result["duplicate"] else "success",
			payload=payload,
			key=key,
			deal=result["pipeline"],
			message=result["message"],
			client_ip=client_ip,
			submission_hash=fingerprint,
		)
		frappe.local.response["http_status_code"] = 200
		return result

	except InquiryError as e:
		frappe.db.rollback()
		write_log(result="error", payload=payload, key=key, message=e.message, client_ip=client_ip)
		frappe.db.commit()
		frappe.local.response["http_status_code"] = e.http_status
		return _failure(e.message, e.code)

	except Exception:
		# Keep the payload so the inquiry is not lost; keep the traceback out of
		# the response.
		tb = frappe.get_traceback(with_context=True)
		frappe.db.rollback()
		write_log(
			result="error",
			payload=payload,
			key=key,
			message="Internal error",
			traceback=tb,
			client_ip=client_ip,
		)
		frappe.db.commit()
		frappe.log_error(title="Website inquiry capture failed", message=tb)
		frappe.local.response["http_status_code"] = 500
		return _failure(_("Could not process the inquiry. It has been logged for review."), "internal_error")


def _failure(message: str, code: str) -> dict:
	return {
		"success": False,
		"pipeline": None,
		"contact": None,
		"duplicate": False,
		"message": message,
		"code": code,
	}


def _authenticate(client_ip: str | None):
	"""The active key matching the `X-Lead-Api-Key` header, from an allowed IP."""
	request = getattr(frappe.local, "request", None)
	# Header only, never the body: a key in the body ends up in logs.
	presented = request.headers.get("X-Lead-Api-Key") if request is not None else None
	key = resolve_key(presented) if presented else None
	if not key:
		raise InquiryError(_("Missing or invalid API key"), 401, "invalid_api_key")
	if not key.ip_allowed(client_ip):
		raise InquiryError(_("Requests from this IP address are not allowed"), 403, "ip_not_allowed")
	return key


# ---------------------------------------------------------------------------
# Validation
# ---------------------------------------------------------------------------


def normalize_mobile(raw: str | None) -> str | None:
	"""An Indian mobile as +91XXXXXXXXXX, or None if it is not one.

	Accepts spaces, dashes and brackets, a leading 0, 91 or +91. The number must
	be 10 digits starting 6-9.
	"""
	if not raw:
		return None
	digits = re.sub(r"\D", "", str(raw))
	if digits.startswith("91") and len(digits) == 12:
		digits = digits[2:]
	elif digits.startswith("0") and len(digits) == 11:
		digits = digits[1:]
	if len(digits) != 10 or digits[0] not in "6789":
		return None
	return f"+91{digits}"


def _title_case(value: str) -> str:
	"""Title-case all-lower or all-upper names; leave mixed case (McArthur) alone."""
	if value.islower() or value.isupper():
		return " ".join(part.capitalize() for part in value.split())
	return value


def _clean(payload: dict) -> dict:
	"""Trimmed, normalised and validated fields. Raises InquiryError(400)."""
	data = {}
	for field in INPUT_FIELDS:
		value = payload.get(field)
		if isinstance(value, dict | list):
			raise InquiryError(_("{0} must be text").format(field), 400, "invalid_field")
		value = str(value or "").strip()
		if not value:
			continue
		if len(value) > MAX_LENGTH:
			if field not in TRIMMED_FIELDS:
				raise InquiryError(
					_("{0} is too long (max {1} characters)").format(field, MAX_LENGTH), 400, "field_too_long"
				)
			value = value[:MAX_LENGTH]
		data[field] = value

	if not data.get("first_name"):
		raise InquiryError(_("First name is required"), 400, "missing_first_name")
	data["first_name"] = _title_case(data["first_name"])
	if data.get("last_name"):
		data["last_name"] = _title_case(data["last_name"])

	mobile = normalize_mobile(data.get("mobile_no"))
	if not mobile:
		raise InquiryError(_("A valid 10-digit Indian mobile number is required"), 400, "invalid_mobile")
	data["mobile_no"] = mobile

	if data.get("email"):
		data["email"] = data["email"].lower()
		if not EMAIL_RE.match(data["email"]):
			raise InquiryError(_("Email address is not valid"), 400, "invalid_email")

	if data.get("form_type"):
		data["form_type"] = data["form_type"].lower()

	return data


# ---------------------------------------------------------------------------
# Retry, contact and duplicate lookups
# ---------------------------------------------------------------------------


def submission_fingerprint(key_name: str, data: dict) -> str:
	"""Identity of "this exact inquiry": key + form type + email + mobile."""
	parts = [key_name, data.get("form_type") or "", data.get("email") or "", data.get("mobile_no") or ""]
	return hashlib.sha256("|".join(parts).encode()).hexdigest()


def find_recent_submission(fingerprint: str) -> dict | None:
	"""The successful log row for an identical submission inside the retry window."""
	cutoff = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-RETRY_WINDOW_MINUTES)
	rows = frappe.get_all(
		"CRM Web Lead Log",
		filters=[
			["submission_hash", "=", fingerprint],
			# Only successes are replayed; a rejected request may fail again.
			["result", "in", ["success", "duplicate"]],
			["creation", ">", cutoff],
		],
		fields=["deal"],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows and rows[0].deal else None


def find_contact(crm_company: str, email: str | None, mobile_no: str | None) -> str | None:
	"""This tenant's Contact with the same mobile, else the same email.

	Hand-entered numbers can be in any format, so candidates are narrowed in SQL on
	the last four digits and then compared after normalising. Raw SQL rather than
	`get_list`: the session is Guest, which permission hooks would block, so the
	tenant scope is applied explicitly from the key instead.
	"""
	if mobile_no:
		rows = frappe.db.sql(
			"""
			select c.name, p.phone
			from `tabContact` c
			join `tabContact Phone` p on p.parent = c.name and p.parenttype = 'Contact'
			where c.crm_company = %(company)s and p.phone like %(tail)s
			order by c.creation desc
			""",
			{"company": crm_company, "tail": f"%{mobile_no[-4:]}"},
			as_dict=True,
		)
		for row in rows:
			if normalize_mobile(row.phone) == mobile_no:
				return row.name

	if email:
		rows = frappe.db.sql(
			"""
			select c.name
			from `tabContact` c
			join `tabContact Email` e on e.parent = c.name and e.parenttype = 'Contact'
			where c.crm_company = %(company)s and lower(e.email_id) = %(email)s
			order by c.creation desc
			limit 1
			""",
			{"company": crm_company, "email": email},
			as_dict=True,
		)
		if rows:
			return rows[0].name

	return None


def find_open_deal(contact: str, crm_company: str) -> str | None:
	"""This contact's newest pipeline in this tenant that is not Won or Lost."""
	rows = frappe.db.sql(
		"""
		select d.name
		from `tabCRM Deal` d
		join `tabCRM Contacts` dc
			on dc.parent = d.name and dc.parenttype = 'CRM Deal' and dc.parentfield = 'contacts'
		left join `tabCRM Deal Status` s on s.name = d.status
		where dc.contact = %(contact)s and d.crm_company = %(company)s
			and coalesce(s.type, '') not in ('Won', 'Lost')
		order by d.creation desc
		limit 1
		""",
		{"contact": contact, "company": crm_company},
	)
	return rows[0][0] if rows else None


def _primary_contact(deal_name: str) -> str | None:
	filters = {"parent": deal_name, "parenttype": "CRM Deal", "parentfield": "contacts"}
	return frappe.db.get_value(
		"CRM Contacts", {**filters, "is_primary": 1}, "contact"
	) or frappe.db.get_value("CRM Contacts", filters, "contact")


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def _create_or_record(key, data: dict, fingerprint: str) -> dict:
	"""Retry -> replay; open pipeline -> add a note; otherwise -> new pipeline."""
	replayed = find_recent_submission(fingerprint)
	if replayed:
		return {
			"success": True,
			"pipeline": replayed.deal,
			"contact": _primary_contact(replayed.deal),
			"duplicate": True,
			"message": _("This inquiry was already received."),
		}

	contact = find_contact(key.crm_company, data.get("email"), data["mobile_no"]) or _create_contact(
		key.crm_company, data
	)

	open_deal = find_open_deal(contact, key.crm_company)
	if open_deal:
		_add_note(open_deal, key.crm_company, _("New website inquiry received"), data)
		frappe.db.commit()
		return {
			"success": True,
			"pipeline": open_deal,
			"contact": contact,
			"duplicate": True,
			"message": _("Inquiry recorded on the existing pipeline."),
		}

	deal = _create_deal(key, data, contact)
	_add_note(deal.name, key.crm_company, _("Website inquiry"), data)
	frappe.db.commit()
	return {
		"success": True,
		"pipeline": deal.name,
		"contact": contact,
		"duplicate": False,
		"message": _("Pipeline created."),
	}


def _create_contact(crm_company: str, data: dict) -> str:
	contact = frappe.new_doc("Contact")
	contact.first_name = data["first_name"]
	contact.last_name = data.get("last_name")
	if data.get("email"):
		contact.append("email_ids", {"email_id": data["email"], "is_primary": 1})
	contact.append("phone_nos", {"phone": data["mobile_no"], "is_primary_mobile_no": 1})
	contact.crm_company = crm_company
	contact.insert(ignore_permissions=True)
	return contact.name


def _create_deal(key, data: dict, contact: str):
	deal = frappe.new_doc("CRM Deal")
	for field, target in FIELD_MAP.items():
		if data.get(field) and deal.meta.has_field(target):
			deal.set(target, data[field])
	deal.append("contacts", {"contact": contact, "is_primary": 1})
	deal.source = _ensure_source()
	if deal.meta.has_field(ORIGIN_FIELD):
		deal.set(ORIGIN_FIELD, WEBSITE)
	deal.crm_company = key.crm_company
	# `status` is left to CRM Deal's own default (the first open stage).
	# A website inquiry has no value or close date yet, so forecasting's
	# mandatory fields are skipped for it.
	deal.flags.from_web_inquiry = True
	# The session is Guest, which has no create permission by design; the caller
	# was authenticated by API key and the tenant comes from that key.
	deal.insert(ignore_permissions=True)
	_set_owner(deal, key)
	return deal


def _set_owner(deal, key):
	"""Owner = the assignment rule's pick, else the key's default, else the company owner.

	The deal is inserted WITHOUT an owner on purpose: Frappe's assignment rules
	only assign a document that has no assignment yet, so a pre-set owner would
	stop them from ever firing. `deal_owner` is what the sales hierarchy filters
	on, so it must end up set for the owner to see the pipeline.
	"""
	assigned = json.loads(frappe.db.get_value("CRM Deal", deal.name, "_assign") or "[]")
	if assigned:
		frappe.db.set_value("CRM Deal", deal.name, "deal_owner", assigned[0], update_modified=False)
		return

	owner = key.default_lead_owner or frappe.db.get_value("CRM Company", key.crm_company, "owner_user")
	if not owner:
		return
	frappe.db.set_value("CRM Deal", deal.name, "deal_owner", owner, update_modified=False)
	deal.deal_owner = owner
	deal.share_with_agent(owner)
	deal.assign_agent(owner)


def _add_note(deal_name: str, crm_company: str, title: str, data: dict):
	"""A note on the pipeline listing what the visitor submitted (HTML-escaped)."""
	esc = frappe.utils.escape_html
	items = "".join(
		f"<li><b>{esc(label)}</b>: {esc(data[f])}</li>" for f, label in NOTE_FIELDS if data.get(f)
	)
	note = frappe.new_doc("FCRM Note")
	note.title = title
	note.content = f"<ul>{items}</ul>" if items else f"<p>{esc(_('No additional details submitted.'))}</p>"
	note.reference_doctype = "CRM Deal"
	note.reference_docname = deal_name
	note.crm_company = crm_company
	note.insert(ignore_permissions=True)


def _ensure_source() -> str:
	"""The 'Website' source record, created once if missing."""
	if not frappe.db.exists("CRM Lead Source", SOURCE):
		frappe.get_doc({"doctype": "CRM Lead Source", "source_name": SOURCE}).insert(ignore_permissions=True)
	return SOURCE


# ---------------------------------------------------------------------------
# Key administration — run on the server with `bench execute`, never over HTTP,
# because these print a plaintext secret.
# ---------------------------------------------------------------------------


def _find_key(label: str):
	if frappe.db.exists("CRM Web Lead Key", label):
		return frappe.get_doc("CRM Web Lead Key", label)
	known = frappe.get_all("CRM Web Lead Key", pluck="name")
	print(f"No key named {label!r}. Known keys: {', '.join(known) or '(none)'}")
	return None


def create_key(company: str, label: str, website_url: str = "", lead_owner: str = "", allowed_ips: str = ""):
	"""Create an API key for `company` and print the secret once.

	    bench --site <site> execute xbr_crm.api.web_lead.create_key \
	        --kwargs "{'company': 'IEA Seek International', 'label': 'ieagents.co.in website',
	                   'allowed_ips': '203.0.113.10'}"

	`lead_owner` owns new pipelines when no assignment rule applies (default: the
	company's owner). `allowed_ips` restricts the key to the website server's IP
	(one IP or CIDR per line or comma). Creates the CRM Company if it is missing.
	Refuses to overwrite an existing label — use `rotate_key` for that.
	"""
	if not frappe.db.exists("CRM Company", company):
		frappe.get_doc(
			{
				"doctype": "CRM Company",
				"company_name": company,
				"is_active": 1,
				"owner_user": lead_owner or frappe.session.user,
			}
		).insert(ignore_permissions=True)
		print(f"created CRM Company: {company}")

	if frappe.db.exists("CRM Web Lead Key", label):
		print(f"REFUSING: a key labelled {label!r} already exists. Use rotate_key to replace its secret.")
		return

	frappe.get_doc(
		{
			"doctype": "CRM Web Lead Key",
			"key_name": label,
			"crm_company": company,
			"is_active": 1,
			# api_key omitted on purpose: before_insert generates it.
			"website_url": website_url,
			"allowed_ips": allowed_ips,
			"default_lead_owner": lead_owner or None,
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	print(f"key {label!r} -> company {company!r}")


def rotate_key(label: str):
	"""Replace a key's secret and print the new one. The old one stops working at once."""
	key = _find_key(label)
	if key:
		key.rotate()


def deactivate_key(label: str):
	"""Switch a key off (requests get 401). Kept, not deleted, so its log rows stay linked."""
	_set_active(label, 0)


def activate_key(label: str):
	"""Switch a deactivated key back on; the secret is unchanged."""
	_set_active(label, 1)


def _set_active(label: str, active: int):
	key = _find_key(label)
	if not key:
		return
	key.is_active = active
	key.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"{label!r} is now {'active' if active else 'inactive'}.")


def list_keys():
	"""Show every key, its company, whether it is active and its IP allowlist."""
	rows = frappe.get_all(
		"CRM Web Lead Key",
		fields=["name", "crm_company", "is_active", "allowed_ips", "last_rotated_on"],
		order_by="crm_company asc, name asc",
	)
	if not rows:
		print("No keys configured.")
		return
	print(f"\n{'KEY':<34}{'COMPANY':<28}{'ACTIVE':<8}{'IPs':<16}ROTATED")
	print("-" * 100)
	for r in rows:
		ips = (r.allowed_ips or "").replace("\n", ",").strip() or "any"
		print(
			f"{r.name:<34}{r.crm_company:<28}{'yes' if r.is_active else 'NO':<8}"
			f"{ips[:14]:<16}{r.last_rotated_on or 'never'}"
		)
	print()
