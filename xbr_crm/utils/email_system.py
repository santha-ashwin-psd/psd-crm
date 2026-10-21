"""System email sender for authentication mail (OTPs, invites).

Sends through the site's default outgoing Email Account (Settings > Email, the
account marked "Default Outgoing"), or the `mail_server` / `mail_login` /
`mail_password` keys in site_config.json when no such account exists — the same
lookup Frappe uses for all outgoing mail. No credentials live in source.

Sent synchronously rather than through the Email Queue: sign-in codes and
invitations must not sit waiting for the scheduler. Business email (lead/deal
correspondence) still goes through the normal queue.
"""

from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import formataddr

import frappe
from frappe.email.doctype.email_account.email_account import EmailAccount

_DEFAULT_SENDER_NAME = "PS Digitise CRM"


def _outgoing_account():
	"""The configured default outgoing account, or None when none is set up."""
	try:
		account = EmailAccount.find_outgoing()
	except Exception:
		return None
	# With mute_emails on and nothing configured, Frappe hands back a placeholder
	# account that has no SMTP server; treat that as "not configured".
	if not account or not (account.get("smtp_server") or account.get("service")):
		return None
	return account


def send_system_email(to: str, subject: str, html: str, text_fallback: str = "") -> bool:
	"""Send one auth email synchronously.

	Never raises: a mail failure must not roll back the signup/invite transaction
	that called it. Returns False and logs instead, so the caller can decide
	whether to surface "couldn't send, try resend".
	"""
	if not to:
		return False

	if frappe.are_emails_muted():
		frappe.log_error(f"System email to {to} not sent: emails are muted on this site", "CRM System Email")
		return False

	account = _outgoing_account()
	if not account:
		frappe.log_error(
			f"System email to {to} not sent: no default outgoing Email Account is configured "
			"(Settings > Email, tick 'Default Outgoing').",
			"CRM System Email",
		)
		return False

	from_email = account.email_id
	from_name = frappe.conf.get("email_sender_name") or _DEFAULT_SENDER_NAME

	msg = MIMEMultipart("alternative")
	msg["Subject"] = subject
	msg["From"] = formataddr((from_name, from_email))
	msg["To"] = to
	# Plain part first — per RFC 2046 the last part is the preferred one, so the
	# HTML must come second to be what clients actually render.
	msg.attach(MIMEText(text_fallback or _strip_tags(html), "plain", "utf-8"))
	msg.attach(MIMEText(html, "html", "utf-8"))

	try:
		account.get_smtp_server().session.sendmail(from_email, [to], msg.as_string())
		return True
	except Exception as exc:
		frappe.log_error(f"System email to {to} via {account.name} failed: {exc}", "CRM System Email")
		return False


def _strip_tags(html: str) -> str:
	"""Crude HTML -> text for the plain-text alternative part."""
	import re

	text = re.sub(r"<br\s*/?>", "\n", html or "")
	text = re.sub(r"</p>", "\n\n", text)
	text = re.sub(r"<[^>]+>", "", text)
	return re.sub(r"\n{3,}", "\n\n", text).strip()
