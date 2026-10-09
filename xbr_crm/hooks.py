app_name = "xbr_crm"
app_title = "XBR CRM"
app_publisher = "Frappe Technologies Pvt. Ltd."
app_description = "XBR CRM"
app_email = "shariq@frappe.io"
app_license = "AGPLv3"
app_icon_url = "/assets/xbr_crm/images/logo.svg"
app_icon_title = "XBR CRM"
app_icon_route = "/"

# Apps
# ------------------

# required_apps = []
add_to_apps_screen = [
	{
		"name": "crm",
		"logo": "/assets/xbr_crm/images/logo.svg",
		"title": "XBR CRM",
		"route": "/",
		"has_permission": "xbr_crm.api.check_app_permission",
	}
]

get_site_info = "xbr_crm.activation.get_site_info"

export_python_type_annotations = True
require_type_annotated_api_methods = True

# Includes in <head>
# ------------------

# include js, css files in header of desk.html
# app_include_css = "/assets/xbr_crm/css/crm.css"
# app_include_js = "/assets/xbr_crm/js/crm.js"

# include js, css files in header of web template
# web_include_css = "/assets/xbr_crm/css/crm.css"
# web_include_js = "/assets/xbr_crm/js/crm.js"

# include custom scss in every website theme (without file extension ".scss")
# website_theme_scss = "xbr_crm/public/scss/website"

# include js, css files in header of web form
# webform_include_js = {"doctype": "public/js/doctype.js"}
# webform_include_css = {"doctype": "public/css/doctype.css"}

# include js in page
# page_js = {"page" : "public/js/file.js"}

# include js in doctype views
doctype_js = {
	"Quotation": "public/js/erpnext_quotation_prefill.js",
	"Sales Order": "public/js/erpnext_sales_order_customer.js",
	"CRM Lead": "public/js/domain_enrichment.js",
	"CRM Organization": "public/js/domain_enrichment.js",
	"CRM Deal": "public/js/domain_enrichment.js",
}
# doctype_list_js = {"doctype" : "public/js/doctype_list.js"}
# doctype_tree_js = {"doctype" : "public/js/doctype_tree.js"}
# doctype_calendar_js = {"doctype" : "public/js/doctype_calendar.js"}

# Home Pages
# ----------

# application home page (will override Website Settings)
# home_page = "login"

# website user home page (by Role)
# role_home_page = {
# "Role": "home_page"
# }

# The SPA is the site root. Without this, frappe/website/utils.py:128 sends a
# logged-in System User hitting "/" straight to the desk. Cached per user in
# redis, so `bench clear-cache` is required after changing it.
home_page = "crm"

website_route_rules = [
	# Public web forms first. This rule carries two werkzeug weights so it
	# outranks anything more generic — it must never be shadowed.
	{"from_route": "/crm-form/<route>", "to_route": "crm_form"},
	# One rule per SPA route, mirroring frontend/src/router.js.
	{"from_route": "/dashboard", "to_route": "crm"},
	{"from_route": "/notifications", "to_route": "crm"},
	{"from_route": "/leads", "to_route": "crm"},
	{"from_route": "/leads/<path:path>", "to_route": "crm"},
	{"from_route": "/pipeline", "to_route": "crm"},
	{"from_route": "/pipeline/<path:path>", "to_route": "crm"},
	# Old Deals URLs: serve the SPA so its router can redirect them to /pipeline.
	{"from_route": "/deals", "to_route": "crm"},
	{"from_route": "/deals/<path:path>", "to_route": "crm"},
	{"from_route": "/notes", "to_route": "crm"},
	{"from_route": "/notes/<path:path>", "to_route": "crm"},
	{"from_route": "/tasks", "to_route": "crm"},
	{"from_route": "/tasks/<path:path>", "to_route": "crm"},
	{"from_route": "/contacts", "to_route": "crm"},
	{"from_route": "/contacts/<path:path>", "to_route": "crm"},
	{"from_route": "/organizations", "to_route": "crm"},
	{"from_route": "/organizations/<path:path>", "to_route": "crm"},
	{"from_route": "/call-logs", "to_route": "crm"},
	{"from_route": "/call-logs/<path:path>", "to_route": "crm"},
	{"from_route": "/calendar", "to_route": "crm"},
	{"from_route": "/data-import", "to_route": "crm"},
	{"from_route": "/data-import/<path:path>", "to_route": "crm"},
	{"from_route": "/welcome", "to_route": "crm"},
	{"from_route": "/onboarding", "to_route": "crm"},
	{"from_route": "/not-permitted", "to_route": "crm"},
	# Deliberately NO "/<path:app_path>" catch-all: website_route_rules rewrite
	# the endpoint before the renderer loop, so a catch-all would also swallow
	# /update-password (our password-reset links), /printview, /me, root-routed
	# Web Forms and /integrations/* — the last of which cannot be carved out,
	# because to_route can't carry a placeholder. Unknown paths are handled by
	# the page_renderer below instead.
]

# 404 replacement: serves the SPA shell only when no standard renderer can
# handle the path, so unknown URLs land on the app (and the router sends them
# to the dashboard) without stealing framework pages.
page_renderer = ["xbr_crm.website.fallback.CRMFallbackPage"]

# Blocks the desk UI for everyone but Administrator. Must be a before_request
# hook: /desk is hardcoded in frappe/website/path_resolver.py ahead of route
# rules and page renderers, so nothing else can see it.
before_request = ["xbr_crm.utils.desk_guard.block_desk"]

# Generators
# ----------

# automatically create page for each record of this doctype
# website_generators = ["Web Page"]

# Jinja
# ----------

# add methods and filters to jinja environment
# jinja = {
# "methods": "xbr_crm.utils.jinja_methods",
# "filters": "xbr_crm.utils.jinja_filters"
# }

# Setup wizard
# setup_wizard_requires = "assets/crm/js/setup_wizard.js"
# setup_wizard_stages = "crm.setup.setup_wizard.setup_wizard.get_setup_stages"
# setup_wizard_test = "crm.setup.setup_wizard.test_setup_wizard.run_setup_wizard_test"

# Installation
# ------------

before_install = "xbr_crm.install.before_install"
after_install = "xbr_crm.install.after_install"

# Uninstallation
# ------------

before_uninstall = "xbr_crm.uninstall.before_uninstall"
# after_uninstall = "xbr_crm.uninstall.after_uninstall"

# Integration Setup
# ------------------
# To set up dependencies/integrations with other apps
# Name of the app being installed is passed as an argument

# before_app_install = "xbr_crm.utils.before_app_install"
# after_app_install = "xbr_crm.utils.after_app_install"

# Integration Cleanup
# -------------------
# To clean up dependencies/integrations with other apps
# Name of the app being uninstalled is passed as an argument

# before_app_uninstall = "xbr_crm.utils.before_app_uninstall"
# after_app_uninstall = "xbr_crm.utils.after_app_uninstall"

# Desk Notifications
# ------------------
# See frappe.core.notifications.get_notification_config

# notification_config = "crm.notifications.get_notification_config"

# Permissions
# -----------
# Permissions evaluated in scripted ways

# Values are LISTS: Frappe collects every registered hook for a doctype and ANDs
# the resulting conditions together (frappe/model/db_query.py), so the Sales
# Hierarchy rules and the per-company tenancy rules compose on their own. Do not
# add a wrapper that tries to merge them by hand.
_TENANCY_QUERY = "xbr_crm.permissions.tenancy.get_permission_query_conditions"
_TENANCY_PERM = "xbr_crm.permissions.tenancy.has_permission"

permission_query_conditions = {
	"CRM Lead": [
		"xbr_crm.permissions.org_hierarchy.get_lead_permission_query_conditions",
		_TENANCY_QUERY,
	],
	"CRM Deal": [
		"xbr_crm.permissions.org_hierarchy.get_deal_permission_query_conditions",
		_TENANCY_QUERY,
	],
	"CRM Notification": [
		"xbr_crm.fcrm.doctype.crm_notification.crm_notification.get_permission_query_conditions",
	],
	"CRM Task": [_TENANCY_QUERY],
	"FCRM Note": [_TENANCY_QUERY],
	"CRM Call Log": [_TENANCY_QUERY],
	"CRM Organization": [_TENANCY_QUERY],
	"Contact": [_TENANCY_QUERY],
	"CRM Sales Hierarchy": [_TENANCY_QUERY],
}

has_permission = {
	"CRM Lead": [
		"xbr_crm.permissions.org_hierarchy.has_lead_permission",
		_TENANCY_PERM,
	],
	"CRM Deal": [
		"xbr_crm.permissions.org_hierarchy.has_deal_permission",
		_TENANCY_PERM,
	],
	"CRM Notification": [
		"xbr_crm.fcrm.doctype.crm_notification.crm_notification.has_permission",
	],
	"CRM Task": [_TENANCY_PERM],
	"FCRM Note": [_TENANCY_PERM],
	"CRM Call Log": [_TENANCY_PERM],
	"CRM Organization": [_TENANCY_PERM],
	"Contact": [_TENANCY_PERM],
	"CRM Sales Hierarchy": [_TENANCY_PERM],
}

# DocType Class
# ---------------
# Override standard doctype classes

override_doctype_class = {
	"Contact": "xbr_crm.overrides.contact.CustomContact",
	"Email Template": "xbr_crm.overrides.email_template.CustomEmailTemplate",
}

# Document Events
# ---------------
# Hook on document methods and events

# Tenant stamping: every new record inherits its creator's company. Written out
# per doctype rather than sharing one dict object — Frappe merges hook dicts across
# apps in place, so a shared reference could be mutated for every entry at once.
_STAMP_FN = "xbr_crm.permissions.tenancy.stamp_company"
# How the record was created (Manual / Website / Email / API / Import).
# Runs alongside the tenancy stamp, not instead of it.
_ORIGIN_FN = "xbr_crm.api.lead_origin.stamp_origin"

doc_events = {
	"CRM Lead": {"before_insert": [_STAMP_FN, _ORIGIN_FN]},
	"CRM Task": {"before_insert": [_STAMP_FN]},
	"FCRM Note": {"before_insert": [_STAMP_FN]},
	"CRM Call Log": {"before_insert": [_STAMP_FN]},
	"CRM Organization": {"before_insert": [_STAMP_FN]},
	"CRM Sales Hierarchy": {"before_insert": [_STAMP_FN]},
	"Contact": {
		"validate": ["xbr_crm.api.contact.validate"],
		"before_insert": ["xbr_crm.permissions.tenancy.stamp_company"],
	},
	"ToDo": {
		"after_insert": ["xbr_crm.api.todo.after_insert"],
		"on_update": ["xbr_crm.api.todo.on_update"],
	},
	"Communication": {
		"after_insert": ["xbr_crm.utils.on_communication_insert"],
		"on_update": ["xbr_crm.utils.on_communication_update"],
	},
	"Comment": {
		"after_insert": ["xbr_crm.utils.on_comment_insert"],
		"on_update": ["xbr_crm.api.comment.on_update"],
	},
	"WhatsApp Message": {
		"validate": ["xbr_crm.api.whatsapp.validate"],
		"on_update": ["xbr_crm.api.whatsapp.on_update"],
	},
	"CRM Deal": {
		"before_insert": ["xbr_crm.permissions.tenancy.stamp_company", _ORIGIN_FN],
		"on_update": [
			"xbr_crm.fcrm.doctype.erpnext_crm_settings.erpnext_crm_settings.create_customer_in_erpnext"
		],
	},
	"Sales Order": {
		"before_validate": [
			"xbr_crm.fcrm.doctype.erpnext_crm_settings.erpnext_crm_settings.create_customer_on_sales_order"
		],
	},
	"Item": {
		"after_insert": ["xbr_crm.integrations.erpnext.item.after_insert"],
		"on_update": ["xbr_crm.integrations.erpnext.item.on_update"],
		"before_rename": ["xbr_crm.integrations.erpnext.item.before_rename"],
		"after_rename": ["xbr_crm.integrations.erpnext.item.after_rename"],
		"on_trash": ["xbr_crm.integrations.erpnext.item.on_trash"],
	},
	"User Permission": {
		"before_validate": ["xbr_crm.integrations.erpnext.user_permission.before_validate"],
		"after_insert": ["xbr_crm.integrations.erpnext.user_permission.after_insert"],
		"on_update": ["xbr_crm.integrations.erpnext.user_permission.on_update"],
		"on_trash": ["xbr_crm.integrations.erpnext.user_permission.on_trash"],
	},
	"DocShare": {
		"before_validate": ["xbr_crm.integrations.erpnext.doc_share.before_validate"],
		"after_insert": ["xbr_crm.integrations.erpnext.doc_share.after_insert"],
		"on_update": ["xbr_crm.integrations.erpnext.doc_share.on_update"],
		"on_trash": ["xbr_crm.integrations.erpnext.doc_share.on_trash"],
	},
}

# Scheduled Tasks
# ---------------

scheduler_events = {
	"daily": ["xbr_crm.fcrm.doctype.crm_view_settings.crm_view_settings.clear_old_versions"],
	"daily_long": ["xbr_crm.lead_syncing.background_sync.sync_leads_from_sources_daily"],
	"hourly_long": ["xbr_crm.lead_syncing.background_sync.sync_leads_from_sources_hourly"],
	"monthly_long": ["xbr_crm.lead_syncing.background_sync.sync_leads_from_sources_monthly"],
	"cron": {
		# Every minute; needs `scheduler_tick_interval: 60` in common_site_config
		# (Frappe's default tick is 4 minutes).
		"* * * * *": ["xbr_crm.reminders.service.send_due_reminders"],
		# Daily at 09:00 (site timezone): pipelines stuck in the follow-up stage.
		"0 9 * * *": ["xbr_crm.follow_ups.send_stuck_follow_up_alerts"],
		"*/5 * * * *": ["xbr_crm.lead_syncing.background_sync.sync_leads_from_sources_5_minutes"],
		"*/10 * * * *": ["xbr_crm.lead_syncing.background_sync.sync_leads_from_sources_10_minutes"],
		"*/15 * * * *": ["xbr_crm.lead_syncing.background_sync.sync_leads_from_sources_15_minutes"],
	},
}

# Testing
# -------

before_tests = "xbr_crm.tests.before_tests"

# Overriding Methods
# ------------------------------
#
# override_whitelisted_methods = {
# "frappe.desk.doctype.event.event.get_events": "crm.event.get_events"
# }

# The app was renamed from `crm` to `xbr_crm`. Websites and Zaps configured before
# the rename still POST to the old method path, so keep it answering.
override_whitelisted_methods = {
	"crm.api.web_lead.capture_inquiry": "xbr_crm.api.web_lead.capture_inquiry",
}

# each overriding function accepts a `data` argument;
# generated from the base implementation of the doctype dashboard,
# along with any modifications made in other Frappe apps
# override_doctype_dashboards = {
# "Task": "crm.task.get_dashboard_data"
# }

# exempt linked doctypes from being automatically cancelled
#
# auto_cancel_exempted_doctypes = ["Auto Repeat"]

# Ignore links to specified DocTypes when deleting documents
# -----------------------------------------------------------

ignore_links_on_delete = ["Failed Lead Sync Log"]

# Request Events
# ----------------
# before_request = ["xbr_crm.utils.before_request"]
# after_request = ["xbr_crm.utils.after_request"]

# Job Events
# ----------
# before_job = ["xbr_crm.utils.before_job"]
# after_job = ["xbr_crm.utils.after_job"]

# User Data Protection
# --------------------

# user_data_fields = [
# {
# "doctype": "{doctype_1}",
# "filter_by": "{filter_by}",
# "redact_fields": ["{field_1}", "{field_2}"],
# "partial": 1,
# },
# {
# "doctype": "{doctype_2}",
# "filter_by": "{filter_by}",
# "partial": 1,
# },
# {
# "doctype": "{doctype_3}",
# "strict": False,
# },
# {
# "doctype": "{doctype_4}"
# }
# ]

# Authentication and authorization
# --------------------------------

# auth_hooks = [
# "crm.auth.validate"
# ]

after_migrate = [
	"xbr_crm.fcrm.doctype.fcrm_settings.fcrm_settings.after_migrate",
	"xbr_crm.api.whatsapp.add_roles",
	"xbr_crm.domain_enrichment.install.seed_default_rules_and_mappings",
	"xbr_crm.install.add_default_scripts",
	"xbr_crm.install.add_web_form_custom_fields",
	"xbr_crm.install.add_web_lead_custom_fields",
	"xbr_crm.install.add_web_lead_side_panel_section",
	"xbr_crm.install.add_lead_origin_field",
	"xbr_crm.install.add_lead_origin_to_side_panel",
	"xbr_crm.reminders.templates.create_default_templates",
]

standard_dropdown_items = [
	{
		"name1": "app_selector",
		"label": "Apps",
		"type": "Route",
		"route": "#",
		"is_standard": 1,
	},
	{
		"name1": "settings",
		"label": "Settings",
		"type": "Route",
		"icon": "settings",
		"route": "#",
		"is_standard": 1,
	},
	{
		"name1": "login_to_fc",
		"label": "Login to Frappe Cloud",
		"type": "Route",
		"route": "#",
		"is_standard": 1,
	},
	{
		"name1": "about",
		"label": "About",
		"type": "Route",
		"icon": "info",
		"route": "#",
		"is_standard": 1,
	},
	{
		"name1": "separator",
		"label": "",
		"type": "Separator",
		"is_standard": 1,
	},
	{
		"name1": "logout",
		"label": "Log out",
		"type": "Route",
		"icon": "log-out",
		"route": "#",
		"is_standard": 1,
	},
]
