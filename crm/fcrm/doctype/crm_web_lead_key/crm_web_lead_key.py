# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""One API key per tenant website.

The key is the only thing standing between the public internet and a lead insert
that runs with `ignore_permissions=True`, so resolution is deliberately strict:
the record must exist, be active, and the presented secret must match. There is
no partial-credit path.
"""

import ipaddress
import secrets

import frappe
from frappe import _
from frappe.model.document import Document

# 32 bytes of entropy, URL-safe so it survives being pasted into a header, a
# Zapier field or a shell command without escaping.
SECRET_BYTES = 32


def generate_secret() -> str:
	return secrets.token_urlsafe(SECRET_BYTES)


class CRMWebLeadKey(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		allowed_ips: DF.SmallText | None
		api_key: DF.Password
		captcha_provider: DF.Literal["recaptcha", "hcaptcha"]
		captcha_secret: DF.Password | None
		crm_company: DF.Link
		default_lead_owner: DF.Link | None
		is_active: DF.Check
		key_name: DF.Data
		verify_captcha: DF.Check
		website_url: DF.Data | None
	# end: auto-generated types

	def before_insert(self):
		"""Mint the secret if nobody supplied one.

		Generating rather than asking is the point: a key typed by a person is a
		weak key, and the field is `read_only` in the desk precisely so the only
		way to get one is to let this run.
		"""
		if not self.get("api_key"):
			self._plaintext = generate_secret()
			self.api_key = self._plaintext

	def after_insert(self):
		"""Show the generated secret once — this is the only chance to read it.

		A Password field is encrypted at rest and never sent to the browser, so a
		key created in the desk would otherwise be unusable: correctly stored and
		permanently unreadable.
		"""
		if getattr(self, "_plaintext", None):
			_announce_secret(self.name, self._plaintext, _("API key created"))

	def validate(self):
		self.validate_allowed_ips()
		self.validate_captcha_config()

	def validate_allowed_ips(self):
		"""Fail at save time, not at request time.

		A typo in the allowlist is otherwise invisible until the website's leads
		start silently 403-ing in production.
		"""
		for entry in parse_ip_list(self.allowed_ips):
			try:
				ipaddress.ip_network(entry, strict=False)
			except ValueError:
				frappe.throw(
					frappe._("{0} is not a valid IP address or CIDR range").format(frappe.bold(entry))
				)

	def validate_captcha_config(self):
		if not self.verify_captcha:
			return
		if not self.captcha_provider:
			frappe.throw(frappe._("Select a Captcha Provider to verify captcha server-side"))
		if not self.get_password("captcha_secret", raise_exception=False):
			frappe.throw(frappe._("Captcha Secret is required to verify captcha server-side"))

	def rotate(self) -> str:
		"""Replace the secret and return the new one.

		Rotation is immediate and total: the old secret stops working the moment
		this commits, so whoever is using it starts getting 401s. That is the
		correct behaviour for a leaked key, but it means a planned rotation needs
		the new value delivered to the caller first. There is deliberately no
		grace period or second active secret — two live keys is the thing you are
		rotating to get away from.
		"""
		plaintext = generate_secret()
		self.api_key = plaintext
		self.last_rotated_on = frappe.utils.now_datetime()
		self.save(ignore_permissions=True)
		frappe.db.commit()
		_announce_secret(self.name, plaintext, _("API key rotated"))
		return plaintext

	def ip_allowed(self, ip: str | None) -> bool:
		"""True when `ip` is covered by the allowlist, or no allowlist is set.

		An empty allowlist means "any IP", which is the documented default: the key
		itself is the primary control and not every deployment has a static egress IP.
		"""
		entries = parse_ip_list(self.allowed_ips)
		if not entries:
			return True
		if not ip:
			# An allowlist is configured but we cannot see a client IP. Deny: the
			# operator asked for IP pinning and we cannot honour it.
			return False
		try:
			addr = ipaddress.ip_address(ip)
		except ValueError:
			return False
		for entry in entries:
			try:
				if addr in ipaddress.ip_network(entry, strict=False):
					return True
			except ValueError:
				continue
		return False


def _announce_secret(key_name: str, plaintext: str, heading: str):
	"""Surface a freshly minted secret exactly once, wherever we are running.

	Two contexts, two mechanisms: `bench execute` has no UI, so it needs stdout;
	the desk has no stdout the user will ever see, so it needs a msgprint. Doing
	only one of them makes the key unreadable in the other.
	"""
	banner = "=" * 70
	print(f"\n{banner}\n{heading}: {key_name}\n  {plaintext}\n{banner}")
	print("Shown once. Send it out-of-band — not in the same message as the docs.\n")

	if getattr(frappe.local, "request", None):
		frappe.msgprint(
			_("{0}. Copy it now — it cannot be shown again:<br><br><b>{1}</b>").format(
				heading, frappe.utils.escape_html(plaintext)
			),
			title=_("Save this key"),
			indicator="orange",
		)


def parse_ip_list(raw: str | None) -> list[str]:
	"""Split the allowlist on newlines and commas, dropping blanks."""
	if not raw:
		return []
	parts: list[str] = []
	for line in raw.splitlines():
		parts.extend(piece.strip() for piece in line.split(","))
	return [p for p in parts if p]


def resolve_key(presented: str | None) -> "CRMWebLeadKey | None":
	"""Find the active key whose secret matches `presented`, else None.

	Keys are stored in a Password field, which is encrypted and therefore not
	searchable — so this walks the active keys and compares. The table holds one
	row per tenant website, so the scan is small by construction; if it ever is
	not, add a non-secret lookup prefix rather than weakening the storage.
	"""
	if not presented:
		return None

	for name in frappe.get_all("CRM Web Lead Key", filters={"is_active": 1}, pluck="name"):
		doc = frappe.get_cached_doc("CRM Web Lead Key", name)
		secret = doc.get_password("api_key", raise_exception=False)
		# compare_digest-style: frappe's own check is a plain compare, but these are
		# short secrets over a network, so use the constant-time one.
		if secret and _constant_time_equals(secret, presented):
			return doc
	return None


def _constant_time_equals(a: str, b: str) -> bool:
	import hmac

	return hmac.compare_digest(str(a), str(b))
