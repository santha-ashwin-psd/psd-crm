# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""The unified inbox: one thread per pipeline, newest first."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from xbr_crm.api import inbox
from xbr_crm.ai.test_assist import make_deal


def email(deal, content, received=True, minutes_ago=0, subject="Hello"):
	when = add_to_date(now_datetime(), minutes=-minutes_ago)
	return frappe.get_doc(
		{
			"doctype": "Communication",
			"communication_type": "Communication",
			"communication_medium": "Email",
			"sent_or_received": "Received" if received else "Sent",
			"sender": deal.email if received else "Administrator",
			"subject": subject,
			"content": content,
			"communication_date": when,
			"reference_doctype": "CRM Deal",
			"reference_name": deal.name,
		}
	).insert(ignore_permissions=True)


class TestInbox(IntegrationTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		frappe.db.set_single_value("FCRM Settings", "ai_enabled", 0)
		frappe.clear_document_cache("FCRM Settings", "FCRM Settings")
		self.enqueue = patch("frappe.enqueue")
		self.enqueue.start()
		self.addCleanup(self.enqueue.stop)
		self.waiting = make_deal("inbox.waiting@example.com")
		email(self.waiting, "<p>Any update?</p>", received=True, minutes_ago=5, subject="Update")
		self.answered = make_deal("inbox.answered@example.com")
		email(self.answered, "Question", received=True, minutes_ago=30)
		email(self.answered, "Answer", received=False, minutes_ago=10)

	def tearDown(self):
		frappe.db.rollback()

	def thread(self, deal, **kw):
		return next((t for t in inbox.get_threads(page_length=500, **kw)["threads"] if t["deal"] == deal.name), None)

	def test_one_thread_per_pipeline_with_the_latest_message(self):
		t = self.thread(self.answered)
		self.assertEqual(t["messages"], 2)
		self.assertEqual(t["snippet"], "Answer")
		self.assertFalse(t["needs_reply"])

	def test_customer_last_means_needs_reply(self):
		t = self.thread(self.waiting)
		self.assertTrue(t["needs_reply"])
		self.assertEqual(t["unread"], 1)
		self.assertEqual(t["snippet"], "Any update?")

	def test_needs_reply_filter(self):
		self.assertIsNotNone(self.thread(self.waiting, needs_reply=1))
		self.assertIsNone(self.thread(self.answered, needs_reply=1))

	def test_stage_filter(self):
		stage = frappe.db.get_value("CRM Deal", self.waiting.name, "status")
		other = frappe.get_all("CRM Deal Status", filters={"name": ["!=", stage]}, pluck="name", limit=1)[0]
		frappe.db.set_value("CRM Deal", self.answered.name, "status", other)
		self.assertIsNotNone(self.thread(self.waiting, status=stage))
		self.assertIsNone(self.thread(self.answered, status=stage))
		self.assertIsNotNone(self.thread(self.answered, status=other))

	def test_search(self):
		self.assertIsNotNone(self.thread(self.waiting, search="any update"))
		self.assertIsNone(self.thread(self.answered, search="any update"))

	def test_newest_conversation_first(self):
		names = [t["deal"] for t in inbox.get_threads(page_length=500)["threads"]]
		self.assertLess(names.index(self.waiting.name), names.index(self.answered.name))

	def test_opening_a_thread_marks_it_read(self):
		data = inbox.get_thread(self.waiting.name)
		self.assertEqual([m["content"] for m in data["messages"]], ["<p>Any update?</p>"])
		self.assertEqual(self.thread(self.waiting)["unread"], 0)

	def test_thread_is_oldest_first(self):
		data = inbox.get_thread(self.answered.name)
		self.assertEqual([m["content"] for m in data["messages"]], ["Question", "Answer"])

	def test_badge_counts_threads_waiting_on_us(self):
		before = inbox.get_needs_reply_count()
		email(self.answered, "One more thing", received=True, minutes_ago=1)
		self.assertEqual(inbox.get_needs_reply_count(), before + 1)

	def test_pipelines_without_messages_are_not_listed(self):
		quiet = make_deal("inbox.quiet@example.com")
		self.assertIsNone(self.thread(quiet))

	def test_thread_shows_files_on_an_email(self):
		comm = email(self.waiting, "<p>CV attached</p>", received=True, minutes_ago=1)
		frappe.get_doc(
			{
				"doctype": "File",
				"file_name": "inbox-cv.txt",
				# A remote URL keeps the test off the site's file folder.
				"file_url": "https://example.com/inbox-cv.txt",
				"attached_to_doctype": "Communication",
				"attached_to_name": comm.name,
			}
		).insert(ignore_permissions=True)
		last = inbox.get_thread(self.waiting.name)["messages"][-1]
		self.assertEqual([a["file_name"] for a in last["attachments"]], ["inbox-cv.txt"])

	def test_whatsapp_file_without_text_shows_the_file_not_its_path(self):
		if not inbox._whatsapp_installed():
			self.skipTest("frappe_whatsapp not installed")
		frappe.db.set_value("CRM Deal", self.waiting.name, "mobile_no", "+96890000000")
		from xbr_crm.api.whatsapp import create_whatsapp_message

		# No WhatsApp account on a test site, and nothing may reach Meta.
		message_class = "frappe_whatsapp.frappe_whatsapp.doctype.whatsapp_message.whatsapp_message.WhatsAppMessage"
		with patch(f"{message_class}.before_insert"), patch(f"{message_class}.set_whatsapp_account"):
			create_whatsapp_message("CRM Deal", self.waiting.name, "", "+96890000000", "/files/site-photo.jpg", "", "image")
		last = inbox.get_thread(self.waiting.name)["messages"][-1]
		self.assertEqual(last["channel"], "whatsapp")
		self.assertEqual(last["content"], "")
		self.assertEqual(last["attachments"], [{"file_name": "site-photo.jpg", "file_url": "/files/site-photo.jpg"}])
		# The list shows the file name where the text would be.
		self.assertEqual(self.thread(self.waiting)["snippet"], "site-photo.jpg")
		# And the customer's caption is the file name, not the server path.
		self.assertEqual(
			frappe.db.get_value("WhatsApp Message", {"reference_name": self.waiting.name}, "message"),
			"site-photo.jpg",
		)

	# ------------------------------------------------------------ mark as read

	def test_mark_read_clears_waiting_and_unread(self):
		before = inbox.get_needs_reply_count()
		inbox.mark_read(self.waiting.name)
		t = self.thread(self.waiting)
		self.assertFalse(t["needs_reply"])
		self.assertEqual(t["unread"], 0)
		self.assertEqual(inbox.get_needs_reply_count(), before - 1)

	def test_the_customer_writing_again_brings_it_back(self):
		inbox.mark_read(self.waiting.name)
		frappe.db.set_value("CRM Deal", self.waiting.name, "inbox_done_on", add_to_date(now_datetime(), minutes=-2))
		email(self.waiting, "One more question", received=True, minutes_ago=1)
		t = self.thread(self.waiting)
		self.assertTrue(t["needs_reply"])
		self.assertEqual(t["unread"], 1)

	def test_mark_all_read_follows_the_filters(self):
		other = make_deal("inbox.other@example.com")
		email(other, "Hello?", received=True, minutes_ago=3)
		n = inbox.mark_all_read(search="any update")
		self.assertEqual(n, 1)
		self.assertFalse(self.thread(self.waiting)["needs_reply"])
		self.assertTrue(self.thread(other)["needs_reply"])

	def test_junk_never_waits_or_counts(self):
		if not frappe.db.exists("CRM Deal Status", "Junk"):
			frappe.get_doc({"doctype": "CRM Deal Status", "deal_status": "Junk", "type": "Lost"}).insert()
		before = inbox.get_needs_reply_count()
		frappe.db.set_value("CRM Deal", self.waiting.name, "status", "Junk")
		t = self.thread(self.waiting)
		self.assertFalse(t["needs_reply"])
		self.assertEqual(t["unread"], 0)
		self.assertEqual(inbox.get_needs_reply_count(), before - 1)

	def test_lost_still_counts(self):
		frappe.db.set_value("CRM Deal", self.waiting.name, "status", "Lost")
		self.assertTrue(self.thread(self.waiting)["needs_reply"])
