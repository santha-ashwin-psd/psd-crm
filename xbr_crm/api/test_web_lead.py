# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for the website inquiry endpoint.

`capture_inquiry` reads the API key from the real request header and writes the
HTTP status onto `frappe.local.response`, so the tests drive it through a small
harness that fakes both rather than going over the network — that keeps the
assertions on OUR logic (tenancy, dedup, normalisation) instead of on werkzeug.

Every inquiry becomes a Pipeline (CRM Deal) linked to a Contact; no CRM Lead is
ever created, and several tests assert exactly that.

The end-to-end HTTP path is covered separately by scripts/test_web_lead.py.
"""

import json

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.api import web_lead
from xbr_crm.api.web_lead import capture_inquiry, normalize_mobile
from xbr_crm.fcrm.doctype.crm_deal.crm_deal import default_deal_status

TEST_COMPANY = "_Test Web Lead Co"
OTHER_COMPANY = "_Test Other Co"
COMPANIES = (TEST_COMPANY, OTHER_COMPANY)
TEST_KEY = "test-secret-key-aaaaaaaaaaaa"
OWNER_USER = "test_weblead_owner@example.com"
RULE_USER = "test_weblead_rule@example.com"
OUTSIDER_USER = "test_weblead_outsider@example.com"
TEST_USERS = (OWNER_USER, RULE_USER, OUTSIDER_USER)
RULE_NAME = "_Test Web Lead Pipeline Rule"


class _FakeHeaders(dict):
	def get(self, key, default=None):
		# Header lookup is case-insensitive in werkzeug; mirror that.
		for k, v in self.items():
			if k.lower() == key.lower():
				return v
		return default


class _FakeRequest:
	"""Just enough of a werkzeug request for the code paths a pipeline insert touches.

	`host` and `path` are not optional despite us never reading them: assigning
	the pipeline's owner queues a notification email, which builds a document URL
	from `frappe.local.request.host` and renders a template that reads
	`frappe.local.request.path`. A real request always has both.
	"""

	def __init__(self, headers):
		self.headers = _FakeHeaders(headers)
		self.host = "crm.local"
		self.method = "POST"
		self.path = "/api/method/xbr_crm.api.web_lead.capture_inquiry"
		self.url = "http://crm.local" + self.path
		self.environ = {"REMOTE_ADDR": "203.0.113.10"}


def _delete_where(doctype, filters):
	frappe.db.delete(doctype, filters)


def _purge_tenant_records():
	"""Remove every record the endpoint created for the test companies.

	The endpoint commits on its own, so nothing here is rolled back for us. Deals
	drag a tail of framework rows behind them (assignments, shares, notifications,
	versions), and those are cleared too so the suite leaves the site as it found it.
	"""
	deals = frappe.get_all("CRM Deal", {"crm_company": ("in", COMPANIES)}, pluck="name")
	if deals:
		for doctype, field in (
			("ToDo", "reference_name"),
			("DocShare", "share_name"),
			("Comment", "reference_name"),
			("Version", "docname"),
			("Notification Log", "document_name"),
			("CRM Notification", "reference_name"),
			("FCRM Note", "reference_docname"),
			("CRM Contacts", "parent"),
			("CRM Status Change Log", "parent"),
		):
			_delete_where(doctype, {field: ("in", deals)})
		_delete_where("CRM Deal", {"name": ("in", deals)})

	contacts = frappe.get_all("Contact", {"crm_company": ("in", COMPANIES)}, pluck="name")
	if contacts:
		for child in ("Contact Email", "Contact Phone", "Dynamic Link"):
			_delete_where(child, {"parent": ("in", contacts), "parenttype": "Contact"})
		_delete_where("Contact", {"name": ("in", contacts)})

	_delete_where("FCRM Note", {"crm_company": ("in", COMPANIES)})
	_delete_where("CRM Lead", {"crm_company": ("in", COMPANIES)})
	_delete_where("CRM Web Lead Log", {"crm_company": ("in", COMPANIES)})


class TestWebLead(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")

		for email, first in ((OWNER_USER, "Weblead"), (RULE_USER, "Rule"), (OUTSIDER_USER, "Outsider")):
			if not frappe.db.exists("User", email):
				frappe.get_doc(
					{
						"doctype": "User",
						"email": email,
						"first_name": first,
						"last_name": "Tester",
						"send_welcome_email": 0,
						"roles": [{"role": "Sales User"}],
					}
				).insert(ignore_permissions=True)

		for company in COMPANIES:
			if not frappe.db.exists("CRM Company", company):
				frappe.get_doc(
					{
						"doctype": "CRM Company",
						"company_name": company,
						"is_active": 1,
						"owner_user": OWNER_USER,
					}
				).insert(ignore_permissions=True)

		# Tenant membership, for the visibility tests under strict tenancy.
		for user, company in ((OWNER_USER, TEST_COMPANY), (OUTSIDER_USER, OTHER_COMPANY)):
			if not frappe.db.exists("CRM Company Member", user):
				frappe.get_doc(
					{
						"doctype": "CRM Company Member",
						"user": user,
						"company": company,
						"crm_role": "Sales User",
					}
				).insert(ignore_permissions=True)

		if not frappe.db.exists("CRM Web Lead Key", "_Test Website Key"):
			frappe.get_doc(
				{
					"doctype": "CRM Web Lead Key",
					"key_name": "_Test Website Key",
					"crm_company": TEST_COMPANY,
					"is_active": 1,
					"api_key": TEST_KEY,
					"website_url": "https://ieagents.co.in",
				}
			).insert(ignore_permissions=True)

		frappe.db.commit()

	@classmethod
	def tearDownClass(cls):
		"""Remove the fixtures from the database.

		setUpClass has to commit (the records must outlive each test's rollback),
		which means a key whose secret is written in plain text in this file would
		otherwise be left live on the site — a working credential for anyone who can
		read the repo. Delete it, and the rest of the scaffolding with it.
		"""
		frappe.set_user("Administrator")
		_purge_tenant_records()
		for doctype, name in (
			("Assignment Rule", RULE_NAME),
			("CRM Web Lead Key", "_Test Website Key"),
			("CRM Company Member", OWNER_USER),
			("CRM Company Member", OUTSIDER_USER),
			("CRM Company", TEST_COMPANY),
			("CRM Company", OTHER_COMPANY),
		):
			if frappe.db.exists(doctype, name):
				frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		for user in TEST_USERS:
			if frappe.db.exists("User", user):
				frappe.delete_doc("User", user, force=True, ignore_permissions=True)
		frappe.db.commit()
		super().tearDownClass()

	def setUp(self):
		# Every test starts from a clean slate for these tenants, so dedup
		# assertions cannot be polluted by a previous test's pipeline or contact.
		frappe.set_user("Administrator")
		_purge_tenant_records()
		frappe.db.commit()
		# The suite makes more calls per minute than the endpoint's own rate limit
		# allows, so without this the later tests fail on RateLimitExceededError
		# rather than on what they are testing. `rl:` is the prefix
		# frappe.rate_limiter builds its cache keys with.
		frappe.cache.delete_keys("rl:")
		self._orig_request = getattr(frappe.local, "request", None)
		self._orig_ip = getattr(frappe.local, "request_ip", None)

	def tearDown(self):
		frappe.set_user("Administrator")
		frappe.local.request = self._orig_request
		frappe.local.request_ip = self._orig_ip
		frappe.local.response.pop("http_status_code", None)

	# -- harness ----------------------------------------------------------

	def post(self, payload, api_key=TEST_KEY, ip="203.0.113.10"):
		"""Call the endpoint as if a website had POSTed `payload`.

		A 500 means the endpoint swallowed a real exception into its generic
		handler, which would otherwise surface here as a bare "500 != 200". Dig the
		traceback back out so a failing test says what actually broke.
		"""
		headers = {"X-Lead-Api-Key": api_key} if api_key is not None else {}
		frappe.local.request = _FakeRequest(headers)
		frappe.local.request_ip = ip
		frappe.local.response.pop("http_status_code", None)

		captured = {}
		original = web_lead.write_log

		def spy(*args, **kwargs):
			if kwargs.get("traceback"):
				captured["traceback"] = kwargs["traceback"]
			return original(*args, **kwargs)

		web_lead.write_log = spy
		try:
			result = capture_inquiry(**payload)
		finally:
			web_lead.write_log = original

		status = frappe.local.response.get("http_status_code", 200)
		if status == 500 and "traceback" in captured:
			self.fail(f"endpoint raised:\n{captured['traceback']}")
		return result, status

	def consultation_payload(self, **overrides):
		payload = {
			"form_type": "consultation",
			"first_name": "arun",
			"last_name": "kumar",
			"email": "Arun.Kumar@Example.com",
			"mobile_no": "98765 43210",
			"city": "Chennai",
			"page_url": "https://ieagents.co.in/",
			"utm_source": "google",
		}
		payload.update(overrides)
		return payload

	def evaluation_payload(self, **overrides):
		payload = {
			"form_type": "evaluation",
			"first_name": "Priya",
			"last_name": "Raman",
			"email": "priya@example.com",
			"mobile_no": "+919876500001",
			"highest_qualification": "Bachelors",
			"course_level": "Masters",
			"preferred_state": "Victoria",
			"start_timeline": "2027 Intake",
		}
		payload.update(overrides)
		return payload

	def deal_count(self, company=TEST_COMPANY):
		return frappe.db.count("CRM Deal", {"crm_company": company})

	def notes_on(self, deal):
		return frappe.get_all(
			"FCRM Note",
			filters={"reference_doctype": "CRM Deal", "reference_docname": deal},
			pluck="content",
		)

	def stage_of_type(self, status_type):
		"""A pipeline stage of this type, so the tests do not depend on stage names."""
		return frappe.get_all(
			"CRM Deal Status", filters={"type": status_type}, order_by="position asc", pluck="name", limit=1
		)[0]

	def close_deal(self, deal, status_type="Won"):
		# Straight to the database: the test is about what the endpoint does with a
		# closed pipeline, not about the rules for closing one (Lost needs a reason).
		frappe.db.set_value("CRM Deal", deal, "status", self.stage_of_type(status_type))
		frappe.db.commit()

	def _age_submission_log(self, minutes=None):
		"""Push the log rows out of the retry window.

		Needed wherever a test posts the same payload twice but means them as two
		separate inquiries rather than one retry.
		"""
		frappe.db.sql(
			"""update `tabCRM Web Lead Log`
			   set creation = date_sub(creation, interval %s minute)
			   where submission_hash is not null""",
			(minutes or web_lead.RETRY_WINDOW_MINUTES + 5,),
		)
		frappe.db.commit()

	# -- happy paths ------------------------------------------------------

	def test_response_shape(self):
		result, status = self.post(self.consultation_payload())
		self.assertEqual(status, 200)
		self.assertEqual(set(result), {"success", "pipeline", "contact", "duplicate", "message"})
		self.assertTrue(result["success"])
		self.assertFalse(result["duplicate"])
		self.assertTrue(frappe.db.exists("CRM Deal", result["pipeline"]))
		self.assertTrue(frappe.db.exists("Contact", result["contact"]))

	def test_valid_consultation_creates_pipeline_and_contact(self):
		result, status = self.post(self.consultation_payload())
		self.assertEqual(status, 200)

		deal = frappe.get_doc("CRM Deal", result["pipeline"])
		self.assertEqual(deal.first_name, "Arun")  # title-cased
		self.assertEqual(deal.last_name, "Kumar")
		self.assertEqual(deal.custom_city, "Chennai")
		self.assertEqual(deal.custom_form_type, "consultation")
		# utm_* is not part of this API: sent, but not stored.
		self.assertFalse(deal.custom_utm_source)
		self.assertEqual(deal.custom_page_url, "https://ieagents.co.in/")
		self.assertEqual(deal.source, "Website")
		self.assertEqual(deal.custom_created_via, "Website")
		# Not set by us — the controller's own default must still win.
		self.assertEqual(deal.status, default_deal_status())

		# The person is a Contact, linked as the pipeline's primary contact, and
		# the pipeline mirrors its email and mobile.
		self.assertEqual([c.contact for c in deal.contacts], [result["contact"]])
		self.assertTrue(deal.contacts[0].is_primary)
		self.assertEqual(deal.email, "arun.kumar@example.com")  # lower-cased
		self.assertEqual(deal.mobile_no, "+919876543210")  # normalised

		contact = frappe.get_doc("Contact", result["contact"])
		self.assertEqual(contact.first_name, "Arun")
		self.assertEqual(contact.email_id, "arun.kumar@example.com")
		self.assertEqual(contact.mobile_no, "+919876543210")

	def test_valid_evaluation_pipeline(self):
		result, status = self.post(self.evaluation_payload())
		self.assertEqual(status, 200)
		deal = frappe.get_doc("CRM Deal", result["pipeline"])
		self.assertEqual(deal.custom_highest_qualification, "Bachelors")
		self.assertEqual(deal.custom_course_level, "Masters")
		self.assertEqual(deal.custom_preferred_state, "Victoria")
		self.assertEqual(deal.custom_start_timeline, "2027 Intake")
		self.assertEqual(deal.custom_form_type, "evaluation")

	def test_contact_form_type(self):
		result, status = self.post(self.consultation_payload(form_type="contact"))
		self.assertEqual(status, 200)
		self.assertEqual(frappe.db.get_value("CRM Deal", result["pipeline"], "custom_form_type"), "contact")

	def test_new_pipeline_carries_a_note_of_the_submission(self):
		result, _ = self.post(self.evaluation_payload())
		notes = self.notes_on(result["pipeline"])
		self.assertTrue(any("Masters" in n for n in notes))

	def test_no_lead_is_ever_created(self):
		self.post(self.consultation_payload())
		self.post(self.evaluation_payload())
		self.post(self.consultation_payload(mobile_no="9876511111", email="third@example.com"))
		self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": ("in", COMPANIES)}), 0)

	def test_tenant_and_owner_are_set(self):
		"""The things that decide whether anyone can SEE the pipeline."""
		result, _status = self.post(self.consultation_payload())
		deal = frappe.get_doc("CRM Deal", result["pipeline"])

		# Without these the records are invisible under tenancy_strict.
		self.assertEqual(deal.crm_company, TEST_COMPANY)
		self.assertEqual(frappe.db.get_value("Contact", result["contact"], "crm_company"), TEST_COMPANY)
		self.assertEqual(
			frappe.db.get_value("FCRM Note", {"reference_docname": deal.name}, "crm_company"), TEST_COMPANY
		)
		# "Never leave a web pipeline unowned" — falls back to CRM Company.owner_user,
		# and the owner is assigned so org_hierarchy shows it to them.
		self.assertEqual(deal.deal_owner, OWNER_USER)
		self.assertIn(OWNER_USER, json.loads(deal._assign or "[]"))

	def test_key_default_owner_beats_company_owner(self):
		frappe.db.set_value("CRM Web Lead Key", "_Test Website Key", "default_lead_owner", RULE_USER)
		frappe.clear_cache(doctype="CRM Web Lead Key")
		frappe.db.commit()
		try:
			result, _ = self.post(self.consultation_payload())
			self.assertEqual(frappe.db.get_value("CRM Deal", result["pipeline"], "deal_owner"), RULE_USER)
		finally:
			frappe.db.set_value("CRM Web Lead Key", "_Test Website Key", "default_lead_owner", None)
			frappe.clear_cache(doctype="CRM Web Lead Key")
			frappe.db.commit()

	def test_assignment_rule_picks_the_owner(self):
		"""An assignment rule on CRM Deal wins over the key's fallback owner.

		The pipeline is inserted without an owner precisely so the rule can fire —
		a rule only assigns a document that has no assignment yet.
		"""
		rule = frappe.get_doc(
			{
				"doctype": "Assignment Rule",
				"name": RULE_NAME,
				"document_type": "CRM Deal",
				"description": "Test: website pipelines for the test company",
				"assign_condition": f'crm_company == "{TEST_COMPANY}"',
				"rule": "Round Robin",
				"priority": 99,
				"users": [{"user": RULE_USER}],
				"assignment_days": [
					{"day": d}
					for d in ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday")
				],
			}
		)
		rule.insert(ignore_permissions=True)
		frappe.db.commit()
		try:
			result, status = self.post(self.consultation_payload())
			self.assertEqual(status, 200)
			deal = frappe.get_doc("CRM Deal", result["pipeline"])
			self.assertEqual(deal.deal_owner, RULE_USER)
			self.assertEqual(json.loads(deal._assign or "[]"), [RULE_USER])
		finally:
			frappe.delete_doc("Assignment Rule", rule.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_pipeline_is_visible_to_its_owner_under_strict_tenancy(self):
		"""The owner can see it; a user of another company cannot."""
		result, _ = self.post(self.consultation_payload())
		deal = result["pipeline"]

		strict_before = frappe.db.get_single_value("FCRM Settings", "tenancy_strict")
		frappe.db.set_single_value("FCRM Settings", "tenancy_strict", 1)
		frappe.db.commit()
		try:
			for user, should_see in ((OWNER_USER, True), (OUTSIDER_USER, False)):
				with self.subTest(user=user):
					frappe.set_user(user)
					# get_user_company/is_strict cache per request; start fresh per user.
					getattr(frappe.local, "request_cache", {}).clear()
					visible = frappe.get_list("CRM Deal", filters={"name": deal}, pluck="name")
					self.assertEqual(bool(visible), should_see)
					self.assertEqual(frappe.has_permission("CRM Deal", "read", deal, user=user), should_see)
		finally:
			frappe.set_user("Administrator")
			frappe.db.set_single_value("FCRM Settings", "tenancy_strict", strict_before or 0)
			frappe.db.commit()
			getattr(frappe.local, "request_cache", {}).clear()

	def test_numbers_sent_as_json_numbers_work(self):
		"""A PHP array encoded with json_encode may send the mobile as a number."""
		result, status = self.post(self.consultation_payload(mobile_no=9876500099, email="num@example.com"))
		self.assertEqual(status, 200)
		self.assertEqual(frappe.db.get_value("CRM Deal", result["pipeline"], "mobile_no"), "+919876500099")

	def test_forecasting_does_not_reject_website_pipelines(self):
		"""Forecasting makes value and close date mandatory; an inquiry has neither."""
		before = frappe.db.get_single_value("FCRM Settings", "enable_forecasting")
		frappe.db.set_single_value("FCRM Settings", "enable_forecasting", 1)
		frappe.db.commit()
		try:
			result, status = self.post(self.consultation_payload())
			self.assertEqual(status, 200)
			self.assertTrue(frappe.db.exists("CRM Deal", result["pipeline"]))
		finally:
			frappe.db.set_single_value("FCRM Settings", "enable_forecasting", before or 0)
			frappe.db.commit()

	# -- validation -------------------------------------------------------

	def test_missing_first_name_is_400(self):
		result, status = self.post(self.consultation_payload(first_name=""))
		self.assertEqual(status, 400)
		self.assertFalse(result["success"])
		self.assertIn("First name", result["message"])

	def test_missing_mobile_is_400(self):
		result, status = self.post(self.consultation_payload(mobile_no=""))
		self.assertEqual(status, 400)
		self.assertFalse(result["success"])

	def test_invalid_mobile_is_400(self):
		for bad in ("12345", "1234567890", "+1 415 555 0142", "abcdefghij"):
			with self.subTest(mobile=bad):
				result, status = self.post(self.consultation_payload(mobile_no=bad))
				self.assertEqual(status, 400, f"{bad!r} should be rejected")
				self.assertFalse(result["success"])

	def test_bad_email_is_400(self):
		result, status = self.post(self.consultation_payload(email="not-an-email"))
		self.assertEqual(status, 400)
		self.assertIn("Email", result["message"])

	def test_overlong_field_is_400(self):
		result, status = self.post(self.consultation_payload(first_name="A" * 141))
		self.assertEqual(status, 400)
		self.assertEqual(result["code"], "field_too_long")

	def test_overlong_page_url_is_trimmed_not_rejected(self):
		"""page_url is context only; a long tracking URL must not lose the inquiry."""
		long_url = "https://ieagents.co.in/?" + "x" * 300
		result, status = self.post(self.consultation_payload(page_url=long_url))
		self.assertEqual(status, 200)
		stored = frappe.db.get_value("CRM Deal", result["pipeline"], "custom_page_url")
		self.assertEqual(stored, long_url[:140])

	def test_non_text_field_is_400(self):
		result, status = self.post(self.consultation_payload(first_name={"x": 1}))
		self.assertEqual(status, 400)
		self.assertEqual(result["code"], "invalid_field")

	def test_email_is_optional(self):
		result, status = self.post(self.consultation_payload(email=""))
		self.assertEqual(status, 200)
		self.assertFalse(frappe.db.get_value("Contact", result["contact"], "email_id"))

	def test_rejections_create_nothing(self):
		self.post(self.consultation_payload(mobile_no="nope"))
		self.assertEqual(self.deal_count(), 0)
		self.assertEqual(frappe.db.count("Contact", {"crm_company": TEST_COMPANY}), 0)

	def test_error_response_shape(self):
		result, status = self.post(self.consultation_payload(mobile_no="nope"))
		self.assertEqual(status, 400)
		self.assertEqual(result["pipeline"], None)
		self.assertEqual(result["contact"], None)
		self.assertFalse(result["duplicate"])
		self.assertEqual(result["code"], "invalid_mobile")

	def test_failed_submission_is_logged_for_retry(self):
		self.post(self.consultation_payload(mobile_no="nope"))
		log = frappe.get_all(
			"CRM Web Lead Log",
			filters={"result": "error"},
			fields=["payload", "message"],
			limit=1,
			order_by="creation desc",
		)
		self.assertTrue(log, "a rejected submission must still be logged")
		# The raw payload is kept so the inquiry can be re-entered by hand.
		self.assertIn("nope", log[0].payload)

	def test_log_links_the_pipeline(self):
		result, _ = self.post(self.consultation_payload())
		log = frappe.get_all(
			"CRM Web Lead Log",
			filters={"crm_company": TEST_COMPANY, "result": "success"},
			fields=["deal", "lead"],
		)
		self.assertEqual(len(log), 1)
		self.assertEqual(log[0].deal, result["pipeline"])
		self.assertFalse(log[0].lead)

	# -- mobile normalisation ---------------------------------------------

	def test_normalize_mobile(self):
		for raw, expected in [
			("9876543210", "+919876543210"),
			("09876543210", "+919876543210"),
			("919876543210", "+919876543210"),
			("+91 98765 43210", "+919876543210"),
			("+91-98765-43210", "+919876543210"),
			("(98765) 43210", "+919876543210"),
			("5876543210", None),  # IN mobiles start 6-9
			("98765", None),
			("", None),
			(None, None),
		]:
			with self.subTest(raw=raw):
				self.assertEqual(normalize_mobile(raw), expected)

	# -- contact matching -------------------------------------------------

	def test_existing_contact_is_reused_by_mobile(self):
		"""A contact typed in by hand, number in a different shape, is still them."""
		existing = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Arun",
				"crm_company": TEST_COMPANY,
				"phone_nos": [{"phone": "98765 43210", "is_primary_mobile_no": 1}],
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()

		result, status = self.post(self.consultation_payload(email="new.address@example.com"))
		self.assertEqual(status, 200)
		self.assertEqual(result["contact"], existing.name)
		self.assertFalse(result["duplicate"], "a contact with no open pipeline gets a new one")

	def test_existing_contact_is_reused_by_email(self):
		existing = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Arun",
				"crm_company": TEST_COMPANY,
				"email_ids": [{"email_id": "ARUN.KUMAR@example.com", "is_primary": 1}],
				"phone_nos": [{"phone": "+919000000001", "is_primary_mobile_no": 1}],
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()

		result, _ = self.post(self.consultation_payload())
		self.assertEqual(result["contact"], existing.name)
		# Their existing number is kept, not replaced.
		self.assertEqual(frappe.db.get_value("Contact", existing.name, "mobile_no"), "+919000000001")

	def test_contact_matching_is_scoped_to_the_tenant(self):
		"""Another company's contact with the same details is NOT this person."""
		other = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Arun",
				"crm_company": OTHER_COMPANY,
				"email_ids": [{"email_id": "arun.kumar@example.com", "is_primary": 1}],
				"phone_nos": [{"phone": "+919876543210", "is_primary_mobile_no": 1}],
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()

		result, status = self.post(self.consultation_payload())
		self.assertEqual(status, 200)
		self.assertNotEqual(result["contact"], other.name)
		self.assertEqual(frappe.db.get_value("Contact", result["contact"], "crm_company"), TEST_COMPANY)

	# -- dedup ------------------------------------------------------------

	def test_open_pipeline_by_email_is_a_duplicate(self):
		first, _ = self.post(self.consultation_payload())
		second, status = self.post(self.consultation_payload(mobile_no="9876500002"))

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])
		self.assertEqual(second["contact"], first["contact"])
		self.assertEqual(self.deal_count(), 1)

	def test_open_pipeline_by_mobile_is_a_duplicate(self):
		first, _ = self.post(self.consultation_payload())
		second, status = self.post(self.consultation_payload(email="different@example.com"))

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])

	def test_ongoing_pipeline_still_counts_as_open(self):
		first, _ = self.post(self.consultation_payload())
		self.close_deal(first["pipeline"], status_type="Ongoing")
		self._age_submission_log()

		second, _ = self.post(self.consultation_payload())
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])

	def test_same_person_submits_both_forms(self):
		"""The case this dedup rule exists for."""
		first, _ = self.post(self.consultation_payload())
		second, _ = self.post(self.evaluation_payload(email="arun.kumar@example.com", mobile_no="9876543210"))

		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])
		self.assertEqual(self.deal_count(), 1)

		# The second form's answers must not be lost — they go on as a note.
		self.assertTrue(any("Masters" in n for n in self.notes_on(first["pipeline"])))

	def test_on_hold_pipeline_still_counts_as_open(self):
		"""A parked pipeline (e.g. Future Requirements) is not closed: note it."""
		first, _ = self.post(self.consultation_payload())
		self.close_deal(first["pipeline"], status_type="On Hold")
		self._age_submission_log()

		second, _ = self.post(self.consultation_payload())
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])

	def test_closed_pipeline_starts_a_new_one(self):
		for status_type in ("Won", "Lost"):
			with self.subTest(stage_type=status_type):
				_purge_tenant_records()
				frappe.db.commit()
				first, _ = self.post(self.consultation_payload())
				self.close_deal(first["pipeline"], status_type=status_type)
				# A real later re-inquiry, not a transport retry — see
				# test_retry_wins_over_the_closed_rule for the other side of this.
				self._age_submission_log()

				second, code = self.post(self.consultation_payload())

				self.assertEqual(code, 200)
				self.assertFalse(second["duplicate"])
				self.assertNotEqual(second["pipeline"], first["pipeline"])
				# Same person, so the same contact.
				self.assertEqual(second["contact"], first["contact"])
				self.assertEqual(self.deal_count(), 2)

	def test_dedup_is_scoped_to_the_tenant(self):
		"""Another company's open pipeline for the same person is not a duplicate."""
		other_contact = frappe.get_doc(
			{
				"doctype": "Contact",
				"first_name": "Arun",
				"crm_company": OTHER_COMPANY,
				"email_ids": [{"email_id": "arun.kumar@example.com", "is_primary": 1}],
				"phone_nos": [{"phone": "+919876543210", "is_primary_mobile_no": 1}],
			}
		).insert(ignore_permissions=True)
		other_deal = frappe.get_doc(
			{
				"doctype": "CRM Deal",
				"crm_company": OTHER_COMPANY,
				"contacts": [{"contact": other_contact.name, "is_primary": 1}],
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()

		result, status = self.post(self.consultation_payload())

		self.assertEqual(status, 200)
		self.assertFalse(result["duplicate"])
		self.assertNotEqual(result["pipeline"], other_deal.name)

	# -- auth -------------------------------------------------------------

	def test_wrong_api_key_is_401(self):
		result, status = self.post(self.consultation_payload(), api_key="wrong-key")
		self.assertEqual(status, 401)
		self.assertFalse(result["success"])
		self.assertEqual(self.deal_count(), 0)

	def test_missing_api_key_is_401(self):
		_result, status = self.post(self.consultation_payload(), api_key=None)
		self.assertEqual(status, 401)

	def test_inactive_key_is_401(self):
		frappe.db.set_value("CRM Web Lead Key", "_Test Website Key", "is_active", 0)
		frappe.clear_cache(doctype="CRM Web Lead Key")
		frappe.db.commit()
		try:
			_result, status = self.post(self.consultation_payload())
			self.assertEqual(status, 401)
		finally:
			frappe.db.set_value("CRM Web Lead Key", "_Test Website Key", "is_active", 1)
			frappe.clear_cache(doctype="CRM Web Lead Key")
			frappe.db.commit()

	def test_key_is_never_written_to_the_log(self):
		self.post(self.consultation_payload())
		payloads = frappe.get_all("CRM Web Lead Log", pluck="payload")
		for p in payloads:
			self.assertNotIn(TEST_KEY, p or "")

	def test_old_method_path_still_routes_here(self):
		"""Websites configured before the app rename POST to crm.api.web_lead…"""
		overrides = frappe.get_hooks("override_whitelisted_methods") or {}
		self.assertEqual(
			(overrides.get("crm.api.web_lead.capture_inquiry") or [None])[-1],
			"xbr_crm.api.web_lead.capture_inquiry",
		)

	# -- IP allowlist -----------------------------------------------------

	def _set_allowlist(self, value):
		doc = frappe.get_doc("CRM Web Lead Key", "_Test Website Key")
		doc.allowed_ips = value
		doc.save(ignore_permissions=True)
		frappe.clear_cache(doctype="CRM Web Lead Key")
		frappe.db.commit()

	def test_ip_not_in_allowlist_is_403(self):
		self._set_allowlist("198.51.100.7")
		try:
			result, status = self.post(self.consultation_payload(), ip="203.0.113.10")
			self.assertEqual(status, 403)
			self.assertFalse(result["success"])
			self.assertEqual(self.deal_count(), 0)
		finally:
			self._set_allowlist("")

	def test_ip_in_allowlist_passes(self):
		self._set_allowlist("198.51.100.7\n203.0.113.0/24")
		try:
			_result, status = self.post(self.consultation_payload(), ip="203.0.113.10")
			self.assertEqual(status, 200)
		finally:
			self._set_allowlist("")

	def test_empty_allowlist_allows_any_ip(self):
		self._set_allowlist("")
		_result, status = self.post(self.consultation_payload(), ip="192.0.2.55")
		self.assertEqual(status, 200)

	def test_invalid_allowlist_is_rejected_at_save_time(self):
		doc = frappe.get_doc("CRM Web Lead Key", "_Test Website Key")
		doc.allowed_ips = "not-an-ip"
		with self.assertRaises(frappe.ValidationError):
			doc.save(ignore_permissions=True)
		doc.reload()

	# -- field mapping safety ---------------------------------------------

	def test_payload_cannot_set_arbitrary_pipeline_fields(self):
		"""Only mapped keys are written — not status, owner or crm_company."""
		result, status = self.post(
			self.consultation_payload(
				status="Won", crm_company=OTHER_COMPANY, deal_owner="Administrator", probability=99
			)
		)
		self.assertEqual(status, 200)
		deal = frappe.get_doc("CRM Deal", result["pipeline"])
		self.assertEqual(deal.status, default_deal_status())
		self.assertEqual(deal.crm_company, TEST_COMPANY)
		self.assertEqual(deal.deal_owner, OWNER_USER)
		self.assertNotEqual(deal.probability, 99)

	# -- key lifecycle ----------------------------------------------------

	def _temp_key(self, label="_Test Lifecycle Key"):
		doc = frappe.get_doc(
			{
				"doctype": "CRM Web Lead Key",
				"key_name": label,
				"crm_company": TEST_COMPANY,
				"is_active": 1,
				# api_key omitted on purpose — it must generate one.
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
		self.addCleanup(self._drop_key, doc.name)
		return doc

	def _drop_key(self, name):
		if frappe.db.exists("CRM Web Lead Key", name):
			frappe.delete_doc("CRM Web Lead Key", name, force=True, ignore_permissions=True)
			frappe.db.commit()

	def test_key_is_generated_when_none_is_supplied(self):
		"""A key typed by a person is a weak key, so the field is never an input."""
		doc = self._temp_key()
		secret = doc.get_password("api_key", raise_exception=False)
		self.assertTrue(secret)
		# token_urlsafe(32) is 43 chars of base64url.
		self.assertGreaterEqual(len(secret), 40)
		self.assertRegex(secret, r"^[A-Za-z0-9_-]+$")

	def test_generated_keys_are_unique(self):
		a = self._temp_key("_Test Unique Key A")
		b = self._temp_key("_Test Unique Key B")
		self.assertNotEqual(
			a.get_password("api_key", raise_exception=False),
			b.get_password("api_key", raise_exception=False),
		)

	def test_a_generated_key_authenticates(self):
		doc = self._temp_key()
		secret = doc.get_password("api_key", raise_exception=False)
		_result, status = self.post(self.consultation_payload(), api_key=secret)
		self.assertEqual(status, 200)

	def test_rotation_invalidates_the_old_secret(self):
		doc = self._temp_key()
		old = doc.get_password("api_key", raise_exception=False)

		new = doc.rotate()
		frappe.clear_cache(doctype="CRM Web Lead Key")

		self.assertNotEqual(new, old)
		result, status = self.post(self.consultation_payload(), api_key=old)
		self.assertEqual(status, 401, "the old secret must stop working immediately")
		self.assertEqual(result["code"], "invalid_api_key")

		_result, status = self.post(self.consultation_payload(), api_key=new)
		self.assertEqual(status, 200, "the new secret must work")

	def test_rotation_records_when_it_happened(self):
		doc = self._temp_key()
		self.assertFalse(doc.last_rotated_on)
		doc.rotate()
		doc.reload()
		self.assertTrue(doc.last_rotated_on)

	def test_deactivating_blocks_requests_without_changing_the_secret(self):
		doc = self._temp_key()
		secret = doc.get_password("api_key", raise_exception=False)

		doc.is_active = 0
		doc.save(ignore_permissions=True)
		frappe.clear_cache(doctype="CRM Web Lead Key")
		frappe.db.commit()

		_result, status = self.post(self.consultation_payload(), api_key=secret)
		self.assertEqual(status, 401)

		doc.is_active = 1
		doc.save(ignore_permissions=True)
		frappe.clear_cache(doctype="CRM Web Lead Key")
		frappe.db.commit()

		# Same secret, service restored — nothing had to be redistributed.
		_result, status = self.post(self.consultation_payload(), api_key=secret)
		self.assertEqual(status, 200)

	# -- caller tolerance -------------------------------------------------

	def test_unknown_fields_are_ignored_not_rejected(self):
		"""Extra form fields (captcha tokens, CSRF tokens, buttons) are ignored."""
		result, status = self.post(
			self.consultation_payload(captcha="abc123", csrf_token="xyz", submit="Send", utm_campaign="x")
		)
		self.assertEqual(status, 200)
		self.assertTrue(result["success"])

	def test_empty_strings_are_treated_as_missing(self):
		"""PHP sends "" for an empty form input rather than leaving it out."""
		result, status = self.post(self.consultation_payload(last_name="", email="", city=""))
		self.assertEqual(status, 200)
		deal = frappe.get_doc("CRM Deal", result["pipeline"])
		self.assertFalse(deal.last_name)
		self.assertFalse(deal.email)
		self.assertFalse(deal.custom_city)

	def test_whitespace_only_required_field_is_rejected(self):
		_result, status = self.post(self.consultation_payload(first_name="   "))
		self.assertEqual(status, 400)

	def test_errors_carry_a_machine_readable_code(self):
		"""The website can log or branch on `code`; `message` may be reworded."""
		for payload, expected in [
			(self.consultation_payload(first_name=""), "missing_first_name"),
			(self.consultation_payload(mobile_no="12345"), "invalid_mobile"),
			(self.consultation_payload(email="nope"), "invalid_email"),
		]:
			with self.subTest(code=expected):
				result, _status = self.post(payload)
				self.assertEqual(result["code"], expected)

		result, status = self.post(self.consultation_payload(), api_key="wrong")
		self.assertEqual(status, 401)
		self.assertEqual(result["code"], "invalid_api_key")

	# -- retries ----------------------------------------------------------

	def test_retry_replays_the_original_pipeline_without_a_second_note(self):
		"""The website re-POSTs after a timeout. The second call must be inert."""
		payload = self.consultation_payload()
		first, _ = self.post(payload)
		notes_before = len(self.notes_on(first["pipeline"]))

		second, status = self.post(payload)
		third, _ = self.post(payload)

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])
		self.assertEqual(second["contact"], first["contact"])
		self.assertEqual(third["pipeline"], first["pipeline"])
		# The whole point: a retry adds nothing.
		self.assertEqual(len(self.notes_on(first["pipeline"])), notes_before, "a retry must not add a note")
		self.assertEqual(self.deal_count(), 1)

	def test_a_different_form_is_not_a_retry(self):
		"""The same person on a second form still gets their answers recorded.

		This is the boundary the fingerprint exists to draw: identical payload =
		retry (silent), different form_type = a real second inquiry (noted).
		"""
		consult = self.consultation_payload()
		first, _ = self.post(consult)
		notes_before = len(self.notes_on(first["pipeline"]))

		second, _ = self.post(self.evaluation_payload(email=consult["email"], mobile_no=consult["mobile_no"]))

		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])
		self.assertEqual(len(self.notes_on(first["pipeline"])), notes_before + 1)

	def test_retry_wins_over_the_closed_rule(self):
		"""The one case where the two rules disagree — pinned deliberately.

		A closed pipeline normally means "create a new one". A retry means "we
		already answered this". Inside the window the retry wins, because the
		alternative is a fresh pipeline for every retried request.
		"""
		payload = self.consultation_payload()
		first, _ = self.post(payload)
		self.close_deal(first["pipeline"])

		second, status = self.post(payload)

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"], "a retry must not mint a second pipeline")
		self.assertEqual(self.deal_count(), 1)

	def test_retry_outside_the_window_is_a_fresh_inquiry(self):
		payload = self.consultation_payload()
		first, _ = self.post(payload)
		self._age_submission_log()
		before = len(self.notes_on(first["pipeline"]))

		second, _ = self.post(payload)

		self.assertTrue(second["duplicate"])
		self.assertEqual(second["pipeline"], first["pipeline"])
		self.assertEqual(len(self.notes_on(first["pipeline"])), before + 1, "outside the window it is real")

	def test_retry_after_a_rejection_is_allowed_to_fail_again(self):
		"""A 400 must not be replayed as a success."""
		bad = self.consultation_payload(mobile_no="12345")
		_first, status1 = self.post(bad)
		_second, status2 = self.post(bad)
		self.assertEqual(status1, 400)
		self.assertEqual(status2, 400)

	def test_retry_is_scoped_to_the_key(self):
		"""Two tenants posting identical details are not each other's retries."""
		other_key = frappe.get_doc(
			{
				"doctype": "CRM Web Lead Key",
				"key_name": "_Test Second Website Key",
				"crm_company": OTHER_COMPANY,
				"is_active": 1,
				"api_key": "second-test-key-bbbbbbbbbbbb",
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()
		try:
			payload = self.consultation_payload()
			first, _ = self.post(payload)
			second, status = self.post(payload, api_key="second-test-key-bbbbbbbbbbbb")

			self.assertEqual(status, 200)
			self.assertFalse(second["duplicate"], "a different tenant is not a retry")
			self.assertNotEqual(second["pipeline"], first["pipeline"])
			self.assertNotEqual(second["contact"], first["contact"])
			self.assertEqual(
				frappe.db.get_value("CRM Deal", second["pipeline"], "crm_company"), OTHER_COMPANY
			)
		finally:
			frappe.delete_doc("CRM Web Lead Key", other_key.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	# -- rate limiting ----------------------------------------------------

	def test_rate_limit_fires(self):
		"""30 requests per minute per IP, then refuse.

		Uses an invalid payload so the 31 calls stay cheap — the limiter runs in the
		decorator, before any validation, so a rejected body exercises it just as
		well as a valid one and creates no pipelines.
		"""
		bad = self.consultation_payload(mobile_no="nope")
		for _ in range(30):
			self.post(bad, ip="198.51.100.200")

		with self.assertRaises(frappe.RateLimitExceededError):
			self.post(bad, ip="198.51.100.200")

	def test_rate_limit_is_per_ip(self):
		"""One noisy website must not lock out another tenant's site."""
		bad = self.consultation_payload(mobile_no="nope")
		for _ in range(30):
			self.post(bad, ip="198.51.100.201")

		# A different IP still gets through.
		_result, status = self.post(self.consultation_payload(), ip="198.51.100.202")
		self.assertEqual(status, 200)

	def test_unknown_form_type_is_accepted(self):
		"""A new form on the website must not start dropping inquiries."""
		result, status = self.post(self.consultation_payload(form_type="brochure_download"))
		self.assertEqual(status, 200)
		self.assertEqual(
			frappe.db.get_value("CRM Deal", result["pipeline"], "custom_form_type"), "brochure_download"
		)
