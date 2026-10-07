# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Website inquiry capture.

A single guest endpoint that any client website can POST to, server-to-server.
The website validates its own captcha, then forwards the form with a shared
secret in `X-Lead-Api-Key`; the key identifies the tenant, so a lead can never
land in the wrong company's CRM.

Deliberately NOT a browser endpoint: no CORS headers are emitted, and the key
would be readable by anyone who opened devtools if it were called from the page.

How this relates to the existing forms feature
----------------------------------------------
`xbr_crm/api/form.py` serves CRM-hosted Web Forms and stamps source "Web Form".
This module is the opposite direction — the form lives on someone else's site —
and stamps source "Website", so the two paths stay distinguishable in reporting.
They do not interact: `enrich_form_submission` is gated on
`frappe.flags.in_web_form`, which is never set here.

Tenancy
-------
`xbr_crm/permissions/tenancy.py` stamps `crm_company` in `before_insert` from the
SESSION user. Our session is Guest, which maps to no company, and
`FCRM Settings.default_crm_company` may be unset — so a lead inserted without
intervention is born with `crm_company = NULL` and, under `tenancy_strict`,
is invisible to every tenant user. We therefore set `crm_company` from the key
BEFORE insert; `stamp_company` then sees a value already present and no-ops.
"""

import json
import re

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit

from xbr_crm.api.lead_origin import ORIGIN_FIELD, WEBSITE
from xbr_crm.fcrm.doctype.crm_web_lead_key.crm_web_lead_key import resolve_key
from xbr_crm.fcrm.doctype.crm_web_lead_log.crm_web_lead_log import write_log

LEAD_SOURCE = "Website"

# Form types the website may declare. Unknown values are stored as-is rather than
# rejected: a new form should not start dropping leads before we ship a constant.
KNOWN_FORM_TYPES = ("consultation", "evaluation", "contact")

# Website field -> CRM Lead field. Only these are ever written; anything else in
# the payload is logged but not mapped, so a website change cannot set arbitrary
# doctype fields (`status`, `converted`, `crm_company`...).
FIELD_MAP = {
	"first_name": "first_name",
	"last_name": "last_name",
	"email": "email",
	"mobile_no": "mobile_no",
	"city": "custom_city",
	"highest_qualification": "custom_highest_qualification",
	"course_level": "custom_course_level",
	"preferred_state": "custom_preferred_state",
	"start_timeline": "custom_start_timeline",
	"form_type": "custom_form_type",
	"page_url": "custom_page_url",
	"utm_source": "custom_utm_source",
	"utm_medium": "custom_utm_medium",
	"utm_campaign": "custom_utm_campaign",
}

# Fields echoed into the note added to a duplicate lead, in display order.
NOTE_FIELDS = (
	("form_type", "Form"),
	("city", "City"),
	("highest_qualification", "Highest Qualification"),
	("course_level", "Course Level"),
	("preferred_state", "Preferred State"),
	("start_timeline", "Start Timeline"),
	("page_url", "Page"),
	("utm_source", "UTM Source"),
	("utm_campaign", "UTM Campaign"),
)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[a-zA-Z]{2,}$")

# Values that mean "the sender had nothing for this field". An unmapped Zapier
# field usually arrives as "", but a Zap that stringifies a missing value can
# send the word instead, and storing the literal text "null" in a lead's city is
# worse than storing nothing.
BLANK_VALUES = {"null", "none", "undefined", "nil", "n/a", "na", "-"}

# How long a repeated identical submission counts as a retry rather than a new
# inquiry. Zapier retries a failed or timed-out POST on its own, and without this
# each retry would pile another "New website inquiry received" note onto the same
# lead. Long enough to cover Zapier's retry schedule, short enough that someone
# genuinely re-submitting later still gets recorded.
RETRY_WINDOW_MINUTES = 10


class InquiryError(Exception):
	"""Validation/auth failure carrying the HTTP status to return.

	`code` is a stable machine-readable slug. The human `message` is translated
	and may be reworded; a Zap filter branching on "why did this fail" needs
	something that will not move, and Zapier's task history shows the whole body.
	"""

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
	"""Create a CRM Lead from a website inquiry.

	Returns {success, lead, duplicate, message} and sets the HTTP status:
	200 created/duplicate, 400 validation, 401 bad key, 403 IP not allowed,
	429 rate limited (raised by the decorator).
	"""
	payload = _read_payload(kwargs)
	client_ip = frappe.local.request_ip
	key = None

	try:
		key = _authenticate(payload, client_ip)
		_verify_captcha(key, payload)
		data = _clean(payload)
		fingerprint = submission_fingerprint(key.name, data)
		result = _create_or_dedup(key, data, fingerprint)

		write_log(
			result="duplicate" if result["duplicate"] else "success",
			payload=payload,
			key=key,
			lead=result["lead"],
			message=result["message"],
			client_ip=client_ip,
			submission_hash=fingerprint,
		)
		frappe.local.response["http_status_code"] = 200
		return result

	except InquiryError as e:
		# Expected rejections: a bad payload or a bad key is normal traffic for a
		# public endpoint, so this is logged as a row, not as an Error Log entry.
		frappe.db.rollback()
		write_log(result="error", payload=payload, key=key, message=e.message, client_ip=client_ip)
		frappe.db.commit()
		frappe.local.response["http_status_code"] = e.http_status
		return {
			"success": False,
			"lead": None,
			"duplicate": False,
			"message": e.message,
			"code": e.code,
		}

	except Exception:
		# Unexpected: keep the raw payload so the submission is not lost, and keep
		# the traceback out of the HTTP response.
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
		return {
			"success": False,
			"lead": None,
			"duplicate": False,
			"message": _("Could not process the inquiry. It has been logged for review."),
			"code": "internal_error",
		}


# ---------------------------------------------------------------------------
# Request parsing + auth
# ---------------------------------------------------------------------------


def _read_payload(kwargs: dict) -> dict:
	"""Accept a JSON body or form-encoded fields, as one flat dict.

	frappe puts form-encoded fields straight into kwargs; a JSON body arrives the
	same way for a flat object, but a caller may also post `{"data": {...}}`, so
	that shape is unwrapped too.
	"""
	payload = {k: v for k, v in (kwargs or {}).items() if k != "cmd"}

	nested = payload.get("data")
	if isinstance(nested, str):
		try:
			nested = json.loads(nested)
		except ValueError:
			nested = None
	if isinstance(nested, dict):
		payload.pop("data", None)
		payload.update(nested)

	return payload


def _authenticate(payload: dict, client_ip: str | None):
	"""Resolve the API key header to a tenant, or raise."""
	headers = getattr(frappe.local, "request", None)
	presented = None
	if headers is not None:
		presented = headers.headers.get("X-Lead-Api-Key")
	# Header only. A key accepted from the body would end up in access logs and
	# in our own payload log, and would invite calling this from the browser.
	if not presented:
		raise InquiryError(_("Missing or invalid API key"), 401, "invalid_api_key")

	key = resolve_key(presented)
	if not key:
		raise InquiryError(_("Missing or invalid API key"), 401, "invalid_api_key")

	if not key.ip_allowed(client_ip):
		raise InquiryError(_("Requests from this IP address are not allowed"), 403, "ip_not_allowed")

	return key


def _verify_captcha(key, payload: dict):
	"""Optional server-side captcha check. Off unless the key enables it.

	Pluggable by provider; the website normally verifies its own captcha before
	calling us, which is why this defaults to off.
	"""
	if not key.verify_captcha:
		return

	token = payload.get("captcha_token") or payload.get("captcha")
	if not token:
		raise InquiryError(_("Captcha verification failed"), 400, "captcha_failed")

	endpoints = {
		"recaptcha": "https://www.google.com/recaptcha/api/siteverify",
		"hcaptcha": "https://hcaptcha.com/siteverify",
	}
	endpoint = endpoints.get(key.captcha_provider)
	if not endpoint:
		raise InquiryError(_("Captcha verification is misconfigured"), 400, "captcha_misconfigured")

	import requests

	try:
		resp = requests.post(
			endpoint,
			data={"secret": key.get_password("captcha_secret"), "response": token},
			timeout=10,
		)
		ok = bool(resp.json().get("success"))
	except Exception:
		# A provider outage must not silently admit unverified traffic.
		raise InquiryError(_("Captcha verification is unavailable"), 400, "captcha_unavailable")

	if not ok:
		raise InquiryError(_("Captcha verification failed"), 400, "captcha_failed")


# ---------------------------------------------------------------------------
# Validation + normalisation
# ---------------------------------------------------------------------------


def normalize_mobile(raw: str | None) -> str | None:
	"""Normalise an Indian mobile number to +91XXXXXXXXXX, else None.

	Accepts the shapes a website form actually produces: spaces, dashes and
	brackets, a 0 trunk prefix, a bare 91, or an existing +91. The subscriber
	number must be 10 digits starting 6-9, which is the current IN mobile range.
	"""
	if not raw:
		return None

	digits = re.sub(r"[^\d+]", "", str(raw))
	digits = digits.lstrip("+")

	if digits.startswith("91") and len(digits) == 12:
		digits = digits[2:]
	elif digits.startswith("0") and len(digits) == 11:
		digits = digits[1:]

	if len(digits) != 10 or digits[0] not in "6789":
		return None
	return f"+91{digits}"


def _title_case(value: str) -> str:
	"""Title-case a name without destroying intentional casing.

	A name already containing a capital after the first letter (McArthur, D'Souza,
	IEA) is left as typed; only all-lower or all-upper input is re-cased.
	"""
	if not value:
		return value
	if value.islower() or value.isupper():
		return " ".join(part.capitalize() for part in value.split())
	return value


def _clean(payload: dict) -> dict:
	"""Trim, normalise and validate. Raises InquiryError(400) on bad input.

	Keys outside FIELD_MAP are ignored rather than rejected, which is what lets a
	caller (Zapier especially) send its own bookkeeping fields alongside ours.
	"""
	data = {}
	for key in FIELD_MAP:
		value = payload.get(key)
		if value is None:
			continue
		value = str(value).strip()
		if value and value.lower() not in BLANK_VALUES:
			data[key] = value

	first_name = _title_case(data.get("first_name", ""))
	if not first_name:
		raise InquiryError(_("First name is required"), 400, "missing_first_name")
	data["first_name"] = first_name

	if data.get("last_name"):
		data["last_name"] = _title_case(data["last_name"])

	mobile = normalize_mobile(data.get("mobile_no"))
	if not mobile:
		raise InquiryError(_("A valid 10-digit Indian mobile number is required"), 400, "invalid_mobile")
	data["mobile_no"] = mobile

	# Optional, but must be well-formed when supplied rather than silently dropped
	# — a typo'd address is worth telling the website about.
	if data.get("email"):
		email = data["email"].lower()
		if not EMAIL_RE.match(email):
			raise InquiryError(_("Email address is not valid"), 400, "invalid_email")
		data["email"] = email

	if data.get("form_type"):
		data["form_type"] = data["form_type"].lower()

	return data


# ---------------------------------------------------------------------------
# Dedup
# ---------------------------------------------------------------------------


def submission_fingerprint(key_name: str, data: dict) -> str:
	"""Stable id for "this exact inquiry", used to recognise a retry.

	Key + form type + identity. Deliberately NOT the whole payload: Zapier may
	re-send with a different `page_url` or utm set on a retry, and those should
	not make it look like a new inquiry. Equally deliberately INCLUDES form_type,
	so the same person genuinely filling in a second, different form is not
	mistaken for a retry and still gets their answers recorded.
	"""
	import hashlib

	parts = [key_name, data.get("form_type") or "", data.get("email") or "", data.get("mobile_no") or ""]
	return hashlib.sha256("|".join(parts).encode()).hexdigest()


def find_recent_submission(fingerprint: str) -> dict | None:
	"""The lead from an identical submission inside the retry window, if any.

	Reads the log rather than the leads: the log is the only place that records
	*that a request happened*, which is what distinguishes "Zapier sent this twice"
	from "this person is in our CRM already".
	"""
	cutoff = frappe.utils.add_to_date(frappe.utils.now_datetime(), minutes=-RETRY_WINDOW_MINUTES)
	rows = frappe.get_all(
		"CRM Web Lead Log",
		filters=[
			["submission_hash", "=", fingerprint],
			# Only replay something that actually worked. A retry after a 400 must
			# be allowed to fail again on its own merits.
			["result", "in", ["success", "duplicate"]],
			["creation", ">", cutoff],
		],
		fields=["name", "lead"],
		order_by="creation desc",
		limit=1,
	)
	return rows[0] if rows and rows[0].get("lead") else None


def find_duplicate_leads(crm_company: str, email: str | None, mobile_no: str | None) -> list[dict]:
	"""Leads in this tenant matching on email OR normalised mobile.

	Kept separate from the create path so the match surface can be widened to
	Deals/Contacts later without touching the endpoint. Returns newest first and
	includes `converted`, because a converted match is handled differently from a
	live one.

	Uses `get_all`, not `get_list`: `get_all` skips the permission_query_conditions
	hooks, which matters because the session is Guest and the tenancy hook would
	otherwise reduce this to `1=0` under strict mode — every submission would look
	unique and we would create a duplicate for every repeat visitor. The tenant
	scope is not lost by doing so, it is applied explicitly in the filter below,
	from the API key rather than from the session.
	"""
	clauses = []
	if email:
		clauses.append(["email", "=", email])
	if mobile_no:
		clauses.append(["mobile_no", "=", mobile_no])
	if not clauses:
		return []

	return frappe.get_all(
		"CRM Lead",
		filters=[["crm_company", "=", crm_company]],
		or_filters=clauses,
		fields=["name", "converted", "lead_name"],
		order_by="creation desc",
	)


def _inquiry_note_html(data: dict, heading: str) -> str:
	"""Readable summary of what the visitor submitted, for the lead's notes."""
	rows = []
	for key, label in NOTE_FIELDS:
		if data.get(key):
			rows.append(
				f"<li><b>{frappe.utils.escape_html(label)}</b>: {frappe.utils.escape_html(data[key])}</li>"
			)
	body = f"<ul>{''.join(rows)}</ul>" if rows else "<p>No additional details submitted.</p>"
	return f"<p>{frappe.utils.escape_html(heading)}</p>{body}"


def _add_note(lead_name: str, crm_company: str, title: str, html: str):
	"""Attach an FCRM Note to a lead.

	FCRM Note is tenant-scoped, so the company is stamped explicitly for the same
	reason the lead is — the Guest session maps to none.
	"""
	note = frappe.new_doc("FCRM Note")
	note.title = title
	note.content = html
	note.reference_doctype = "CRM Lead"
	note.reference_docname = lead_name
	if note.meta.has_field("crm_company"):
		note.crm_company = crm_company
	note.insert(ignore_permissions=True)
	return note.name


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def _resolve_fallback_owner(key) -> str | None:
	"""Owner to use when no assignment rule claims the lead."""
	if key.default_lead_owner:
		return key.default_lead_owner
	return frappe.db.get_value("CRM Company", key.crm_company, "owner_user")


def _sync_owner_from_assignment(lead_name: str, fallback: str | None):
	"""Make `lead_owner` agree with whoever the assignment rule picked.

	Frappe's Assignment Rule runs on `on_update` (hooked for `*` in hooks.py) and
	records its choice as a ToDo + `_assign` — it does NOT set `lead_owner`, which
	is the field `org_hierarchy` filters on. Left alone, an assigned web lead would
	still be invisible to the assignee's own Sales User view once a hierarchy tree
	exists. So: prefer the assignee, fall back to the key's default, and never
	leave the lead unowned.
	"""
	assigned = frappe.db.get_value("CRM Lead", lead_name, "_assign")
	owner = None
	if assigned:
		try:
			users = json.loads(assigned)
			owner = users[0] if users else None
		except (ValueError, IndexError):
			owner = None

	owner = owner or fallback
	if not owner:
		return
	if frappe.db.get_value("CRM Lead", lead_name, "lead_owner") == owner:
		return
	frappe.db.set_value("CRM Lead", lead_name, "lead_owner", owner, update_modified=False)


def ensure_lead_source() -> str:
	"""Return the 'Website' CRM Lead Source, creating it once if absent."""
	if not frappe.db.exists("CRM Lead Source", LEAD_SOURCE):
		frappe.get_doc({"doctype": "CRM Lead Source", "source_name": LEAD_SOURCE}).insert(
			ignore_permissions=True
		)
	return LEAD_SOURCE


def _create_or_dedup(key, data: dict, fingerprint: str) -> dict:
	"""Retry check, then dedup, then create. Returns the endpoint's response dict.

	Three outcomes, in priority order:
	  1. a retry of a submission we already handled -> replay the same answer,
	  2. the person is already a live lead          -> note it, no new lead,
	  3. otherwise                                  -> create the lead.

	The retry check runs FIRST, and that ordering is a real decision rather than an
	accident of layout. It changes one case: an inquiry whose lead was converted
	within the retry window. Rule 3 would say "converted match -> make a new lead",
	rule 1 says "we already answered this". Rule 1 wins, because the alternative is
	that every Zapier retry of a converted lead's inquiry mints another duplicate —
	exactly the failure the retry window exists to stop. The cost is the rarer
	case: someone genuinely re-submitting within ten minutes of their lead being
	converted gets the converted lead back instead of a fresh one, which is
	recoverable because the person is already in the CRM either way.
	"""
	# 1. Zapier (or any caller) re-sending the same inquiry after a timeout. Return
	# the original answer verbatim and add NOTHING: the note was already written by
	# the request this one is a repeat of.
	replayed = find_recent_submission(fingerprint)
	if replayed:
		return {
			"success": True,
			"lead": replayed.lead,
			"duplicate": True,
			"message": _("This inquiry was already received."),
		}

	matches = find_duplicate_leads(key.crm_company, data.get("email"), data.get("mobile_no"))
	live = [m for m in matches if not m.converted]
	converted = [m for m in matches if m.converted]

	# An unconverted match is the same person enquiring again — possibly through a
	# different form. Record what they asked for on the lead that already exists
	# rather than splitting one person across two records.
	if live:
		existing = live[0]
		form_type = data.get("form_type") or "website"
		_add_note(
			existing.name,
			key.crm_company,
			_("New website inquiry received"),
			_inquiry_note_html(data, _("A new {0} inquiry was submitted for this lead.").format(form_type)),
		)
		frappe.db.commit()
		return {
			"success": True,
			"lead": existing.name,
			"duplicate": True,
			"message": _("Inquiry recorded on the existing lead."),
		}

	lead = frappe.new_doc("CRM Lead")
	for src, target in FIELD_MAP.items():
		if data.get(src) and lead.meta.has_field(target):
			lead.set(target, data[src])

	lead.source = ensure_lead_source()
	# Declare the origin so `stamp_origin` does not have to guess. `source` is the
	# sales team's to edit; this stays as the system's record of the mechanism.
	if lead.meta.has_field(ORIGIN_FIELD):
		lead.set(ORIGIN_FIELD, WEBSITE)
	# Set BEFORE insert: `stamp_company` would otherwise resolve the Guest session
	# to no company and leave this NULL, which is invisible under tenancy_strict.
	lead.crm_company = key.crm_company
	# `status` is intentionally not set — CRM Lead.validate_status() defaults it
	# to "New", and hardcoding it here would fork that decision.

	fallback_owner = _resolve_fallback_owner(key)
	if fallback_owner:
		lead.lead_owner = fallback_owner

	# `ignore_permissions`: the session is Guest, which holds no create permission
	# on CRM Lead by design. The caller is already authenticated by API key and the
	# tenant resolved from that key, so the permission check has been satisfied
	# upstream by something stronger than a session role.
	lead.insert(ignore_permissions=True)

	# After insert, because assignment rules fire on on_update.
	_sync_owner_from_assignment(lead.name, fallback_owner)

	if converted:
		_add_note(
			lead.name,
			key.crm_company,
			_("Earlier inquiry from this person"),
			_("This person previously submitted an inquiry that was converted: {0}.").format(
				f"<b>{frappe.utils.escape_html(converted[0].name)}</b>"
			),
		)

	frappe.db.commit()
	return {
		"success": True,
		"lead": lead.name,
		"duplicate": False,
		"message": _("Lead created."),
	}


# ---------------------------------------------------------------------------
# Key administration
#
# Run from the server, never over HTTP. These print a plaintext secret, and an
# endpoint that returns one — even behind a permission check — puts it in
# browser history, proxy logs and the network tab. `bench execute` keeps it on
# the terminal of whoever is already trusted with shell access.
# ---------------------------------------------------------------------------


def _find_key(label: str):
	doc_name = frappe.db.exists("CRM Web Lead Key", label)
	if not doc_name:
		known = frappe.get_all("CRM Web Lead Key", pluck="name")
		print(f"No key named {label!r}.")
		print("Known keys:", ", ".join(known) if known else "(none)")
		return None
	return frappe.get_doc("CRM Web Lead Key", doc_name)


def create_key(company: str, label: str, website_url: str = "", lead_owner: str = ""):
	"""Create a tenant API key and print the secret once.

	    bench --site <site> execute xbr_crm.api.web_lead.create_key \
	        --kwargs "{'company': 'IEA Seek International', 'label': 'ieagents.co.in website'}"

	Idempotent on the company, deliberately NOT on the key: a re-run against an
	existing label refuses rather than rotating the secret out from under a
	website that is already posting with it. Use `rotate_key` when that is what
	you actually mean.
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
	else:
		print(f"CRM Company already exists: {company}")

	if frappe.db.exists("CRM Web Lead Key", label):
		print(f"\nREFUSING: a key labelled {label!r} already exists.")
		print("Use rotate_key to replace its secret, or pick a different label.")
		return

	frappe.get_doc(
		{
			"doctype": "CRM Web Lead Key",
			"key_name": label,
			"crm_company": company,
			"is_active": 1,
			# api_key omitted on purpose — before_insert generates it.
			"website_url": website_url,
			# Left open: Zapier has no fixed egress IPs, and a website backend's
			# address is rarely known at provisioning time. Lock it down after.
			"allowed_ips": "",
			"verify_captcha": 0,
			"default_lead_owner": lead_owner or None,
		}
	).insert(ignore_permissions=True)
	frappe.db.commit()
	print(f"key {label!r} -> company {company!r}")


def rotate_key(label: str):
	"""Replace a key's secret and print the new one once.

	    bench --site <site> execute xbr_crm.api.web_lead.rotate_key \
	        --kwargs "{'label': 'ieagents.co.in website'}"

	The old secret stops working immediately. Deliver the new one to the caller
	before running this, or the website's submissions start failing with 401 in
	the gap.
	"""
	key = _find_key(label)
	if key:
		key.rotate()


def deactivate_key(label: str):
	"""Switch a key off without deleting it.

	    bench --site <site> execute xbr_crm.api.web_lead.deactivate_key \
	        --kwargs "{'label': 'ieagents.co.in website'}"

	Preferred over deletion: the CRM Web Lead Log rows reference this key by name,
	and deleting it would orphan the audit trail for every lead it ever captured.
	Reversible with activate_key.
	"""
	key = _find_key(label)
	if not key:
		return
	if not key.is_active:
		print(f"{label!r} is already inactive.")
		return
	key.is_active = 0
	key.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"{label!r} deactivated — requests using it now return 401.")


def activate_key(label: str):
	"""Re-enable a deactivated key, secret unchanged."""
	key = _find_key(label)
	if not key:
		return
	if key.is_active:
		print(f"{label!r} is already active.")
		return
	key.is_active = 1
	key.save(ignore_permissions=True)
	frappe.db.commit()
	print(f"{label!r} reactivated.")


def list_keys():
	"""Show every key, which tenant it serves, and whether it is live."""
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
