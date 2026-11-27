# Copyright (c) 2022, Frappe Technologies Pvt. Ltd. and Contributors
# MIT License. See license.txt
import json

import click
import frappe
from frappe.custom.doctype.custom_field.custom_field import create_custom_fields

from xbr_crm.domain_enrichment.install import seed_default_rules_and_mappings
from xbr_crm.fcrm.doctype.crm_dashboard.crm_dashboard import create_default_manager_dashboard
from xbr_crm.fcrm.doctype.crm_products.crm_products import create_product_details_script
from xbr_crm.reminders.templates import create_default_templates


def before_install():
	pass


def after_install(force=False):
	add_default_lead_statuses()
	add_default_deal_statuses()
	set_default_follow_up_stage()
	add_default_communication_statuses()
	add_default_fields_layout(force)
	add_property_setter()
	add_email_template_custom_fields()
	add_email_account_custom_field()
	add_web_form_custom_fields()
	add_default_industries()
	add_default_lead_sources()
	add_default_territories()
	add_default_lost_reasons()
	add_default_quick_filters()
	add_standard_dropdown_items()
	add_default_scripts()
	create_default_manager_dashboard(force)
	create_assignment_rule_custom_fields()
	add_assignment_rule_property_setters()
	seed_default_rules_and_mappings()
	setup_tenancy()
	create_default_templates()
	add_desk_user_role()
	frappe.db.commit()


def setup_tenancy():
	from xbr_crm.tenancy.install import setup_tenancy as _setup

	_setup()


def add_default_lead_statuses():
	statuses = {
		"New": {
			"color": "gray",
			"type": "Open",
			"position": 1,
		},
		"Contacted": {
			"color": "orange",
			"type": "Ongoing",
			"position": 2,
		},
		"Nurture": {
			"color": "blue",
			"type": "Ongoing",
			"position": 3,
		},
		"Qualified": {
			"color": "green",
			"type": "Won",
			"position": 4,
		},
		"Converted": {
			"color": "teal",
			"type": "Won",
			"position": 5,
		},
		"Unqualified": {
			"color": "red",
			"type": "Lost",
			"position": 6,
		},
		"Junk": {
			"color": "purple",
			"type": "Lost",
			"position": 7,
		},
	}

	for status in statuses:
		if frappe.db.exists("CRM Lead Status", status):
			continue

		doc = frappe.new_doc("CRM Lead Status")
		doc.lead_status = status
		doc.color = statuses[status]["color"]
		doc.type = statuses[status]["type"]
		doc.position = statuses[status]["position"]
		doc.insert()


# The pipeline stages, in board order. Name -> (type, probability, color).
# Type drives behaviour, not the name: Open/Ongoing/On Hold are still being
# worked, Won/Lost are closed (Lost asks for a lost reason). The first Open stage
# is where every new pipeline starts.
DEFAULT_DEAL_STATUSES = {
	"Interested Leads": ("Open", 10, "cyan"),
	"Prospect": ("Ongoing", 25, "blue"),
	"Counselling": ("Ongoing", 50, "violet"),
	"Follow-up": ("Ongoing", 60, "amber"),
	"Won": ("Won", 100, "green"),
	"Lost": ("Lost", 0, "red"),
	"Archive": ("Lost", 0, "gray"),
	"Future Opportunity": ("On Hold", 10, "teal"),
}


def add_default_deal_statuses():
	for position, (status, (status_type, probability, color)) in enumerate(DEFAULT_DEAL_STATUSES.items(), 1):
		if frappe.db.exists("CRM Deal Status", status):
			continue

		doc = frappe.new_doc("CRM Deal Status")
		doc.deal_status = status
		doc.color = color
		doc.type = status_type
		doc.probability = probability
		doc.position = position
		doc.insert()


def set_default_follow_up_stage():
	# Not a field default: init_singles() saves FCRM Settings before the deal
	# statuses exist, and the Link would fail validation.
	if not frappe.db.get_single_value("FCRM Settings", "follow_up_stage") and frappe.db.exists(
		"CRM Deal Status", "Follow-up"
	):
		frappe.db.set_single_value("FCRM Settings", "follow_up_stage", "Follow-up")


def add_default_communication_statuses():
	statuses = ["Open", "Replied"]

	for status in statuses:
		if frappe.db.exists("CRM Communication Status", status):
			continue

		doc = frappe.new_doc("CRM Communication Status")
		doc.status = status
		doc.insert()


def add_default_fields_layout(force=False):
	quick_entry_layouts = {
		"CRM Lead-Quick Entry": {
			"doctype": "CRM Lead",
			"layout": '[{"name": "person_section", "columns": [{"name": "column_5jrk", "fields": ["salutation", "email"]}, {"name": "column_5CPV", "fields": ["first_name", "mobile_no"]}, {"name": "column_gXOy", "fields": ["last_name", "gender"]}]}, {"name": "organization_section", "columns": [{"name": "column_GHfX", "fields": ["organization", "territory"]}, {"name": "column_hXjS", "fields": ["website", "annual_revenue", "company_description"]}, {"name": "column_RDNA", "fields": ["no_of_employees", "industry", "linkedin", "twitter", "facebook"]}]}, {"name": "lead_section", "columns": [{"name": "column_EO1H", "fields": ["status"]}, {"name": "column_RWBe", "fields": ["lead_owner"]}]}]',
		},
		"CRM Deal-Quick Entry": {
			"doctype": "CRM Deal",
			"layout": '[{"name": "organization_section", "hidden": true, "editable": false, "columns": [{"name": "column_GpMP", "fields": ["organization"]}, {"name": "column_FPTn", "fields": []}]}, {"name": "organization_details_section", "editable": false, "columns": [{"name": "column_S3tQ", "fields": ["organization_name", "territory"]}, {"name": "column_KqV1", "fields": ["website", "annual_revenue", "company_description"]}, {"name": "column_1r67", "fields": ["no_of_employees", "industry", "linkedin", "twitter", "facebook"]}]}, {"name": "contact_section", "hidden": true, "editable": false, "columns": [{"name": "column_CeXr", "fields": ["contact"]}, {"name": "column_yHbk", "fields": []}]}, {"name": "contact_details_section", "editable": false, "columns": [{"name": "column_ZTWr", "fields": ["salutation", "email"]}, {"name": "column_tabr", "fields": ["first_name", "mobile_no"]}, {"name": "column_Qjdx", "fields": ["last_name", "gender"]}]}, {"name": "deal_section", "columns": [{"name": "column_mdps", "fields": ["status"]}, {"name": "column_H40H", "fields": ["deal_owner"]}]}]',
		},
		"Contact-Quick Entry": {
			"doctype": "Contact",
			"layout": '[{"name": "salutation_section", "columns": [{"name": "column_eXks", "fields": ["salutation"]}]}, {"name": "full_name_section", "hideBorder": true, "columns": [{"name": "column_cSxf", "fields": ["first_name"]}, {"name": "column_yBc7", "fields": ["last_name"]}]}, {"name": "email_section", "hideBorder": true, "columns": [{"name": "column_tH3L", "fields": ["email_id"]}]}, {"name": "mobile_gender_section", "hideBorder": true, "columns": [{"name": "column_lrfI", "fields": ["mobile_no"]}, {"name": "column_Tx3n", "fields": ["gender"]}]}, {"name": "organization_section", "hideBorder": true, "columns": [{"name": "column_S0J8", "fields": ["company_name"]}]}, {"name": "designation_section", "hideBorder": true, "columns": [{"name": "column_bsO8", "fields": ["designation"]}]}, {"name": "address_section", "hideBorder": true, "columns": [{"name": "column_W3VY", "fields": ["address"]}]}]',
		},
		"CRM Organization-Quick Entry": {
			"doctype": "CRM Organization",
			"layout": '[{"name": "organization_section", "columns": [{"name": "column_zOuv", "fields": ["organization_name"]}]}, {"name": "website_revenue_section", "hideBorder": true, "columns": [{"name": "column_I5Dy", "fields": ["website", "company_description"]}, {"name": "column_Rgss", "fields": ["annual_revenue"]}]}, {"name": "territory_section", "hideBorder": true, "columns": [{"name": "column_w6ap", "fields": ["territory"]}]}, {"name": "employee_industry_section", "hideBorder": true, "columns": [{"name": "column_u5tZ", "fields": ["no_of_employees", "linkedin", "twitter"]}, {"name": "column_FFrT", "fields": ["industry", "facebook"]}]}, {"name": "address_section", "hideBorder": true, "columns": [{"name": "column_O2dk", "fields": ["address"]}]}]',
		},
		"Address-Quick Entry": {
			"doctype": "Address",
			"layout": '[{"name": "details_section", "columns": [{"name": "column_uSSG", "fields": ["address_title", "address_type", "address_line1", "address_line2"]}]}, {"name": "location_section", "hideBorder": true, "columns": [{"name": "column_TCoZ", "fields": ["country", "city"]}, {"name": "column_PqrK", "fields": ["state", "pincode"]}]}]',
		},
		"CRM Call Log-Quick Entry": {
			"doctype": "CRM Call Log",
			"layout": '[{"name":"details_section","columns":[{"name":"column_uMSG","fields":["type","from","duration","start_time"]},{"name":"column_wiZT","fields":["to","status","caller","receiver"]}]}]',
		},
		"FCRM Note-Quick Entry": {
			"doctype": "FCRM Note",
			"layout": '[{"name":"details_section","columns":[{"name":"column_o2s9","fields":["title", "content"]}]}]',
		},
		"CRM Task-Quick Entry": {
			"doctype": "CRM Task",
			"layout": '[{"name":"first_tab","sections":[{"name":"details_section","columns":[{"name":"column_X9sG","fields":["title","description"]}]},{"name":"assignment_section","columns":[{"name":"column_9XjK","fields":["priority","due_date"]},{"name":"column_7s8n","fields":["assigned_to","status"]}],"hideBorder":true}]}]',
		},
	}

	sidebar_fields_layouts = {
		"CRM Lead-Side Panel": {
			"doctype": "CRM Lead",
			"layout": '[{"label": "Details", "name": "details_section", "opened": true, "columns": [{"name": "column_kl92", "fields": ["organization", "company_description", "website", "territory", "industry", "no_of_employees", "job_title", "source", "lead_owner", "linkedin", "twitter", "facebook"]}]}, {"label": "Person", "name": "person_section", "opened": true, "columns": [{"name": "column_XmW2", "fields": ["salutation", "first_name", "last_name", "email", "mobile_no"]}]}]',
		},
		"CRM Deal-Side Panel": {
			"doctype": "CRM Deal",
			"layout": '[{"label": "Contacts", "name": "contacts_section", "opened": true, "editable": false, "contacts": []}, {"label": "Organization Details", "name": "organization_section", "opened": true, "columns": [{"name": "column_na2Q", "fields": ["organization", "company_description", "industry", "no_of_employees", "website", "territory", "annual_revenue", "closed_date", "probability", "next_step", "deal_owner", "linkedin", "twitter", "facebook"]}]}]',
		},
		"Contact-Side Panel": {
			"doctype": "Contact",
			"layout": '[{"label": "Details", "name": "details_section", "opened": true, "columns": [{"name": "column_eIWl", "fields": ["salutation", "first_name", "last_name", "email_id", "mobile_no", "gender", "company_name", "designation", "address"]}]}]',
		},
		"CRM Organization-Side Panel": {
			"doctype": "CRM Organization",
			"layout": '[{"label": "Details", "name": "details_section", "opened": true, "columns": [{"name": "column_IJOV", "fields": ["organization_name", "company_description", "website", "territory", "industry", "no_of_employees", "address", "linkedin", "twitter", "facebook"]}]}]',
		},
	}

	data_fields_layouts = {
		"CRM Lead-Data Fields": {
			"doctype": "CRM Lead",
			"layout": '[{"label": "Details", "name": "details_section", "opened": true, "columns": [{"name": "column_ZgLG", "fields": ["organization", "company_description", "industry", "no_of_employees"]}, {"name": "column_TbYq", "fields": ["website", "linkedin", "twitter", "facebook", "job_title"]}, {"name": "column_OKSX", "fields": ["territory", "source", "lead_owner"]}]}, {"label": "Person", "name": "person_section", "opened": true, "columns": [{"name": "column_6c5g", "fields": ["salutation", "email"]}, {"name": "column_1n7Q", "fields": ["first_name", "mobile_no"]}, {"name": "column_cT6C", "fields": ["last_name"]}]}]',
		},
		"CRM Deal-Data Fields": {
			"doctype": "CRM Deal",
			"layout": '[{"name":"first_tab","sections":[{"label":"Details","name":"details_section","opened":true,"columns":[{"name":"column_z9XL","fields":["organization","company_description","industry","no_of_employees","annual_revenue"]},{"name":"column_gM4w","fields":["website","linkedin","twitter","facebook","closed_date","next_step"]},{"name":"column_gWmE","fields":["territory","probability","deal_owner"]}]},{"label":"Products","name":"section_jHhQ","opened":true,"columns":[{"name":"column_xiNF","fields":["products"]}],"editingLabel":false,"hideLabel":true},{"label":"New Section","name":"section_WNOQ","opened":true,"columns":[{"name":"column_ziBW","fields":["total"]},{"label":"","name":"column_wuwA","fields":["net_total"]}],"hideBorder":true,"hideLabel":true}]}]',
		},
	}

	for layout in quick_entry_layouts:
		if frappe.db.exists("CRM Fields Layout", layout):
			if force:
				frappe.delete_doc("CRM Fields Layout", layout)
			else:
				continue

		doc = frappe.new_doc("CRM Fields Layout")
		doc.type = "Quick Entry"
		doc.dt = quick_entry_layouts[layout]["doctype"]
		doc.layout = quick_entry_layouts[layout]["layout"]
		doc.insert()

	for layout in sidebar_fields_layouts:
		if frappe.db.exists("CRM Fields Layout", layout):
			if force:
				frappe.delete_doc("CRM Fields Layout", layout)
			else:
				continue

		doc = frappe.new_doc("CRM Fields Layout")
		doc.type = "Side Panel"
		doc.dt = sidebar_fields_layouts[layout]["doctype"]
		doc.layout = sidebar_fields_layouts[layout]["layout"]
		doc.insert()

	for layout in data_fields_layouts:
		if frappe.db.exists("CRM Fields Layout", layout):
			if force:
				frappe.delete_doc("CRM Fields Layout", layout)
			else:
				continue

		doc = frappe.new_doc("CRM Fields Layout")
		doc.type = "Data Fields"
		doc.dt = data_fields_layouts[layout]["doctype"]
		doc.layout = data_fields_layouts[layout]["layout"]
		doc.insert()


def add_property_setter():
	if not frappe.db.exists("Property Setter", {"name": "Contact-main-search_fields"}):
		doc = frappe.new_doc("Property Setter")
		doc.doctype_or_field = "DocType"
		doc.doc_type = "Contact"
		doc.property = "search_fields"
		doc.property_type = "Data"
		doc.value = "email_id"
		doc.insert()


def add_email_template_custom_fields():
	meta = frappe.get_meta("Email Template")

	fields = [
		{
			"default": "0",
			"fieldname": "enabled",
			"fieldtype": "Check",
			"label": "Enabled",
			"insert_after": "",
		},
		{
			"fieldname": "reference_doctype",
			"fieldtype": "Link",
			"label": "Doctype",
			"options": "DocType",
			"insert_after": "enabled",
		},
	]

	fields = [field for field in fields if not meta.has_field(field["fieldname"])]
	if not fields:
		return

	click.secho("* Installing Custom Fields in Email Template")
	create_custom_fields({"Email Template": fields})
	frappe.clear_cache(doctype="Email Template")


def add_email_account_custom_field():
	"""The per-mailbox switch for xbr_crm/api/email_inquiry.py.

	The fieldname still says "lead" from when this created leads; it now creates
	pipelines. Renaming the column would break saved Email Accounts, so only the
	label changed. `create_custom_fields` updates an existing field in place.
	"""
	click.secho("* Installing Custom Fields in Email Account")

	create_custom_fields(
		{
			"Email Account": [
				{
					"default": "0",
					"fieldname": "create_lead_from_incoming_email",
					"fieldtype": "Check",
					"label": "Create Pipeline from Incoming Emails",
					"description": "Automatically create a pipeline in Interested Leads when an incoming email is received from a new sender",
					"insert_after": "create_contact",
				}
			]
		}
	)

	frappe.clear_cache(doctype="Email Account")


def add_web_form_custom_fields():
	"""CRM's own fields on the native Web Form.

	- `crm_published`: separate publish flag so CRM forms are served only by the
	  CRM's own public page (and never rendered by the framework's web form page).
	  The native `published` is always left 0.
	- `crm_hidden_defaults`: JSON of doctype-mandatory fields the author removed
	  from the visible form, with the default value to apply on submission so the
	  target record can still be created.
	"""
	meta = frappe.get_meta("Web Form")
	if meta.has_field("crm_published") and meta.has_field("crm_hidden_defaults"):
		return
	click.secho("* Installing Custom Fields in Web Form")
	create_custom_fields(
		{
			"Web Form": [
				{
					"default": "0",
					"fieldname": "crm_published",
					"fieldtype": "Check",
					"label": "CRM Published",
					"insert_after": "published",
					"hidden": 1,
				},
				{
					"fieldname": "crm_hidden_defaults",
					"fieldtype": "Long Text",
					"label": "CRM Hidden Field Defaults",
					"insert_after": "crm_published",
					"hidden": 1,
				},
			]
		}
	)
	frappe.clear_cache(doctype="Web Form")


def add_default_industries():
	industries = [
		"Accounting",
		"Advertising",
		"Aerospace",
		"Agriculture",
		"Airline",
		"Apparel & Accessories",
		"Automotive",
		"Banking",
		"Biotechnology",
		"Broadcasting",
		"Brokerage",
		"Chemical",
		"Computer",
		"Consulting",
		"Consumer Products",
		"Cosmetics",
		"Defense",
		"Department Stores",
		"Education",
		"Electronics",
		"Energy",
		"Entertainment & Leisure, Executive Search",
		"Financial Services",
		"Food",
		"Beverage & Tobacco",
		"Grocery",
		"Health Care",
		"Internet Publishing",
		"Investment Banking",
		"Legal",
		"Manufacturing",
		"Motion Picture & Video",
		"Music",
		"Newspaper Publishers",
		"Online Auctions",
		"Pension Funds",
		"Pharmaceuticals",
		"Private Equity",
		"Publishing",
		"Real Estate",
		"Retail & Wholesale",
		"Securities & Commodity Exchanges",
		"Service",
		"Soap & Detergent",
		"Software",
		"Sports",
		"Technology",
		"Telecommunications",
		"Television",
		"Transportation",
		"Venture Capital",
	]

	for industry in industries:
		if frappe.db.exists("CRM Industry", industry):
			continue

		doc = frappe.new_doc("CRM Industry")
		doc.industry = industry
		doc.insert()


def add_default_territories():
	"""Seed CRM Territory.

	Nothing ever created these, so the Territory field on Lead / Deal /
	Organization rendered an empty dropdown and looked broken. A flat set of
	regions is enough: CRM only ever uses territory as a Link, and users can add
	their own through the field's "Create New".

	CRM Territory is a nested set (is_tree), so each row is inserted as a leaf
	with no parent — Frappe allows multiple roots.
	"""
	territories = [
		"Africa",
		"Asia Pacific",
		"Europe",
		"Latin America",
		"Middle East",
		"North America",
		"Rest of the World",
	]

	for territory in territories:
		if frappe.db.exists("CRM Territory", territory):
			continue

		doc = frappe.new_doc("CRM Territory")
		doc.territory_name = territory
		doc.is_group = 0
		doc.insert(ignore_permissions=True)


def add_desk_user_role():
	"""Users with this role may open the Frappe desk (/app, /desk); everyone
	else is sent to the CRM dashboard by xbr_crm.utils.desk_guard."""
	from xbr_crm.utils.desk_guard import DESK_USER_ROLE

	if frappe.db.exists("Role", DESK_USER_ROLE):
		return

	frappe.get_doc({"doctype": "Role", "role_name": DESK_USER_ROLE, "desk_access": 1}).insert(
		ignore_permissions=True
	)


def add_default_lead_sources():
	lead_sources = [
		"Email",
		"Existing Customer",
		"Reference",
		"Advertisement",
		"Cold Calling",
		"Exhibition",
		"Supplier Reference",
		"Mass Mailing",
		"Customer's Vendor",
		"Campaign",
		"Walk In",
		"Facebook",
		"Website",
		"Web Form",
	]

	for source in lead_sources:
		if frappe.db.exists("CRM Lead Source", source):
			continue

		doc = frappe.new_doc("CRM Lead Source")
		doc.source_name = source
		doc.insert()


def add_default_lost_reasons():
	lost_reasons = [
		{
			"reason": "Pricing",
			"description": "The prospect found the pricing to be too high or not competitive.",
		},
		{"reason": "Competition", "description": "The prospect chose a competitor's product or service."},
		{
			"reason": "Budget Constraints",
			"description": "The prospect did not have the budget to proceed with the purchase.",
		},
		{
			"reason": "Missing Features",
			"description": "The prospect felt that the product or service was missing key features they needed.",
		},
		{
			"reason": "Long Sales Cycle",
			"description": "The sales process took too long, leading to loss of interest.",
		},
		{
			"reason": "No Decision-Maker",
			"description": "The prospect was not the decision-maker and could not proceed.",
		},
		{"reason": "Unresponsive Prospect", "description": "The prospect did not respond to follow-ups."},
		{"reason": "Poor Fit", "description": "The prospect was not a good fit for the product or service."},
		{"reason": "Other", "description": ""},
	]

	for reason in lost_reasons:
		if frappe.db.exists("CRM Lost Reason", reason["reason"]):
			continue

		doc = frappe.new_doc("CRM Lost Reason")
		doc.lost_reason = reason["reason"]
		doc.description = reason["description"]
		doc.insert()


# The quick filters each list page starts with. Also what "Reset to default" in
# Customize Quick Filters restores (xbr_crm.api.doc.get_default_quick_filters).
DEFAULT_QUICK_FILTERS = {
	"CRM Lead": ["lead_name", "email", "organization", "status", "source"],
	"CRM Deal": ["organization", "status", "probability", "email"],
	"Contact": ["status", "email_id", "phone"],
	"CRM Organization": ["organization_name", "no_of_employees", "territory", "industry"],
	"CRM Task": ["title", "priority", "assigned_to", "status", "due_date"],
	"CRM Call Log": ["telephony_medium", "type", "status", "from", "to"],
}


def add_default_quick_filters():
	quick_filters = DEFAULT_QUICK_FILTERS

	for quick_filter in quick_filters:
		if frappe.db.exists("CRM Global Settings", {"dt": quick_filter}):
			continue

		doc = frappe.new_doc("CRM Global Settings")
		doc.dt = quick_filter
		doc.json = json.dumps(quick_filters[quick_filter])
		doc.insert()


def add_standard_dropdown_items():
	"""Add any standard dropdown items the site does not already have.

	Additive on purpose. This used to bail out whenever *any* row existed, which
	froze the list at whatever the hook contained on the day the site was first
	installed — a site seeded before an entry was added to
	`standard_dropdown_items` never received it. That is unrecoverable for the
	"settings" entry in particular, because the only UI for editing this list
	lives behind the Settings menu item itself.

	Matching is by `name1`, so re-running is a no-op and any custom items or
	`hidden` flags the site has set are left alone. Repaired entries are appended,
	so they land at the end of the menu until reordered in Settings.

	Safe to re-run:
	    bench --site <site> execute xbr_crm.install.add_standard_dropdown_items
	"""
	crm_settings = frappe.get_single("FCRM Settings")
	existing = {row.name1 for row in (crm_settings.dropdown_items or [])}

	added = []
	for item in frappe.get_hooks("standard_dropdown_items"):
		name1 = item.get("name1")
		# A separator is decoration, not an action, and a site may legitimately
		# have several — only seed one when there is none at all.
		if name1 in existing:
			continue
		crm_settings.append("dropdown_items", item)
		existing.add(name1)
		added.append(name1)

	if added:
		# Renumber. Frappe derives idx for an appended row from the row count, so
		# on a table with gaps (a row removed outside the ORM) the new row can be
		# handed an idx that already exists, leaving the menu order undefined.
		for position, row in enumerate(crm_settings.dropdown_items, start=1):
			row.idx = position
		crm_settings.save()

	print(f"dropdown items added: {added or 'none (already complete)'}")
	return added


def add_default_scripts():
	from xbr_crm.fcrm.doctype.fcrm_settings.fcrm_settings import create_forecasting_script

	for doctype in ["CRM Lead", "CRM Deal"]:
		create_product_details_script(doctype)
	create_forecasting_script()


def add_assignment_rule_property_setters():
	"""Add a property setter to the Assignment Rule DocType for assign_condition and unassign_condition."""

	default_fields = {
		"doctype": "Property Setter",
		"doctype_or_field": "DocField",
		"doc_type": "Assignment Rule",
		"property_type": "Data",
		"is_system_generated": 1,
	}

	if not frappe.db.exists("Property Setter", {"name": "Assignment Rule-assign_condition-depends_on"}):
		frappe.get_doc(
			{
				**default_fields,
				"name": "Assignment Rule-assign_condition-depends_on",
				"field_name": "assign_condition",
				"property": "depends_on",
				"value": "eval: !doc.assign_condition_json",
			}
		).insert()
	else:
		frappe.db.set_value(
			"Property Setter",
			{"name": "Assignment Rule-assign_condition-depends_on"},
			"value",
			"eval: !doc.assign_condition_json",
		)
	if not frappe.db.exists("Property Setter", {"name": "Assignment Rule-unassign_condition-depends_on"}):
		frappe.get_doc(
			{
				**default_fields,
				"name": "Assignment Rule-unassign_condition-depends_on",
				"field_name": "unassign_condition",
				"property": "depends_on",
				"value": "eval: !doc.unassign_condition_json",
			}
		).insert()
	else:
		frappe.db.set_value(
			"Property Setter",
			{"name": "Assignment Rule-unassign_condition-depends_on"},
			"value",
			"eval: !doc.unassign_condition_json",
		)


def create_assignment_rule_custom_fields():
	if not frappe.get_meta("Assignment Rule").has_field("assign_condition_json"):
		click.secho("* Installing Custom Fields in Assignment Rule")

		create_custom_fields(
			{
				"Assignment Rule": [
					{
						"description": "Autogenerated field by CRM App",
						"fieldname": "assign_condition_json",
						"fieldtype": "Code",
						"label": "Assign Condition JSON",
						"insert_after": "assign_condition",
						"depends_on": "eval: doc.assign_condition_json",
					},
					{
						"description": "Autogenerated field by CRM App",
						"fieldname": "unassign_condition_json",
						"fieldtype": "Code",
						"label": "Unassign Condition JSON",
						"insert_after": "unassign_condition",
						"depends_on": "eval: doc.unassign_condition_json",
					},
				],
			}
		)

		frappe.clear_cache(doctype="Assignment Rule")


# ---------------------------------------------------------------------------
# Website inquiry capture (xbr_crm/api/web_lead.py)
# ---------------------------------------------------------------------------

# Fields the client website can send that CRM Lead/Deal have no home for. All
# optional: a form that omits any of them still creates a pipeline.
WEB_LEAD_CUSTOM_FIELDS = [
	("custom_city", "City", "Data"),
	("custom_highest_qualification", "Highest Qualification", "Data"),
	("custom_course_level", "Course Level", "Data"),
	("custom_preferred_state", "Preferred State", "Data"),
	("custom_start_timeline", "Start Timeline", "Data"),
	("custom_form_type", "Form Type", "Data"),
	("custom_page_url", "Page URL", "Data"),
	("custom_utm_source", "UTM Source", "Data"),
	("custom_utm_medium", "UTM Medium", "Data"),
	("custom_utm_campaign", "UTM Campaign", "Data"),
]


# The website inquiry API creates CRM Deals ("Pipeline"). The fields stay on CRM
# Lead as well: leads captured before the switch keep their answers.
WEB_INQUIRY_DOCTYPES = ("CRM Lead", "CRM Deal")


def add_web_lead_custom_fields():
	"""Install the website-inquiry fields on CRM Lead and CRM Deal.

	Follows the same `create_custom_fields` + after_migrate route as the Web Form
	and Email Account fields above; this app defines no `fixtures` hook and adding
	one for ten fields would introduce a second, parallel mechanism.

	`create_custom_fields` is itself idempotent, but the meta check keeps a no-op
	migrate from touching the doctype cache on every run.
	"""
	for doctype in WEB_INQUIRY_DOCTYPES:
		meta = frappe.get_meta(doctype)
		if all(meta.has_field(fieldname) for fieldname, _label, _ftype in WEB_LEAD_CUSTOM_FIELDS):
			continue

		click.secho(f"* Installing website inquiry Custom Fields in {doctype}")

		fields = []
		# Chain each field after the previous one so the order in the doctype matches
		# the order above rather than reverse-stacking at one insertion point.
		previous = "source"
		for fieldname, label, fieldtype in WEB_LEAD_CUSTOM_FIELDS:
			fields.append(
				{
					"fieldname": fieldname,
					"fieldtype": fieldtype,
					"label": label,
					"insert_after": previous,
					"description": "Captured from a website inquiry form",
				}
			)
			previous = fieldname

		create_custom_fields({doctype: fields})
		frappe.clear_cache(doctype=doctype)


# Where the new fields appear in the lead's right-hand panel.
WEB_LEAD_PANEL_SECTION = {
	"label": "Website Inquiry",
	"name": "website_inquiry_section",
	"opened": False,
	"columns": [
		{
			"name": "column_webinq",
			"fields": [fieldname for fieldname, _label, _ftype in WEB_LEAD_CUSTOM_FIELDS],
		}
	],
}


def add_web_lead_side_panel_section():
	"""Append the Website Inquiry section to the CRM Lead and CRM Deal side panels.

	The panel is a stored layout, not a reflection of the doctype, so a custom
	field is invisible in the UI until it is named here. `add_default_fields_layout`
	only seeds the layout when it does not already exist, which on a live site is
	never — hence a separate, append-only migration step.

	Idempotent and non-destructive: it bails if the section is already present and
	otherwise leaves every existing section untouched, so an operator's own
	reordering survives a migrate.
	"""
	for doctype in WEB_INQUIRY_DOCTYPES:
		name = f"{doctype}-Side Panel"
		if not frappe.db.exists("CRM Fields Layout", name):
			continue

		doc = frappe.get_doc("CRM Fields Layout", name)
		try:
			layout = json.loads(doc.layout or "[]")
		except ValueError:
			continue
		if not isinstance(layout, list):
			continue

		if any(section.get("name") == WEB_LEAD_PANEL_SECTION["name"] for section in layout):
			continue

		click.secho(f"* Adding Website Inquiry section to the {doctype} side panel")
		layout.append(dict(WEB_LEAD_PANEL_SECTION))
		doc.layout = json.dumps(layout)
		doc.save(ignore_permissions=True)


# ---------------------------------------------------------------------------
# How a lead got here (xbr_crm/api/lead_origin.py)
# ---------------------------------------------------------------------------

# Deliberately separate from `source`. `source` is a BUSINESS field — the sales
# team owns it, edits it, and uses it for attribution ("Referral", "Exhibition").
# This is a SYSTEM field: which door the record actually came through. They are
# not the same question, and a lead can honestly be source="Referral" while
# having arrived through the website form.
LEAD_ORIGIN_FIELD = {
	"fieldname": "custom_created_via",
	"fieldtype": "Select",
	"label": "Created Via",
	# Blank first: leads that predate this field have no honest answer, and
	# guessing one retroactively would be worse than leaving it empty.
	"options": "\nManual\nWebsite\nEmail\nWhatsApp\nAPI\nImport",
	"insert_after": "source",
	"read_only": 1,
	"in_standard_filter": 1,
	"description": "How this record was created. Set automatically; not the same as Source.",
}


def add_lead_origin_field():
	"""Install `custom_created_via` on CRM Lead and CRM Deal.

	Runs after every migrate, so a site that already has the field also picks up
	any choice added since (WhatsApp).
	"""
	for dt in ("CRM Lead", "CRM Deal"):
		name = frappe.db.get_value("Custom Field", {"dt": dt, "fieldname": "custom_created_via"})
		if name and frappe.db.get_value("Custom Field", name, "options") != LEAD_ORIGIN_FIELD["options"]:
			frappe.db.set_value("Custom Field", name, "options", LEAD_ORIGIN_FIELD["options"])
			frappe.clear_cache(doctype=dt)

	targets = [
		dt for dt in ("CRM Lead", "CRM Deal") if not frappe.get_meta(dt).has_field("custom_created_via")
	]
	if not targets:
		return

	click.secho("* Installing Created Via Custom Field")
	create_custom_fields({dt: [dict(LEAD_ORIGIN_FIELD)] for dt in targets})
	for dt in targets:
		frappe.clear_cache(doctype=dt)


def add_lead_origin_to_side_panel():
	"""Show Created Via on the lead and pipeline side panels.

	Placed in the first section that lists fields rather than given a section of
	its own: it is one read-only word, and a whole collapsible panel for it would
	be louder than the fact deserves. On a pipeline it sits under the owner, since
	that is where someone triaging an Email vs Website inquiry looks.
	"""
	for name, after in (("CRM Lead-Side Panel", None), ("CRM Deal-Side Panel", "deal_owner")):
		_add_origin_to_layout(name, after)


def _add_origin_to_layout(name: str, after: str | None):
	if not frappe.db.exists("CRM Fields Layout", name):
		return

	doc = frappe.get_doc("CRM Fields Layout", name)
	try:
		layout = json.loads(doc.layout or "[]")
	except ValueError:
		return
	if not isinstance(layout, list) or not layout:
		return

	# Already placed anywhere in the layout? Leave it alone — an operator may have
	# moved it on purpose.
	for section in layout:
		for column in section.get("columns") or []:
			if "custom_created_via" in (column.get("fields") or []):
				return

	# The pipeline panel opens with Contacts, a custom-rendered section with no
	# field list, so take the first column that actually lists fields.
	fields = next(
		(
			column["fields"]
			for section in layout
			for column in section.get("columns") or []
			if column.get("fields")
		),
		None,
	)
	if fields is None:
		return

	click.secho(f"* Adding Created Via to {name}")
	position = fields.index(after) + 1 if after in fields else len(fields)
	fields.insert(position, "custom_created_via")
	doc.layout = json.dumps(layout)
	doc.save(ignore_permissions=True)

# ---------------------------------------------------------------------------
# Website contact form emails (xbr_crm/api/contact_form.py)
# ---------------------------------------------------------------------------


def _contact_form_fields():
	from xbr_crm.api.contact_form import CURRENT_SOFTWARE, USER_COUNTS

	description = "From the website contact form"
	return [
		{
			"fieldname": "custom_services",
			"fieldtype": "Table MultiSelect",
			"label": "Services",
			"options": "CRM Deal Service",
			"insert_after": "custom_form_type",
			"description": description,
		},
		{
			"fieldname": "custom_current_software",
			"fieldtype": "Select",
			"label": "Current Software",
			"options": "\n" + "\n".join(CURRENT_SOFTWARE),
			"insert_after": "custom_services",
			"description": description,
		},
		{
			"fieldname": "custom_user_count",
			"fieldtype": "Select",
			"label": "Number of Users",
			"options": "\n" + "\n".join(USER_COUNTS),
			"insert_after": "custom_current_software",
			"description": description,
		},
	]


# Shown first in the side panel's Website Inquiry section, before the
# web-lead fields (custom_start_timeline there holds "When to start?").
CONTACT_FORM_PANEL_FIELDS = ["custom_services", "custom_current_software", "custom_user_count"]


def add_contact_form_fields():
	"""Install the contact form fields on CRM Deal, seed the form's services and
	industries, and show the fields on the pipeline side panel. Safe to re-run:
	existing fields get the current options; nothing a person set is removed."""
	from xbr_crm.api.contact_form import INDUSTRIES, SERVICES

	fields = _contact_form_fields()
	meta = frappe.get_meta("CRM Deal")
	missing = [f for f in fields if not meta.has_field(f["fieldname"])]
	for f in fields:
		name = frappe.db.get_value("Custom Field", {"dt": "CRM Deal", "fieldname": f["fieldname"]})
		if name and f["fieldtype"] == "Select" and frappe.db.get_value("Custom Field", name, "options") != f["options"]:
			frappe.db.set_value("Custom Field", name, "options", f["options"])
			frappe.clear_cache(doctype="CRM Deal")
	if missing:
		click.secho("* Installing contact form Custom Fields in CRM Deal")
		create_custom_fields({"CRM Deal": missing})
		frappe.clear_cache(doctype="CRM Deal")

	for service in SERVICES:
		if not frappe.db.exists("CRM Service", service):
			frappe.get_doc({"doctype": "CRM Service", "service_name": service}).insert(ignore_permissions=True)
	for industry in INDUSTRIES:
		if not frappe.db.exists("CRM Industry", industry):
			frappe.get_doc({"doctype": "CRM Industry", "industry": industry}).insert(ignore_permissions=True)

	_add_contact_form_fields_to_panel()


def _add_contact_form_fields_to_panel():
	name = "CRM Deal-Side Panel"
	if not frappe.db.exists("CRM Fields Layout", name):
		return
	doc = frappe.get_doc("CRM Fields Layout", name)
	try:
		layout = json.loads(doc.layout or "[]")
	except ValueError:
		return
	if not isinstance(layout, list):
		return

	present = {
		field for section in layout for column in section.get("columns") or [] for field in column.get("fields") or []
	}
	missing = [f for f in CONTACT_FORM_PANEL_FIELDS if f not in present]
	if not missing:
		return

	section = next((s for s in layout if s.get("name") == WEB_LEAD_PANEL_SECTION["name"]), None)
	if section is None:
		section = {**WEB_LEAD_PANEL_SECTION, "columns": [{"name": "column_webinq", "fields": []}]}
		layout.append(section)
	column = (section.get("columns") or [None])[0]
	if column is None:
		column = {"name": "column_webinq", "fields": []}
		section["columns"] = [column]
	column["fields"] = missing + list(column.get("fields") or [])

	click.secho("* Adding contact form fields to the CRM Deal side panel")
	doc.layout = json.dumps(layout)
	doc.save(ignore_permissions=True)
