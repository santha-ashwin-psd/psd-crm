"""System email sender for authentication mail (OTPs, invites).

Deliberately bypasses Frappe's Email Queue and the Email Account doctype: sign-in,
signup verification and invitations must work on a fresh site before anyone has
configured an outgoing account, and they must not sit in a queue waiting for the
scheduler. Business email (lead/deal correspondence) still goes through the normal
Email Account plumbing — this module is only for auth.

Configuration precedence: `site_config.json` / `common_site_config.json` keys win,
the constants below fill in anything missing. To move the credential out of source
on a real deployment, set `mail_login` and `mail_password` in site_config.json —
no code change needed.
"""

import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

import frappe

# Fixed sender for every system OTP / invite. Never varies per company, so a new
# install sends mail out of the box with no setup.
_DEFAULT_SMTP = {
	"server": "smtp.gmail.com",
	"port": 587,
	"login": "wecode18@gmail.com",
	"password": "jznv fhwc gzkz wvpg",
	"use_tls": True,
	"use_ssl": False,
	"from_email": "wecode18@gmail.com",
	"from_name": "Frappe CRM",
}

_TIMEOUT = 15


def _conf() -> dict:
	"""SMTP settings: site config first, hardcoded defaults as fallback."""
	c = frappe.conf
	return {
		"server": c.get("mail_server") or _DEFAULT_SMTP["server"],
		"port": int(c.get("mail_port") or _DEFAULT_SMTP["port"]),
		"login": c.get("mail_login") or _DEFAULT_SMTP["login"],
		"password": c.get("mail_password") or _DEFAULT_SMTP["password"],
		"use_tls": bool(c.get("use_tls", _DEFAULT_SMTP["use_tls"])),
		"use_ssl": bool(c.get("use_ssl", _DEFAULT_SMTP["use_ssl"])),
		"from_email": c.get("auto_email_id") or _DEFAULT_SMTP["from_email"],
		"from_name": c.get("email_sender_name") or _DEFAULT_SMTP["from_name"],
	}


def send_system_email(to: str, subject: str, html: str, text_fallback: str = "") -> bool:
	"""Send one auth email synchronously.

	Never raises: a mail failure must not roll back the signup/invite transaction
	that called it. Returns False and logs instead, so the caller can decide
	whether to surface "couldn't send, try resend".
	"""
	if not to:
		return False

	cfg = _conf()

	msg = MIMEMultipart("alternative")
	msg["Subject"] = subject
	msg["From"] = formataddr((cfg["from_name"], cfg["from_email"]))
	msg["To"] = to
	# Plain part first — per RFC 2046 the last part is the preferred one, so the
	# HTML must come second to be what clients actually render.
	msg.attach(MIMEText(text_fallback or _strip_tags(html), "plain", "utf-8"))
	msg.attach(MIMEText(html, "html", "utf-8"))

	try:
		if cfg["use_ssl"]:
			server = smtplib.SMTP_SSL(
				cfg["server"], cfg["port"], timeout=_TIMEOUT, context=ssl.create_default_context()
			)
		else:
			server = smtplib.SMTP(cfg["server"], cfg["port"], timeout=_TIMEOUT)

		with server:
			if cfg["use_tls"] and not cfg["use_ssl"]:
				server.starttls(context=ssl.create_default_context())
			server.login(cfg["login"], cfg["password"])
			server.sendmail(cfg["from_email"], [to], msg.as_string())
		return True
	except Exception as exc:
		frappe.log_error(f"System email to {to} failed: {exc}", "CRM System SMTP")
		return False


def _strip_tags(html: str) -> str:
	"""Crude HTML -> text for the plain-text alternative part."""
	import re

	text = re.sub(r"<br\s*/?>", "\n", html or "")
	text = re.sub(r"</p>", "\n\n", text)
	text = re.sub(r"<[^>]+>", "", text)
	return re.sub(r"\n{3,}", "\n\n", text).strip()
