"""Block the Frappe desk UI for everyone except Administrator.

Why a before_request hook and nothing else:
  * /app is a website_redirect declared by Frappe itself -> /desk.
  * /desk is HARDCODED in frappe/website/path_resolver.py, ahead of redirects,
    website_route_rules and page_renderer hooks.
  So route rules and renderers can never see it. before_request runs inside
  frappe/app.py::init_request immediately after `frappe.local.http_request =
  HTTPRequest()`, so the session and user are already resolved.

Why NOT user_type / desk_access / block_modules — all three are dead ends, please
do not "simplify" this back into one of them:
  * `user_type` is DERIVED on every User.save() from whether any of the user's
    roles has desk_access=1 (frappe/core/doctype/user/user.py::set_system_user),
    and crm_company_member.py::_sync_user_role saves the User on every member
    change — so it cannot be pinned to "Website User".
  * desk_access=0 on Sales User / Sales Manager is site-wide and turns them into
    Website Users, which restricts File visibility to their own uploads
    (frappe/core/doctype/file/file.py) — attachments from teammates vanish.
  * block_modules is COSMETIC: only the workspace sidebar and dashboard list
    filters read it. It denies nothing.

Scope: desk HTML paths ONLY. /api/method/frappe.desk.* is deliberately untouched
because the SPA depends on eight of those endpoints (assign_to add/add_multiple/
remove_multiple, search.search_link, like.toggle_like, form.load.getdoctype,
event.update_attending_status, bulk_update.submit_cancel_or_update_docs).
"""

import frappe
from werkzeug.exceptions import HTTPException
from werkzeug.utils import redirect

BLOCKED_PREFIXES = ("/app", "/apps", "/desk")


class _DeskBlocked(HTTPException):
	"""A 302 that frappe/app.py can actually turn into a response.

	It must be an HTTPException rather than frappe.Redirect: app.py's
	handle_exception() has no Redirect branch (only website/serve.py does), so a
	frappe.Redirect raised this early renders a "Server Error" page carrying
	status 301 and no Location header.
	"""

	code = 302

	def __init__(self, location: str):
		super().__init__()
		self.location = location

	def get_response(self, environ=None, scope=None):
		return redirect(self.location, 302)


def _is_desk_path(path: str) -> bool:
	# Exact-or-slash, never a bare startswith — "/app" would otherwise also
	# match a future SPA route such as /applications.
	return any(path == p or path.startswith(p + "/") for p in BLOCKED_PREFIXES)


def block_desk():
	request = getattr(frappe.local, "request", None)
	if request is None or request.method == "OPTIONS":
		# OPTIONS skips HTTPRequest(), so there is no session to read.
		return

	if not _is_desk_path(request.path or ""):
		return

	# Administrator is the only exemption, and the literal string is the only way
	# to express it: it lives in AUTOMATIC_ROLES, so frappe.get_roles() never
	# returns it.
	session = getattr(frappe.local, "session", None) or {}
	user = session.get("user") or "Guest"
	if user == "Administrator":
		return

	raise _DeskBlocked("/login" if user == "Guest" else "/dashboard")
