import frappe

from xbr_crm.ai.client import DEFAULT_BASE_URL, DEFAULT_MODEL, DEFAULT_TRANSCRIPTION_MODEL


def execute():
	"""AI assistant settings with their defaults (FCRM Settings → AI Assistant).

	New fields on a single doctype do not get their defaults on an existing site,
	so they are set here. The assistant itself stays off.
	"""
	defaults = {
		"ai_min_confidence": 70,
		"ai_base_url": DEFAULT_BASE_URL,
		"ai_model": DEFAULT_MODEL,
		"ai_transcription_model": DEFAULT_TRANSCRIPTION_MODEL,
	}
	for field, value in defaults.items():
		if not frappe.db.get_single_value("FCRM Settings", field):
			frappe.db.set_single_value("FCRM Settings", field, value)
