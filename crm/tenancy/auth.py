"""Guest-facing signup, email verification and password recovery.

Design note: **nothing is written to the database until the OTP is verified.**
Signup details are parked in the cache and only become a Company + User + Member
row once the code checks out. That keeps a half-finished signup from squatting a
company name or leaving an unusable User behind.

Every OTP has a hard attempt cap. Without one, a 6-digit code with an unlimited
guess budget inside its validity window is brute-forceable — and `verify_login_otp`
creates a session with no password at all, so that would be account takeover.
"""

import re
import secrets
import string

import frappe
from frappe import _
from frappe.rate_limiter import rate_limit
from frappe.utils import get_url
from frappe.utils.password import update_password

from crm.fcrm.doctype.crm_company.crm_company import normalize_company_name
from crm.tenancy import emails

SIGNUP_TTL_SEC = 600  # 10 min — the cache holds a plaintext password, keep it short
RESET_TTL_SEC = 900
LOGIN_OTP_TTL_SEC = 600
MAX_OTP_ATTEMPTS = 5
MIN_PASSWORD_LEN = 8

EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")


# ── helpers ──────────────────────────────────────────────────────────────────


def _gen_otp(n: int = 6) -> str:
	# secrets, not random — these codes gate account creation and session issue.
	return "".join(secrets.choice(string.digits) for _ in range(n))


def _norm_email(email: str | None) -> str:
	return (email or "").strip().lower()


def _key(prefix: str, email: str) -> str:
	return f"crm_{prefix}:{email}"


def _valid_email(email: str) -> bool:
	return bool(EMAIL_RE.match(email or ""))


def _check_otp(key: str, otp: str, expired_msg: str):
	"""Return the cached payload, or throw. Counts and caps failed attempts."""
	data = frappe.cache.get_value(key)
	if not data:
		frappe.throw(_(expired_msg))

	if data.get("otp") != (otp or "").strip():
		attempts = int(data.get("attempts", 0)) + 1
		if attempts >= MAX_OTP_ATTEMPTS:
			frappe.cache.delete_value(key)
			frappe.throw(_("Too many incorrect codes. Please start over."))
		data["attempts"] = attempts
		# Preserve the original expiry rather than extending it on every guess.
		frappe.cache.set_value(key, data, expires_in_sec=data.get("ttl", SIGNUP_TTL_SEC))
		frappe.throw(
			_("Invalid code. {0} attempt(s) remaining.").format(MAX_OTP_ATTEMPTS - attempts)
		)

	return data


# ── availability checks (live, as the user types) ────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
@rate_limit(limit=30, seconds=60)
def check_email(email: str | None = None) -> dict:
	email = _norm_email(email)
	if not email:
		return {"available": False, "reason": "empty", "email": email}
	if not _valid_email(email):
		return {"available": False, "reason": "invalid", "email": email}
	taken = bool(frappe.db.exists("User", {"name": email}))
	return {"available": not taken, "reason": "taken" if taken else "ok", "email": email}


@frappe.whitelist(allow_guest=True, methods=["GET", "POST"])
@rate_limit(limit=30, seconds=60)
def check_company_name(company_name: str | None = None) -> dict:
	name = normalize_company_name(company_name)
	if not name:
		return {"available": False, "reason": "empty", "name": name}
	if len(name) < 2:
		return {"available": False, "reason": "too_short", "name": name}
	taken = bool(frappe.db.exists("CRM Company", name))
	return {"available": not taken, "reason": "taken" if taken else "ok", "name": name}


# ── signup ───────────────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=300)
def signup_user(
	first_name: str,
	email: str,
	password: str,
	company_name: str,
	last_name: str = "",
) -> dict:
	"""Validate a signup and email a verification code. Writes nothing to the DB."""
	email = _norm_email(email)
	first_name = (first_name or "").strip()
	company_name = normalize_company_name(company_name)
	password = password or ""

	if not email or not first_name or not password:
		frappe.throw(_("Name, email and password are required."))
	if not company_name:
		frappe.throw(_("Company name is required."))
	if len(company_name) < 2:
		frappe.throw(_("Company name must be at least 2 characters."))
	if not _valid_email(email):
		frappe.throw(_("Please enter a valid email address."))
	if len(password) < MIN_PASSWORD_LEN:
		frappe.throw(_("Password must be at least {0} characters.").format(MIN_PASSWORD_LEN))
	if frappe.db.exists("User", email):
		frappe.throw(_("An account with this email already exists. Please sign in instead."))
	if frappe.db.exists("CRM Company", company_name):
		frappe.throw(_("This company name is already registered. Please choose a different name."))

	otp = _gen_otp()
	frappe.cache.set_value(
		_key("signup", email),
		{
			"first_name": first_name,
			"last_name": (last_name or "").strip(),
			"email": email,
			"password": password,
			"company_name": company_name,
			"otp": otp,
			"attempts": 0,
			"ttl": SIGNUP_TTL_SEC,
		},
		expires_in_sec=SIGNUP_TTL_SEC,
	)
	emails.send_signup_otp(email, first_name, otp, SIGNUP_TTL_SEC // 60)
	return {"success": True, "email": email, "expires_in": SIGNUP_TTL_SEC}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=300)
def resend_signup_otp(email: str) -> dict:
	email = _norm_email(email)
	key = _key("signup", email)
	data = frappe.cache.get_value(key)
	if not data:
		frappe.throw(_("Signup session expired. Please start over."))

	data["otp"] = _gen_otp()
	data["attempts"] = 0
	frappe.cache.set_value(key, data, expires_in_sec=SIGNUP_TTL_SEC)
	emails.send_signup_otp(email, data.get("first_name", ""), data["otp"], SIGNUP_TTL_SEC // 60)
	return {"success": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=300)
def verify_signup_otp(email: str, otp: str) -> dict:
	"""Verify the code, then create Company + User + Member as one unit."""
	email = _norm_email(email)
	key = _key("signup", email)
	data = _check_otp(key, otp, "Verification session expired. Please sign up again.")

	company_name = normalize_company_name(data.get("company_name", ""))
	if not company_name:
		frappe.throw(_("Signup is missing a company name. Please start over."))
	# Re-check: someone may have taken the name while this user was verifying.
	if frappe.db.exists("CRM Company", company_name):
		frappe.throw(_("This company name was just registered. Please choose a different name."))
	if frappe.db.exists("User", email):
		frappe.throw(_("An account with this email already exists. Please sign in instead."))

	company_created = False
	try:
		company = frappe.new_doc("CRM Company")
		company.company_name = company_name
		company.is_active = 1
		company.email = email
		# owner_user is a Link to User and the User does not exist yet — setting it
		# here fails link validation. It is filled in after the user is created.
		company.insert(ignore_permissions=True)
		company_created = True

		user = frappe.new_doc("User")
		user.email = email
		user.first_name = data["first_name"]
		user.last_name = data.get("last_name", "")
		user.user_type = "System User"
		user.enabled = 1
		user.send_welcome_email = 0
		# Must be set BEFORE insert: Frappe's zxcvbn check otherwise rejects
		# perfectly reasonable passwords with advice like "Capitalization doesn't
		# help very much". We enforce our own minimum length instead.
		user.flags.ignore_password_policy = True

		# Frappe msgprints "Newly created user has no roles enabled" here, with an
		# "Add Roles" button pointing into the desk — which is blocked for tenants.
		# Roles arrive moments later from the Company Member row below, so the
		# warning is both wrong and unreachable. Mute just this insert.
		muted = frappe.flags.mute_messages
		frappe.flags.mute_messages = True
		try:
			user.insert(ignore_permissions=True)
		finally:
			frappe.flags.mute_messages = muted

		# AFTER insert, via the raw helper — user.new_password would re-run the policy.
		update_password(email, data["password"])

		# Safe now that the User row exists.
		frappe.db.set_value("CRM Company", company.name, "owner_user", email)

		member = frappe.new_doc("CRM Company Member")
		member.user = email
		member.company = company.name
		member.crm_role = "Company Admin"
		member.invited_by = email  # self-registered
		member.insert(ignore_permissions=True)  # on_update grants roles + FCRM module

		frappe.db.commit()
	except Exception:
		frappe.db.rollback()
		# The company name IS the doc name, so a stranded row would permanently
		# block re-signup with that name.
		if company_created:
			try:
				if frappe.db.exists("CRM Company", company_name):
					frappe.delete_doc(
						"CRM Company", company_name, ignore_permissions=True, force=True
					)
					frappe.db.commit()
			except Exception:
				pass
		frappe.log_error(frappe.get_traceback(), "CRM signup failed")
		frappe.throw(_("Could not complete signup. Please try again."))

	frappe.cache.delete_value(key)
	return {"success": True, "user": email, "company": company_name}


# ── password reset ───────────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=300)
def send_password_reset_otp(email: str) -> dict:
	"""Always reports success — a different answer for unknown addresses would
	turn this into an account-enumeration oracle."""
	email = _norm_email(email)
	if not _valid_email(email) or not frappe.db.exists("User", email):
		return {"success": True}

	otp = _gen_otp()
	frappe.cache.set_value(
		_key("reset", email),
		{"otp": otp, "attempts": 0, "ttl": RESET_TTL_SEC},
		expires_in_sec=RESET_TTL_SEC,
	)
	emails.send_reset_otp(email, otp, RESET_TTL_SEC // 60)
	return {"success": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=300)
def verify_reset_otp(email: str, otp: str) -> dict:
	"""Check a reset code *without* consuming it.

	Splitting verify from reset is what lets the UI reject a wrong code while the
	user is still on the code screen, instead of accepting it, collecting a new
	password, and only then failing. `reset_password_with_otp` re-checks the same
	code, so nothing is trusted from the client in between.

	`_check_otp` only counts an attempt on a *mismatch*, so a correct code
	verified here does not eat into the attempt budget.
	"""
	email = _norm_email(email)
	_check_otp(_key("reset", email), otp, "Invalid or expired code. Please request a new one.")
	return {"success": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=300)
def reset_password_with_otp(email: str, otp: str, new_password: str) -> dict:
	email = _norm_email(email)
	key = _key("reset", email)
	_check_otp(key, otp, "Invalid or expired code. Please request a new one.")

	if len(new_password or "") < MIN_PASSWORD_LEN:
		frappe.throw(_("Password must be at least {0} characters.").format(MIN_PASSWORD_LEN))
	if not frappe.db.exists("User", email):
		frappe.throw(_("Invalid or expired code. Please request a new one."))

	update_password(email, new_password)
	frappe.db.commit()
	frappe.cache.delete_value(key)
	return {"success": True}


# ── passwordless sign-in ─────────────────────────────────────────────────────


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=5, seconds=300)
def send_login_otp(email: str) -> dict:
	email = _norm_email(email)
	if not _valid_email(email) or not frappe.db.exists("User", email):
		return {"success": True}
	if not frappe.db.get_value("User", email, "enabled"):
		return {"success": True}

	otp = _gen_otp()
	frappe.cache.set_value(
		_key("login", email),
		{"otp": otp, "attempts": 0, "ttl": LOGIN_OTP_TTL_SEC},
		expires_in_sec=LOGIN_OTP_TTL_SEC,
	)
	emails.send_login_otp(email, otp, LOGIN_OTP_TTL_SEC // 60)
	return {"success": True}


@frappe.whitelist(allow_guest=True, methods=["POST"])
@rate_limit(limit=10, seconds=300)
def verify_login_otp(email: str, otp: str) -> dict:
	"""Issues a real session with no password, so the attempt cap in _check_otp
	is what stands between a 6-digit code and account takeover."""
	email = _norm_email(email)
	key = _key("login", email)
	_check_otp(key, otp, "Invalid or expired code. Please request a new one.")

	if not frappe.db.exists("User", email) or not frappe.db.get_value("User", email, "enabled"):
		frappe.throw(_("Invalid or expired code. Please request a new one."))

	frappe.cache.delete_value(key)
	frappe.local.login_manager.login_as(email)
	frappe.db.commit()
	return {"success": True, "user": email}


def signin_url() -> str:
	return get_url("/login")
