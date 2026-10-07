import frappe

OLD = "CRM-DEAL-.YYYY.-"
NEW = "PIPE-.YYYY.-"


def execute():
	"""Name new deals PIPE-YYYY-##### so record IDs no longer read "DEAL".

	Deals are shown to users as "Pipeline". The doctype now defaults to the new
	series, but sites carry Property Setters (written by Document Naming
	Settings) that pin the old one, and those win over the doctype. Only setters
	still holding the old default are changed, so a series someone chose on
	purpose is left alone. Existing records keep their IDs.
	"""
	for prop in ("options", "default"):
		frappe.db.set_value(
			"Property Setter",
			{
				"doc_type": "CRM Deal",
				"field_name": "naming_series",
				"property": prop,
				"value": OLD,
			},
			"value",
			NEW,
		)
	frappe.clear_cache(doctype="CRM Deal")
