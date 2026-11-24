# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""The unified inbox: every pipeline's email and WhatsApp conversation in one
list, newest first, with the thread and a reply box beside it.

A thread is one pipeline. It "needs a reply" when its latest message came from
the customer, whatever the channel. Only pipelines the user may read are listed
(frappe.get_list applies the tenancy and sales-hierarchy rules).
"""

import html
import re

import frappe
from frappe import _
from frappe.utils import get_datetime

PAGE_LENGTH = 50
SNIPPET_CHARS = 160


def _whatsapp_installed() -> bool:
	return bool(frappe.db.exists("DocType", "WhatsApp Message"))


def _snippet(value: str | None) -> str:
	text = re.sub(r"<(br|/p|/div)\s*/?>", " ", value or "", flags=re.I)
	text = html.unescape(re.sub(r"<[^>]+>", "", text))
	return re.sub(r"\s+", " ", text).strip()[:SNIPPET_CHARS]


def _visible_deals(mine: bool) -> dict:
	filters = {"deal_owner": frappe.session.user} if mine else {}
	rows = frappe.get_list(
		"CRM Deal",
		filters=filters,
		fields=[
			"name",
			"organization",
			"lead_name",
			"first_name",
			"last_name",
			"email",
			"mobile_no",
			"status",
			"deal_owner",
			"ai_suggested_status",
		],
		limit_page_length=0,
	)
	return {r.name: r for r in rows}


def _person(deal) -> str:
	return deal.lead_name or " ".join(filter(None, [deal.first_name, deal.last_name]))


def _title(deal) -> str:
	"""What a thread is called: the company, else the person, else the ID.
	Pipelines from an inquiry email often have only a first and last name."""
	return deal.organization or _person(deal) or deal.name


def _messages(deal_names: list[str], full: bool = False) -> list[dict]:
	"""Emails and WhatsApp messages on these pipelines, unsorted."""
	if not deal_names:
		return []
	content = "content" if full else "left(content, 800) as content"
	out = []
	for c in frappe.db.sql(
		f"""
		select name, reference_name, sent_or_received, sender, sender_full_name, recipients,
			subject, {content}, seen, coalesce(communication_date, creation) as at
		from `tabCommunication`
		where reference_doctype = 'CRM Deal' and communication_type = 'Communication'
			and reference_name in %(deals)s
		""",
		{"deals": deal_names},
		as_dict=True,
	):
		inbound = c.sent_or_received == "Received"
		out.append(
			{
				"name": c.name,
				"deal": c.reference_name,
				"channel": "email",
				"inbound": inbound,
				"from_name": c.sender_full_name or c.sender,
				"from": c.sender,
				"to": c.recipients,
				"subject": c.subject,
				"content": c.content,
				"unread": inbound and not c.seen,
				"at": c.at,
				"attachments": [],
			}
		)
	if _whatsapp_installed():
		message = "message" if full else "left(message, 800) as message"
		for w in frappe.db.sql(
			f"""
			select name, reference_name, type, profile_name, `from`, `to`, {message}, attach,
				content_type, creation as at
			from `tabWhatsApp Message`
			where reference_doctype = 'CRM Deal' and reference_name in %(deals)s
			""",
			{"deals": deal_names},
			as_dict=True,
		):
			inbound = w.type == "Incoming"
			attachments = []
			if w.attach and w.content_type != "text":
				attachments.append({"file_name": _file_name(w.attach), "file_url": w.attach})
			out.append(
				{
					"name": w.name,
					"deal": w.reference_name,
					"channel": "whatsapp",
					"inbound": inbound,
					"from_name": w.profile_name or w["from"],
					"from": w["from"],
					"to": w["to"],
					"subject": "",
					# A file sent without text stores its URL or name as the message.
					"content": ""
					if attachments and w.message in (w.attach, attachments[0]["file_name"])
					else w.message,
					"unread": False,
					"at": w.at,
					"attachments": attachments,
				}
			)
	if full:
		_add_email_attachments([m for m in out if m["channel"] == "email"])
	return out


def _file_name(url: str) -> str:
	return url.split("?")[0].rstrip("/").rsplit("/", 1)[-1]


def _add_email_attachments(emails: list[dict]) -> None:
	"""Files sent with or received on each email: Frappe attaches them to the
	Communication."""
	if not emails:
		return
	by_name = {m["name"]: m for m in emails}
	for f in frappe.get_all(
		"File",
		filters={"attached_to_doctype": "Communication", "attached_to_name": ["in", list(by_name)]},
		fields=["attached_to_name", "file_name", "file_url"],
		order_by="creation asc",
	):
		by_name[f.attached_to_name]["attachments"].append(
			{"file_name": f.file_name or _file_name(f.file_url or ""), "file_url": f.file_url}
		)


def _threads(mine: bool) -> list[dict]:
	deals = _visible_deals(mine)
	threads = {}
	for m in _messages(list(deals)):
		t = threads.setdefault(m["deal"], {"messages": 0, "unread": 0, "channels": set(), "last": None})
		t["messages"] += 1
		t["unread"] += 1 if m["unread"] else 0
		t["channels"].add(m["channel"])
		if not t["last"] or get_datetime(m["at"]) > get_datetime(t["last"]["at"]):
			t["last"] = m

	out = []
	for name, t in threads.items():
		deal, last = deals[name], t["last"]
		out.append(
			{
				"deal": name,
				"title": _title(deal),
				"contact": _person(deal),
				"status": deal.status,
				"owner": deal.deal_owner,
				"ai_suggested_status": deal.ai_suggested_status,
				"channels": sorted(t["channels"]),
				"messages": t["messages"],
				"unread": t["unread"],
				"needs_reply": last["inbound"],
				"last_at": last["at"],
				"last_channel": last["channel"],
				"last_inbound": last["inbound"],
				"subject": last["subject"],
				"snippet": _snippet(last["content"])
				or ", ".join(a["file_name"] for a in last["attachments"]),
			}
		)
	out.sort(key=lambda t: get_datetime(t["last_at"]), reverse=True)
	return out


@frappe.whitelist()
def get_threads(
	search: str | None = None,
	channel: str | None = None,
	needs_reply: int = 0,
	mine: int = 0,
	start: int = 0,
	page_length: int = PAGE_LENGTH,
	status: str | None = None,
) -> dict:
	threads = _threads(bool(int(mine or 0)))
	if channel in ("email", "whatsapp"):
		threads = [t for t in threads if channel in t["channels"]]
	if status:
		threads = [t for t in threads if t["status"] == status]
	if int(needs_reply or 0):
		threads = [t for t in threads if t["needs_reply"]]
	query = (search or "").strip().lower()
	if query:
		threads = [
			t
			for t in threads
			if any(query in (t.get(k) or "").lower() for k in ("title", "contact", "subject", "snippet", "deal"))
		]
	start, page_length = int(start or 0), int(page_length or PAGE_LENGTH)
	return {"threads": threads[start : start + page_length], "total": len(threads)}


@frappe.whitelist()
def get_thread(deal: str) -> dict:
	"""One pipeline's whole conversation, oldest first. Opening it marks its
	emails as read."""
	if not frappe.has_permission("CRM Deal", "read", deal):
		frappe.throw(_("Not permitted"), frappe.PermissionError)
	doc = frappe.db.get_value(
		"CRM Deal",
		deal,
		[
			"name",
			"organization",
			"lead_name",
			"first_name",
			"last_name",
			"email",
			"mobile_no",
			"status",
			"deal_owner",
			"ai_suggested_status",
			"ai_suggestion_reason",
			"ai_suggestion_confidence",
			"ai_summary",
		],
		as_dict=True,
	)
	doc.title = _title(doc)
	doc.lead_name = _person(doc)
	messages = sorted(_messages([deal], full=True), key=lambda m: get_datetime(m["at"]))
	unread = [m["name"] for m in messages if m["unread"]]
	if unread:
		frappe.db.set_value("Communication", {"name": ["in", unread]}, "seen", 1, update_modified=False)
	return {"deal": doc, "messages": messages}


@frappe.whitelist()
def get_needs_reply_count() -> int:
	"""How many of my visible conversations wait on us; the sidebar badge."""
	return sum(1 for t in _threads(False) if t["needs_reply"])
