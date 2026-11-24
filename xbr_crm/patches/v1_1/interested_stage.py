"""Add the "Interested" stage, where website contact form submissions start
(api/contact_form.FORM_STAGE).

Placed right after the board's first Open stage ("New" / "Interested Leads"),
which stays first so emails and WhatsApp still start there. Stages after it
move one place along; their order is unchanged. Runs once: a site that later
renames or removes the stage keeps its choice.
"""

import frappe

from xbr_crm.api.contact_form import FORM_STAGE
from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status


def execute():
	if not frappe.db.exists("DocType", "CRM Deal Status") or frappe.db.exists("CRM Deal Status", FORM_STAGE):
		return

	first = default_deal_status()
	after = frappe.db.get_value("CRM Deal Status", first, "position") if first else 0
	after = after or 0
	frappe.db.sql(
		"update `tabCRM Deal Status` set position = position + 1 where position > %s",
		(after,),
	)
	frappe.get_doc(
		{
			"doctype": "CRM Deal Status",
			"deal_status": FORM_STAGE,
			"type": "Open",
			"probability": 15,
			"color": "orange",
			"position": after + 1,
		}
	).insert(ignore_permissions=True)
