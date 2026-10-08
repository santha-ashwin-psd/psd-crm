# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Default Email Templates for reminder emails.

They are created once (install / migrate) and can then be edited in the CRM
under Settings → Email Templates; an edit is never overwritten. If a template
is deleted or disabled, these defaults are used directly.

Available variables: recipient_name, title, reminder_type, when, timezone,
time_before, location, meeting_link, description, priority, item_url,
related_label, related_url.
"""

import frappe

_STYLE_LABEL = "color:#6b7280;padding:4px 16px 4px 0;vertical-align:top;white-space:nowrap"
_STYLE_VALUE = "color:#111827;padding:4px 0;vertical-align:top"

_BODY = """<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14px;line-height:1.5;color:#111827;max-width:560px">
<p style="margin:0 0 4px">Hi {{ recipient_name }},</p>
<p style="margin:0 0 16px;color:#374151">This is a reminder — <strong>{{ time_before | lower }}</strong>.</p>
<h2 style="font-size:18px;font-weight:600;margin:0 0 12px">{{ title }}</h2>
<table style="border-collapse:collapse;font-size:14px;margin:0 0 16px">
<tr><td style="@LABEL@">Type</td><td style="@VALUE@">{{ reminder_type }}</td></tr>
<tr><td style="@LABEL@">@WHEN@</td><td style="@VALUE@">{{ when }}</td></tr>
@ROWS@
{% if related_label %}<tr><td style="@LABEL@">Related to</td><td style="@VALUE@"><a href="{{ related_url }}" style="color:#2563eb">{{ related_label }}</a></td></tr>{% endif %}
</table>
{% if description %}<div style="margin:0 0 16px;padding:12px;background:#f9fafb;border-radius:6px;color:#374151">{{ description }}</div>{% endif %}
<p style="margin:0 0 24px"><a href="{{ item_url }}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:8px 14px;border-radius:6px;font-weight:500">@BUTTON@</a></p>
<p style="margin:0;color:#9ca3af;font-size:12px">Times are shown in {{ timezone }}. You are receiving this because of a reminder set in the CRM.</p>
</div>""".replace("@LABEL@", _STYLE_LABEL).replace("@VALUE@", _STYLE_VALUE)

_EVENT_ROWS = """{% if location %}<tr><td style="@LABEL@">Location</td><td style="@VALUE@">{{ location }}</td></tr>{% endif %}
{% if meeting_link %}<tr><td style="@LABEL@">Meeting link</td><td style="@VALUE@"><a href="{{ meeting_link }}" style="color:#2563eb">{{ meeting_link }}</a></td></tr>{% endif %}""".replace(
	"@LABEL@", _STYLE_LABEL
).replace("@VALUE@", _STYLE_VALUE)

_TASK_ROWS = """{% if priority %}<tr><td style="@LABEL@">Priority</td><td style="@VALUE@">{{ priority }}</td></tr>{% endif %}""".replace(
	"@LABEL@", _STYLE_LABEL
).replace("@VALUE@", _STYLE_VALUE)

DEFAULT_TEMPLATES = {
	"Event Reminder": {
		"reference_doctype": "Event",
		"subject": "Reminder: {{ title }} — {{ when }}",
		"response_html": _BODY.replace("@WHEN@", "When")
		.replace("@ROWS@", _EVENT_ROWS)
		.replace("@BUTTON@", "Open in CRM"),
	},
	"Task Reminder": {
		"reference_doctype": "CRM Task",
		"subject": "Task reminder: {{ title }} — due {{ when }}",
		"response_html": _BODY.replace("@WHEN@", "Due")
		.replace("@ROWS@", _TASK_ROWS)
		.replace("@BUTTON@", "Open task"),
	},
}


def create_default_templates():
	"""Create the reminder Email Templates that don't exist yet. Never overwrites."""
	for name, values in DEFAULT_TEMPLATES.items():
		if frappe.db.exists("Email Template", name):
			continue
		doc = frappe.new_doc("Email Template")
		doc.name = name
		doc.subject = values["subject"]
		doc.use_html = 1
		doc.response_html = values["response_html"]
		if doc.meta.has_field("enabled"):
			doc.enabled = 1
		if doc.meta.has_field("reference_doctype"):
			doc.reference_doctype = values["reference_doctype"]
		doc.insert(ignore_permissions=True)
