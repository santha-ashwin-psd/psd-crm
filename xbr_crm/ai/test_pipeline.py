# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""AI-managed pipeline stages. The model is always replaced by a stub here, so
these tests never reach the network."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from xbr_crm.ai import pipeline as ai
from xbr_crm.ai.client import AIUnavailable
from xbr_crm.api.test_email_inquiry import TestEmailInquiry


def answer(stage, confidence=90, is_inquiry=True, reason="Because.", summary="A customer."):
	return {"is_inquiry": is_inquiry, "stage": stage, "confidence": confidence, "reason": reason, "summary": summary}


def open_stages():
	return [s.name for s in ai.stages() if s.type not in ai.TERMINAL]


def stage_of_type(kind):
	return next(s.name for s in ai.stages() if s.type == kind)


class TestAIPipeline(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for field in ("auto_reopen_on_new_communication", "auto_mark_replied_on_response", "update_timestamp_on_new_communication"):
			frappe.db.set_single_value("FCRM Settings", field, 0)
		frappe.db.set_single_value(
			"FCRM Settings",
			{
				"ai_enabled": 1,
				"ai_enabled_on": add_to_date(now_datetime(), minutes=-5),
				"ai_include_existing": 0,
				"ai_min_confidence": 70,
			},
		)
		frappe.db.delete("CRM AI Rule", {"parent": "FCRM Settings"})
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		self.account = TestEmailInquiry._make_email_account(self)
		self.entry = ai.entry_stage()
		self.later = next(s for s in open_stages() if s != self.entry)
		key = patch("xbr_crm.ai.pipeline.api_key", return_value="test-key")
		key.start()
		self.addCleanup(key.stop)
		# Reviews run inline instead of on a worker.
		enqueue = patch("frappe.enqueue", side_effect=lambda method, **kw: ai.review_deal(kw["deal"]))
		enqueue.start()
		self.addCleanup(enqueue.stop)

	def tearDown(self):
		frappe.db.rollback()
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")

	def receive(self, sender, subject="Enquiry", content="Hello, we need a CRM."):
		return TestEmailInquiry.receive(self, sender, "Test Person", subject=subject, content=content)

	def deal_for(self, email):
		names = frappe.get_all("CRM Deal", filters={"email": email}, pluck="name")
		return frappe.get_doc("CRM Deal", names[0]) if names else None

	def decisions(self, deal, action=None):
		filters = {"deal": deal}
		if action:
			filters["action"] = action
		return frappe.get_all("CRM AI Decision", filters=filters, pluck="action", order_by="creation asc")

	# ------------------------------------------------------------ new pipelines

	def test_new_email_pipeline_starts_in_the_entry_stage_with_ai_pick_suggested(self):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("ai.first@example.com")
		deal = self.deal_for("ai.first@example.com")
		self.assertEqual(deal.status, self.entry)
		self.assertEqual(deal.ai_suggested_status, self.later)
		self.assertTrue(deal.ai_controlled)
		self.assertEqual(deal.ai_summary, "A customer.")
		self.assertEqual(self.decisions(deal.name), ["Suggested"])

	def test_junk_email_makes_no_pipeline(self):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.entry, 95, is_inquiry=False)):
			comm = self.receive("newsletter@example.com", "Our weekly deals")
		self.assertIsNone(self.deal_for("newsletter@example.com"))
		self.assertTrue(
			frappe.db.exists("CRM AI Decision", {"action": "Skipped", "reference_name": comm.name})
		)

	def test_unsure_junk_verdict_still_makes_a_pipeline(self):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.entry, 40, is_inquiry=False)):
			self.receive("maybe@example.com")
		self.assertIsNotNone(self.deal_for("maybe@example.com"))

	def test_new_pipeline_is_never_set_to_won_or_lost(self):
		won = stage_of_type("Won")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(won, 99)):
			self.receive("eager@example.com")
		deal = self.deal_for("eager@example.com")
		self.assertEqual(deal.status, self.entry)
		self.assertEqual(deal.ai_suggested_status, won)

	def test_low_confidence_leaves_the_first_stage(self):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later, 50)):
			self.receive("unsure@example.com")
		self.assertEqual(self.deal_for("unsure@example.com").status, self.entry)

	def test_unreachable_ai_creates_pipeline_and_suggests_later(self):
		with patch("xbr_crm.ai.pipeline.chat_json", side_effect=AIUnavailable("busy")):
			self.receive("later@example.com")
		deal = self.deal_for("later@example.com")
		self.assertEqual(deal.status, self.entry)
		self.assertTrue(deal.ai_review_pending)

		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			ai.sweep()
		deal.reload()
		self.assertEqual(deal.status, self.entry)
		self.assertEqual(deal.ai_suggested_status, self.later)
		self.assertFalse(deal.ai_review_pending)

	def test_ai_off_changes_nothing(self):
		frappe.db.set_single_value("FCRM Settings", "ai_enabled", 0)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		with patch("xbr_crm.ai.pipeline.chat_json") as model:
			self.receive("off@example.com")
		model.assert_not_called()
		deal = self.deal_for("off@example.com")
		self.assertEqual(deal.status, self.entry)
		self.assertFalse(deal.ai_controlled)

	# ------------------------------------------------------------ later messages

	def make_ai_pipeline(self, email):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.entry)):
			self.receive(email)
		return self.deal_for(email)

	def test_later_message_suggests_and_does_not_move(self):
		deal = self.make_ai_pipeline("thread@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later, reason="Asked for a quote.")) as model:
			self.receive("thread@example.com", "Re: Enquiry", "Please send the quotation.")
		deal.reload()
		self.assertEqual(deal.status, self.entry)
		self.assertEqual(deal.ai_suggested_status, self.later)
		self.assertEqual(deal.ai_suggestion_reason, "Asked for a quote.")
		# The whole conversation is read, not just the newest email.
		prompt = model.call_args.args[1]
		self.assertIn("Hello, we need a CRM.", prompt)
		self.assertIn("Please send the quotation.", prompt)

	def test_same_suggestion_is_logged_once(self):
		deal = self.make_ai_pipeline("repeat.ai@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("repeat.ai@example.com", "Re: 1", "Quote please")
			self.receive("repeat.ai@example.com", "Re: 2", "Still waiting for the quote")
		self.assertEqual(len(self.decisions(deal.name, "Suggested")), 1)

	def test_accepting_the_suggestion_is_recorded(self):
		deal = self.make_ai_pipeline("accept@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("accept@example.com", "Re", "Send the quote")
		deal.reload()
		deal.status = self.later
		deal.save()
		deal.reload()
		self.assertFalse(deal.ai_suggested_status)
		self.assertIn("Accepted", self.decisions(deal.name))

	def test_moving_elsewhere_settles_the_suggestion(self):
		deal = self.make_ai_pipeline("other@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("other@example.com", "Re", "Send the quote")
		deal.reload()
		elsewhere = next(s for s in open_stages() if s not in (self.entry, self.later))
		deal.status = elsewhere
		deal.save()
		deal.reload()
		self.assertFalse(deal.ai_suggested_status)
		self.assertNotIn("Accepted", self.decisions(deal.name))

	def test_dismiss(self):
		deal = self.make_ai_pipeline("dismiss@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("dismiss@example.com", "Re", "Send the quote")
		ai.dismiss_suggestion(deal.name)
		deal.reload()
		self.assertFalse(deal.ai_suggested_status)
		self.assertIn("Dismissed", self.decisions(deal.name))

	def test_current_stage_still_fitting_clears_an_old_suggestion(self):
		deal = self.make_ai_pipeline("fits@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("fits@example.com", "Re", "Quote?")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.entry)):
			self.receive("fits@example.com", "Re", "Actually, not yet.")
		deal.reload()
		self.assertFalse(deal.ai_suggested_status)

	# ------------------------------------------------------------ older pipelines

	def make_old_pipeline(self, email):
		with patch("xbr_crm.ai.pipeline.chat_json", side_effect=AssertionError("AI must not run")):
			frappe.db.set_single_value("FCRM Settings", "ai_enabled", 0)
			frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
			self.receive(email)
			frappe.db.set_single_value("FCRM Settings", "ai_enabled", 1)
			frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		deal = self.deal_for(email)
		frappe.db.set_value("CRM Deal", deal.name, "creation", add_to_date(now_datetime(), days=-30))
		return deal

	def test_older_pipeline_is_left_alone_by_default(self):
		deal = self.make_old_pipeline("old@example.com")
		with patch("xbr_crm.ai.pipeline.chat_json") as model:
			self.receive("old@example.com", "Re", "Any update?")
		model.assert_not_called()
		self.assertFalse(frappe.db.get_value("CRM Deal", deal.name, "ai_controlled"))

	def test_older_pipeline_only_gets_suggestions_when_included(self):
		deal = self.make_old_pipeline("old.in@example.com")
		frappe.db.set_single_value("FCRM Settings", "ai_include_existing", 1)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			ai.sweep()
		deal.reload()
		self.assertTrue(deal.ai_controlled)
		self.assertEqual(deal.status, self.entry)
		self.assertEqual(deal.ai_suggested_status, self.later)

	# ------------------------------------------------------------ rules and parsing

	def test_keyword_rule_decides_without_the_model(self):
		settings = frappe.get_doc("FCRM Settings")
		settings.append("ai_rules", {"enabled": 1, "keywords": "price list, quotation", "stage": self.later})
		settings.save()
		with patch("xbr_crm.ai.pipeline.chat_json") as model:
			self.receive("rule@example.com", "Quotation needed", "Can you share a quotation?")
		model.assert_not_called()
		deal = self.deal_for("rule@example.com")
		self.assertEqual(deal.status, self.entry)
		self.assertEqual(deal.ai_suggested_status, self.later)

	def test_rule_keywords_match_whole_words(self):
		settings = frappe.get_doc("FCRM Settings")
		settings.append("ai_rules", {"enabled": 1, "keywords": "quote", "stage": self.later})
		settings.save()
		self.assertIsNone(ai.match_rule("Please see the footnote"))
		self.assertIsNotNone(ai.match_rule("Please send a quote"))

	def test_quoted_reply_history_is_dropped(self):
		text = ai._text("Yes, go ahead.<br><br>On Mon, 1 Oct 2026, Sales wrote:<br>&gt; old text")
		self.assertEqual(text, "Yes, go ahead.")

	def test_unknown_stage_from_the_model_is_ignored(self):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer("Teleported")):
			self.receive("odd@example.com")
		deal = self.deal_for("odd@example.com")
		self.assertEqual(deal.status, self.entry)
		self.assertFalse(deal.ai_suggested_status)

	def test_stage_name_with_echoed_kind_still_matches(self):
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(f"{self.later} (in progress)")):
			self.receive("echo@example.com")
		self.assertEqual(self.deal_for("echo@example.com").ai_suggested_status, self.later)

	def test_timeline_shows_ai_entries(self):
		from xbr_crm.api.activities import get_ai_activities

		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.later)):
			self.receive("timeline@example.com")
		deal = self.deal_for("timeline@example.com")
		[entry] = get_ai_activities(deal.name)
		self.assertEqual(entry["activity_type"], "ai")
		self.assertEqual(entry["data"]["action"], "Suggested")
		self.assertEqual(entry["data"]["to_status"], self.later)

	# ------------------------------------------------------------ one-click close

	def suggested_close(self, email, stage):
		if not frappe.db.exists("CRM Deal Status", stage):
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": stage, "type": "Lost"}).insert()
		with patch("xbr_crm.ai.pipeline.chat_json", return_value=answer(self.entry)):
			self.receive(email)
		deal = self.deal_for(email)
		frappe.db.set_value(
			"CRM Deal",
			deal.name,
			{"ai_suggested_status": stage, "ai_suggestion_reason": "Automated tender alerts.", "ai_suggestion_confidence": 95},
		)
		return deal.name

	def test_junk_move_uses_the_reason_ai_picks(self):
		deal = self.suggested_close("junk.pick@example.com", "Junk")
		existing = frappe.get_all("CRM Lost Reason", pluck="name", limit=1)[0]
		with patch("xbr_crm.ai.pipeline.chat_json", return_value={"reason": existing.upper()}):
			ai.accept_suggestion(deal)
		doc = frappe.get_doc("CRM Deal", deal)
		self.assertEqual((doc.status, doc.lost_reason), ("Junk", existing))
		self.assertEqual(doc.lost_notes, "Automated tender alerts.")
		self.assertFalse(doc.ai_suggested_status)
		self.assertIn("Accepted", self.decisions(deal))

	def test_junk_move_creates_a_new_reason(self):
		deal = self.suggested_close("junk.new@example.com", "Junk")
		with patch("xbr_crm.ai.pipeline.chat_json", return_value={"reason": "Automated Alert."}):
			ai.accept_suggestion(deal)
		self.assertEqual(frappe.db.get_value("CRM Deal", deal, "lost_reason"), "Automated Alert")
		self.assertTrue(frappe.db.exists("CRM Lost Reason", "Automated Alert"))

	def test_junk_move_without_ai_uses_the_stage_name(self):
		deal = self.suggested_close("junk.offline@example.com", "Junk")
		with patch("xbr_crm.ai.pipeline.chat_json", side_effect=AIUnavailable("down")):
			ai.accept_suggestion(deal)
		self.assertEqual(frappe.db.get_value("CRM Deal", deal, ["status", "lost_reason"]), ("Junk", "Junk"))

	def test_lost_still_needs_a_manual_reason(self):
		deal = self.suggested_close("lost.manual@example.com", ai.MANUAL_REASON_STAGE)
		with self.assertRaises(frappe.ValidationError):
			ai.accept_suggestion(deal)
		self.assertNotEqual(frappe.db.get_value("CRM Deal", deal, "status"), ai.MANUAL_REASON_STAGE)
