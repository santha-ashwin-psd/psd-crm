# Copyright (c) 2023, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _, generate_hash
from frappe.model.document import Document
from frappe.utils import add_to_date, cint, get_datetime, now_datetime

from xbr_crm.integrations.api import get_contact_by_phone_number
from xbr_crm.utils import seconds_to_duration

# A clock a little ahead of the server's still counts as "now".
FUTURE_SLACK_MINUTES = 5


class CRMCallLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.core.doctype.dynamic_link.dynamic_link import DynamicLink
		from frappe.types import DF

		caller: DF.Link | None
		duration: DF.Duration | None
		end_time: DF.Datetime | None
		id: DF.Data | None
		links: DF.Table[DynamicLink]
		medium: DF.Data | None
		note: DF.Link | None
		receiver: DF.Link | None
		recording_url: DF.SmallText | None
		reference_docname: DF.DynamicLink | None
		reference_doctype: DF.Link | None
		start_time: DF.Datetime | None
		status: DF.Literal[
			"Initiated",
			"Ringing",
			"In Progress",
			"Completed",
			"Failed",
			"Busy",
			"No Answer",
			"Queued",
			"Canceled",
		]
		telephony_medium: DF.Literal["", "Manual", "Twilio", "Exotel"]
		to: DF.Data
		type: DF.Literal["Incoming", "Outgoing"]
	# end: auto-generated types

	def before_insert(self):
		if not self.id:
			self.id = generate_hash(length=12)
		if not self.telephony_medium:
			self.telephony_medium = "Manual"
		self.set_logged_by()

	def validate(self):
		if self.telephony_medium == "Manual":
			self.set_call_time()

	def set_call_time(self):
		"""A call logged by hand happened at its "Call Date & Time" (start_time),
		which may be in the past: a call made yesterday and logged today. It
		can't be in the future. The end follows from the duration."""
		if not self.start_time:
			self.start_time = now_datetime()
		start = get_datetime(self.start_time)
		if start > add_to_date(now_datetime(), minutes=FUTURE_SLACK_MINUTES):
			frappe.throw(_("The call's date and time can't be in the future."))
		if self.duration and (self.is_new() or self.has_value_changed("start_time") or self.has_value_changed("duration")):
			self.end_time = add_to_date(start, seconds=cint(self.duration))

	def after_insert(self):
		self.date_by_call_time()

	def on_update(self):
		if not self.is_new() and self.has_value_changed("start_time"):
			self.date_by_call_time()

	def date_by_call_time(self):
		"""Date a manual log by when the call happened, not when it was typed in:
		the timeline, the Calls tab and the call list all order and show calls by
		`creation`, so a call logged a day late still lands on its own day."""
		if self.telephony_medium != "Manual" or not self.start_time:
			return
		start = get_datetime(self.start_time)
		if get_datetime(self.creation) != start:
			frappe.db.set_value("CRM Call Log", self.name, "creation", start, update_modified=False)
			self.creation = start

	def set_logged_by(self):
		"""A call logged by hand was made or taken by the person logging it:
		the caller of an outgoing call, the receiver of an incoming one. Calls
		from a telephony provider set these themselves."""
		if self.telephony_medium != "Manual" or frappe.session.user in ("Guest", "Administrator"):
			return
		if self.type == "Outgoing" and not self.caller:
			self.caller = frappe.session.user
		elif self.type == "Incoming" and not self.receiver:
			self.receiver = frappe.session.user

	@staticmethod
	def default_list_data():
		columns = [
			{
				"label": "Caller",
				"type": "Link",
				"key": "caller",
				"options": "User",
				"width": "9rem",
			},
			{
				"label": "Receiver",
				"type": "Link",
				"key": "receiver",
				"options": "User",
				"width": "9rem",
			},
			{
				"label": "Type",
				"type": "Select",
				"key": "type",
				"width": "9rem",
			},
			{
				"label": "Status",
				"type": "Select",
				"key": "status",
				"width": "9rem",
			},
			{
				"label": "Duration",
				"type": "Duration",
				"key": "duration",
				"width": "6rem",
			},
			{
				"label": "From (number)",
				"type": "Data",
				"key": "from",
				"width": "9rem",
			},
			{
				"label": "To (number)",
				"type": "Data",
				"key": "to",
				"width": "9rem",
			},
			# The reference has always been stored and shipped in `rows` below,
			# but there was no column for it — so a call logged from a lead
			# looked unconnected in this list, while the same link on a task
			# showed up because the Tasks view renders a chip for it.
			{
				"label": "Linked To",
				"type": "Dynamic Link",
				"key": "reference_docname",
				"options": "reference_doctype",
				"width": "10rem",
			},
			{
				"label": "Created On",
				"type": "Datetime",
				"key": "creation",
				"width": "8rem",
			},
		]
		rows = [
			"name",
			"caller",
			"receiver",
			"type",
			"status",
			"duration",
			"from",
			"to",
			"note",
			"recording_url",
			"reference_doctype",
			"reference_docname",
			"creation",
		]
		return {"columns": columns, "rows": rows}

	def parse_list_data(calls):
		return [parse_call_log(call) for call in calls] if calls else []

	def has_link(self, doctype, name):
		for link in self.links:
			if link.link_doctype == doctype and link.link_name == name:
				return True

	def link_with_reference_doc(self, reference_doctype, reference_name):
		if self.has_link(reference_doctype, reference_name):
			return

		self.append("links", {"link_doctype": reference_doctype, "link_name": reference_name})

	def as_dict(self, *args, **kwargs):
		d = super().as_dict(*args, **kwargs)
		if d.get("recording_url"):
			d["recording_url_path"] = (
				f"/api/method/xbr_crm.integrations.api.get_recording_url?call_log_name={d.get('name')}"
			)
		return d


def get_label_from_reference(call):
	"""Resolve the other party from the call's explicit reference.

	`get_contact_by_phone_number` matches on the number alone — a LIKE against
	Contact Phone, then CRM Lead, re-validated by `are_same_phone_number`, which
	needs both numbers to parse as valid. One mistyped digit and it returns
	nothing, so a manually logged call showed "Unknown" even though the log
	carried `reference_doctype` / `reference_docname` all along.

	Prefer that reference where it exists; fall back to the phone lookup for
	telephony-created logs, which have no reference.
	"""
	doctype = call.get("reference_doctype")
	docname = call.get("reference_docname")
	if not (doctype and docname):
		return None

	if doctype == "CRM Lead":
		lead = frappe.db.get_value("CRM Lead", docname, ["lead_name", "image"], as_dict=True)
		if lead:
			return {"full_name": lead.lead_name, "image": lead.image}
	elif doctype == "CRM Deal":
		# CRM Deal has no `image` field — its avatar comes from the linked
		# organization's logo, which this label does not need.
		deal = frappe.db.get_value("CRM Deal", docname, ["organization", "lead_name"], as_dict=True)
		if deal:
			return {"full_name": deal.organization or deal.lead_name, "image": None}

	return None


def parse_call_log(call):
	call["show_recording"] = False
	call["_duration"] = seconds_to_duration(call.get("duration"))
	if call.get("type") == "Incoming":
		call["activity_type"] = "incoming_call"
		contact = get_label_from_reference(call) or get_contact_by_phone_number(call.get("from"))
		receiver = (
			frappe.db.get_values("User", call.get("receiver"), ["full_name", "user_image"])[0]
			if call.get("receiver")
			else [None, None]
		)
		call["_caller"] = {
			"label": contact.get("full_name", "Unknown"),
			"image": contact.get("image"),
		}
		call["_receiver"] = {
			"label": receiver[0],
			"image": receiver[1],
		}
	elif call.get("type") == "Outgoing":
		call["activity_type"] = "outgoing_call"
		contact = get_label_from_reference(call) or get_contact_by_phone_number(call.get("to"))
		caller = (
			frappe.db.get_values("User", call.get("caller"), ["full_name", "user_image"])[0]
			if call.get("caller")
			else [None, None]
		)
		call["_caller"] = {
			"label": caller[0],
			"image": caller[1],
		}
		call["_receiver"] = {
			"label": contact.get("full_name", "Unknown"),
			"image": contact.get("image"),
		}

	return call


@frappe.whitelist()
def get_call_log(name: str):
	call = frappe.get_cached_doc(
		"CRM Call Log",
		name,
		fields=[
			"name",
			"caller",
			"receiver",
			"duration",
			"type",
			"status",
			"from",
			"to",
			"note",
			"recording_url",
			"recording_url_path",
			"reference_doctype",
			"reference_docname",
			"creation",
		],
	).as_dict()

	call = parse_call_log(call)

	# A call logged by hand has no telephony recording; an audio file uploaded to
	# it plays (and is transcribed) in its place.
	if not call.get("recording_url_path"):
		from xbr_crm.ai.transcription import attached_audio

		audio = attached_audio(name)
		if audio:
			call["recording_url_path"] = audio.file_url

	notes = []
	tasks = []

	if call.get("note"):
		note = frappe.get_cached_doc("FCRM Note", call.get("note")).as_dict()
		notes.append(note)

	if call.get("reference_doctype") and call.get("reference_docname"):
		if call.get("reference_doctype") == "CRM Lead":
			call["_lead"] = call.get("reference_docname")
		elif call.get("reference_doctype") == "CRM Deal":
			call["_deal"] = call.get("reference_docname")

	if call.get("links"):
		for link in call.get("links"):
			if link.get("link_doctype") == "CRM Task":
				task = frappe.get_cached_doc("CRM Task", link.get("link_name")).as_dict()
				tasks.append(task)
			elif link.get("link_doctype") == "FCRM Note":
				note = frappe.get_cached_doc("FCRM Note", link.get("link_name")).as_dict()
				notes.append(note)
			elif link.get("link_doctype") == "CRM Lead":
				call["_lead"] = link.get("link_name")
			elif link.get("link_doctype") == "CRM Deal":
				call["_deal"] = link.get("link_name")

	call["_tasks"] = tasks
	call["_notes"] = notes
	return call


@frappe.whitelist()
def create_lead_from_call_log(call_log: str | dict, lead_details: str | dict | None = None):
	from xbr_crm.utils.leads import throw_if_leads_disabled

	throw_if_leads_disabled()

	call_log_data = frappe.parse_json(call_log or {})

	if isinstance(call_log_data, str):
		call_log_name = call_log_data
	elif isinstance(call_log_data, dict):
		call_log_name = call_log_data.get("name")
	else:
		call_log_name = None

	if not call_log_name:
		frappe.throw(_("A valid call log is required."), frappe.ValidationError)

	call_doc = frappe.get_doc("CRM Call Log", call_log_name)

	if not call_doc.has_permission("write"):
		frappe.throw(_("You are not permitted to update this call log."), frappe.PermissionError)

	if not frappe.has_permission("CRM Lead", "create"):
		frappe.throw(_("You are not permitted to create leads."), frappe.PermissionError)

	lead_details_data = frappe.parse_json(lead_details or {})
	if lead_details_data and not isinstance(lead_details_data, dict):
		frappe.throw(_("Invalid lead details supplied."), frappe.ValidationError)

	lead = frappe.new_doc("CRM Lead")
	meta = frappe.get_meta("CRM Lead")
	valid_fieldnames = [df.fieldname for df in meta.fields]

	sanitized_details = {
		key: value for key, value in (lead_details_data or {}).items() if key in valid_fieldnames
	}

	if "lead_owner" in valid_fieldnames and not sanitized_details.get("lead_owner"):
		sanitized_details["lead_owner"] = frappe.session.user

	if "mobile_no" in valid_fieldnames and not sanitized_details.get("mobile_no"):
		sanitized_details["mobile_no"] = call_doc.get("from") or ""

	if "first_name" in valid_fieldnames and not sanitized_details.get("first_name"):
		reference_label = sanitized_details.get("mobile_no") or call_doc.name
		sanitized_details["first_name"] = _("Lead from call {0}").format(reference_label)

	# `organization` is a Link; a caller may still hand us a plain company name,
	# and link validation runs before any document hook could fix it.
	if sanitized_details.get("organization"):
		from xbr_crm.fcrm.doctype.crm_lead.crm_lead import resolve_organization

		sanitized_details["organization"] = resolve_organization(
			sanitized_details["organization"],
			{"website": sanitized_details.get("website")},
		)

	lead.update(sanitized_details)
	lead.insert()

	call_doc.link_with_reference_doc("CRM Lead", lead.name)
	call_doc.save()

	return lead.name
