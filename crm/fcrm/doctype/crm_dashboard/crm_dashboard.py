# Copyright (c) 2025, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class CRMDashboard(Document):
	pass


def default_manager_dashboard_layout():
	"""
	Returns the default layout for the CRM Manager Dashboard.
	"""
	# Rows are sized to fill all 20 columns exactly. The previous default put
	# five KPI cards on the first row and left the remaining two stranded beside
	# a 12-column spacer, which is what produced the orphaned pair on the
	# dashboard. Three primary metrics now lead, four secondary averages
	# follow, and the spacer is gone.
	return '[{"name":"total_leads","type":"number_chart","tooltip":"Total number of leads","layout":{"x":0,"y":0,"w":7,"h":3,"i":"total_leads"}},{"name":"ongoing_deals","type":"number_chart","tooltip":"Total number of ongoing deals","layout":{"x":7,"y":0,"w":7,"h":3,"i":"ongoing_deals"}},{"name":"won_deals","type":"number_chart","tooltip":"Total number of won deals","layout":{"x":14,"y":0,"w":6,"h":3,"i":"won_deals"}},{"name":"average_won_deal_value","type":"number_chart","tooltip":"Average value of won deals","layout":{"x":0,"y":3,"w":5,"h":3,"i":"average_won_deal_value"}},{"name":"average_deal_value","type":"number_chart","tooltip":"Average deal value of ongoing and won deals","layout":{"x":5,"y":3,"w":5,"h":3,"i":"average_deal_value"}},{"name":"average_time_to_close_a_lead","type":"number_chart","tooltip":"Average time taken to close a lead","layout":{"x":10,"y":3,"w":5,"h":3,"i":"average_time_to_close_a_lead"}},{"name":"average_time_to_close_a_deal","type":"number_chart","layout":{"x":15,"y":3,"w":5,"h":3,"i":"average_time_to_close_a_deal"}},{"name":"sales_trend","type":"axis_chart","layout":{"x":0,"y":6,"w":10,"h":9,"i":"sales_trend"}},{"name":"forecasted_revenue","type":"axis_chart","layout":{"x":10,"y":6,"w":10,"h":9,"i":"forecasted_revenue"}},{"name":"funnel_conversion","type":"axis_chart","layout":{"x":0,"y":15,"w":10,"h":9,"i":"funnel_conversion"}},{"name":"deals_by_stage_donut","type":"donut_chart","layout":{"x":10,"y":15,"w":10,"h":9,"i":"deals_by_stage_donut"}},{"name":"leads_by_source","type":"donut_chart","layout":{"x":0,"y":24,"w":10,"h":9,"i":"leads_by_source"}},{"name":"deals_by_source","type":"donut_chart","layout":{"x":10,"y":24,"w":10,"h":9,"i":"deals_by_source"}},{"name":"deals_by_territory","type":"axis_chart","layout":{"x":0,"y":33,"w":10,"h":9,"i":"deals_by_territory"}},{"name":"deals_by_salesperson","type":"axis_chart","layout":{"x":10,"y":33,"w":10,"h":9,"i":"deals_by_salesperson"}},{"name":"lost_deal_reasons","type":"axis_chart","layout":{"x":0,"y":42,"w":20,"h":9,"i":"lost_deal_reasons"}}]'


def create_default_manager_dashboard(force=False):
	"""
	Creates the default CRM Manager Dashboard if it does not exist.
	"""
	if not frappe.db.exists("CRM Dashboard", "Manager Dashboard"):
		doc = frappe.new_doc("CRM Dashboard")
		doc.title = "Manager Dashboard"
		doc.layout = default_manager_dashboard_layout()
		doc.insert(ignore_permissions=True)
	else:
		doc = frappe.get_doc("CRM Dashboard", "Manager Dashboard")
		if force:
			doc.layout = default_manager_dashboard_layout()
			doc.save(ignore_permissions=True)
	return doc.layout
