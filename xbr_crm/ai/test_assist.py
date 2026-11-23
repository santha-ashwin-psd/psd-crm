# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""AI reply drafts and call transcripts. The model is always a stub here."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from xbr_crm.ai import drafts, transcription
from xbr_crm.ai.client import AIUnavailable


def make_deal(email="assist@example.com"):
	deal = frappe.new_doc("CRM Deal")
	deal.first_name = "Asha"
	deal.last_name = "Iyer"
	deal.lead_name = "Asha Iyer"
	deal.email = email
	deal.status = frappe.get_all("CRM Deal Status", pluck="name", order_by="position asc", limit=1)[0]
	deal.flags.from_inquiry = True
	deal.insert(ignore_permissions=True)
	return deal


def add_email(deal, content, received=True):
	frappe.get_doc(
		{
			"doctype": "Communication",
			"communication_type": "Communication",
			"communication_medium": "Email",
			"sent_or_received": "Received" if received else "Sent",
			"sender": deal.email if received else "Administrator",
			"subject": "Pricing",
			"content": content,
			"reference_doctype": "CRM Deal",
			"reference_name": deal.name,
		}
	).insert(ignore_permissions=True)


class AssistCase(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", {"ai_enabled": 1, "ai_include_existing": 0})
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		key = patch("xbr_crm.ai.pipeline.api_key", return_value="test-key")
		key.start()
		self.addCleanup(key.stop)
		# Emails added in a test must not trigger stage reviews here.
		enqueue = patch("frappe.enqueue")
		enqueue.start()
		self.addCleanup(enqueue.stop)

	def tearDown(self):
		frappe.db.rollback()
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")


class TestDrafts(AssistCase):
	def test_draft_reads_the_conversation_and_the_notes(self):
		deal = make_deal()
		add_email(deal, "Can you send pricing for 20 users?")
		with patch("xbr_crm.ai.drafts.chat_json", return_value={"body": "Hi Asha,\n\nHere it is."}) as model:
			result = drafts.draft_reply(deal.name, "email", notes="mention 3-year plan")
		prompt = model.call_args.args[1]
		self.assertIn("Can you send pricing for 20 users?", prompt)
		self.assertIn("mention 3-year plan", prompt)
		self.assertEqual(result["text"], "Hi Asha,\n\nHere it is.")
		self.assertEqual(result["html"], "<p>Hi Asha,</p><p>Here it is.</p>")

	def test_whatsapp_draft_asks_for_a_short_message(self):
		deal = make_deal("wa.assist@example.com")
		with patch("xbr_crm.ai.drafts.chat_json", return_value={"body": "Hi!"}) as model:
			drafts.draft_reply(deal.name, "whatsapp")
		self.assertIn("WhatsApp message", model.call_args.args[0])

	def test_draft_html_is_escaped(self):
		self.assertEqual(drafts.to_html("<b>x</b>\nline"), "<p>&lt;b&gt;x&lt;/b&gt;<br>line</p>")

	def test_ai_off_refuses(self):
		frappe.db.set_single_value("FCRM Settings", "ai_enabled", 0)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		deal = make_deal("off.assist@example.com")
		with self.assertRaises(frappe.ValidationError):
			drafts.draft_reply(deal.name)

	def test_unreachable_model_is_a_clear_error(self):
		deal = make_deal("down.assist@example.com")
		with patch("xbr_crm.ai.drafts.chat_json", side_effect=AIUnavailable("busy")):
			with self.assertRaises(frappe.ValidationError):
				drafts.draft_reply(deal.name)


class TestTranscription(AssistCase):
	def make_call(self, deal):
		return frappe.get_doc(
			{
				"doctype": "CRM Call Log",
				"id": frappe.generate_hash(length=10),
				"telephony_medium": "Manual",
				"type": "Outgoing",
				"status": "Completed",
				"caller": "Administrator",
				"from": "+910000000001",
				"to": "+910000000002",
				"reference_doctype": "CRM Deal",
				"reference_docname": deal.name,
			}
		).insert(ignore_permissions=True)

	def attach(self, log, name="call.mp3"):
		frappe.get_doc(
			{
				"doctype": "File",
				"file_name": name,
				"attached_to_doctype": "CRM Call Log",
				"attached_to_name": log.name,
				"is_private": 1,
				"content": b"fake-audio",
			}
		).save(ignore_permissions=True)

	def test_uploaded_recording_is_transcribed_and_summarised(self):
		log = self.make_call(make_deal("tx@example.com"))
		self.attach(log)
		with (
			patch("xbr_crm.ai.transcription.transcribe_audio", return_value="We agreed on a pilot.") as stt,
			patch(
				"xbr_crm.ai.transcription.chat_json",
				return_value={"summary": "Pilot agreed.", "next_steps": ["Send proposal"]},
			) as model,
		):
			result = transcription.transcribe_call(log.name)
		self.assertEqual(stt.call_args.args[0], b"fake-audio")
		self.assertIn("Customer: Asha Iyer", model.call_args.args[1])
		self.assertEqual(result["call_summary"], "Pilot agreed.\n\nNext steps:\n- Send proposal")
		self.assertEqual(frappe.db.get_value("CRM Call Log", log.name, "transcript"), "We agreed on a pilot.")

	def test_no_recording_asks_for_one(self):
		log = self.make_call(make_deal("norec@example.com"))
		with self.assertRaises(frappe.ValidationError):
			transcription.transcribe_call(log.name)

	def test_only_audio_files_count_as_recordings(self):
		log = self.make_call(make_deal("pdf@example.com"))
		self.attach(log, "notes.txt")
		self.assertIsNone(transcription.attached_audio(log.name))
		self.attach(log, "call.m4a")
		self.assertEqual(transcription.attached_audio(log.name).file_name, "call.m4a")

	def test_call_log_plays_the_uploaded_recording(self):
		from xbr_crm.fcrm.doctype.crm_call_log.crm_call_log import get_call_log

		log = self.make_call(make_deal("play@example.com"))
		self.attach(log)
		self.assertTrue(get_call_log(log.name)["recording_url_path"].endswith("call.mp3"))
