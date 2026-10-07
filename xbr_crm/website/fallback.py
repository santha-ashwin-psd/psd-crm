"""Serve the CRM SPA for any path nothing else can render, instead of a 404.

Registered via the `page_renderer` hook. Frappe consults custom renderers BEFORE
the standard ones (frappe/website/path_resolver.py), so this must re-run their
can_render() checks and stand down whenever one of them would have handled the
path. That is what makes this a 404 *replacement* rather than a catch-all.

Why not a `{"from_route": "/<path:app_path>"}` website_route_rule like Books
uses: route rules rewrite the endpoint before the renderer loop runs, so a
catch-all silently swallows /update-password (the links our password-reset email
sends), /printview, /me, every root-routed Web Form, and /integrations/* — and
that last one cannot be carved out, because `to_route` can't carry a placeholder.
"""

import frappe
from frappe.website.page_renderers.document_page import DocumentPage
from frappe.website.page_renderers.list_renderer import ListPage
from frappe.website.page_renderers.print_page import PrintPage
from frappe.website.page_renderers.static_page import StaticPage
from frappe.website.page_renderers.template_page import TemplatePage
from frappe.website.page_renderers.web_form import WebFormPage

# Mirrors the standard renderer list in frappe/website/path_resolver.py.
_STANDARD = (StaticPage, WebFormPage, DocumentPage, TemplatePage, PrintPage, ListPage)


class CRMFallbackPage:
	def __init__(self, path, http_status_code=None):
		self.path = path
		self.http_status_code = http_status_code

	def can_render(self) -> bool:
		for renderer in _STANDARD:
			try:
				if renderer(self.path, self.http_status_code).can_render():
					return False
			except Exception:
				# A renderer that errors while probing is not one that can serve
				# this path — keep checking the rest.
				continue
		return True

	def render(self):
		# TemplatePage("crm") runs xbr_crm/www/crm.py::get_context, which bounces
		# Guests to /login. That raise propagates to website/serve.py, which does
		# know how to turn frappe.Redirect into a RedirectPage.
		return TemplatePage("crm", self.http_status_code).render()
