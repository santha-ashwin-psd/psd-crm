"""Context for the CRM sign-in / sign-up page.

This file shadows `frappe/www/login.py`: Frappe's template renderer walks
`reversed(frappe.get_installed_apps())`, and `crm` sorts after `frappe`, so this page
wins for `/login` site-wide. No `website_route_rules` entry is needed (and none should
be added — CRM has no catch-all route for it to compete with).
"""

import frappe

no_cache = 1


def get_context(context):
	redirect_to = _safe_redirect(frappe.local.request.args.get("redirect-to"))

	# Already signed in — don't show a login form, just go where they were headed.
	if frappe.session.user and frappe.session.user != "Guest":
		frappe.local.flags.redirect_location = redirect_to
		raise frappe.Redirect(302)

	context.no_header = 1
	context.no_footer = 1
	context.no_sidebar = 1
	context.title = "Sign In — Frappe CRM"
	context.redirect_to = redirect_to

	# Guest sessions get a CSRF token too; every POST from this page sends it.
	# Same pattern as crm/www/crm_form.py.
	try:
		context.csrf_token = frappe.sessions.get_csrf_token()
	except Exception:
		context.csrf_token = ""

	return context


def _safe_redirect(target: str | None) -> str:
	"""Only allow same-origin absolute paths.

	Rejects protocol-relative URLs (`//evil.com`), which a bare `startswith("/")`
	check would let through as an open redirect, and anything pointing back at an
	auth route (which would bounce the user straight back here after login).
	"""
	target = (target or "").strip()
	if not target.startswith("/") or target.startswith("//"):
		return "/dashboard"
	if target.startswith(("/login", "/update-password")):
		return "/dashboard"
	return target
