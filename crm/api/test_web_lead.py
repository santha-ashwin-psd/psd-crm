# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Tests for the website inquiry endpoint.

`capture_inquiry` reads the API key from the real request header and writes the
HTTP status onto `frappe.local.response`, so the tests drive it through a small
harness that fakes both rather than going over the network — that keeps the
assertions on OUR logic (tenancy, dedup, normalisation) instead of on werkzeug.

The end-to-end HTTP path is covered separately by scripts/test_web_lead.py.
"""

import frappe
from frappe.tests.utils import FrappeTestCase

from crm.api import web_lead
from crm.api.web_lead import capture_inquiry, normalize_mobile

TEST_COMPANY = "_Test Web Lead Co"
OTHER_COMPANY = "_Test Other Co"
TEST_KEY = "test-secret-key-aaaaaaaaaaaa"
OWNER_USER = "test_weblead_owner@example.com"


class _FakeHeaders(dict):
	def get(self, key, default=None):
		# Header lookup is case-insensitive in werkzeug; mirror that.
		for k, v in self.items():
			if k.lower() == key.lower():
				return v
		return default


class _FakeRequest:
	"""Just enough of a werkzeug request for the code paths a lead insert touches.

	`host` is not optional despite us never reading it: creating a lead fires the
	assignment rule, which queues a notification email, which builds a document URL
	via `get_host_name_from_request()` — and that reads `frappe.local.request.host`
	directly. A real request always has one.
	"""

	def __init__(self, headers):
		self.headers = _FakeHeaders(headers)
		self.host = "crm.local"
		self.method = "POST"
		self.url = "http://crm.local/api/method/crm.api.web_lead.capture_inquiry"
		self.environ = {"REMOTE_ADDR": "203.0.113.10"}


class TestWebLead(FrappeTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		frappe.set_user("Administrator")

		if not frappe.db.exists("User", OWNER_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": OWNER_USER,
					"first_name": "Weblead",
					"last_name": "Owner",
					"send_welcome_email": 0,
					"roles": [{"role": "Sales User"}],
				}
			).insert(ignore_permissions=True)

		for company in (TEST_COMPANY, OTHER_COMPANY):
			if not frappe.db.exists("CRM Company", company):
				frappe.get_doc(
					{
						"doctype": "CRM Company",
						"company_name": company,
						"is_active": 1,
						"owner_user": OWNER_USER,
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
		frappe.db.delete("CRM Lead", {"crm_company": ("in", [TEST_COMPANY, OTHER_COMPANY])})
		frappe.db.delete("CRM Web Lead Log", {"crm_company": ("in", [TEST_COMPANY, OTHER_COMPANY])})
		for doctype, name in (
			("CRM Web Lead Key", "_Test Website Key"),
			("CRM Company", TEST_COMPANY),
			("CRM Company", OTHER_COMPANY),
		):
			if frappe.db.exists(doctype, name):
				frappe.delete_doc(doctype, name, force=True, ignore_permissions=True)
		frappe.db.commit()
		super().tearDownClass()

	def setUp(self):
		# Every test starts from a clean slate of leads for this tenant, so dedup
		# assertions cannot be polluted by a previous test's lead.
		frappe.db.delete("CRM Lead", {"crm_company": ("in", [TEST_COMPANY, OTHER_COMPANY])})
		frappe.db.delete("CRM Web Lead Log", {"crm_company": ("in", [TEST_COMPANY, OTHER_COMPANY])})
		frappe.db.commit()
		# The suite makes more calls per minute than the endpoint's own rate limit
		# allows, so without this the later tests fail on RateLimitExceededError
		# rather than on what they are testing. `rl:` is the prefix
		# frappe.rate_limiter builds its cache keys with.
		frappe.cache.delete_keys("rl:")
		self._orig_request = getattr(frappe.local, "request", None)
		self._orig_ip = getattr(frappe.local, "request_ip", None)

	def tearDown(self):
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

	# -- happy paths ------------------------------------------------------

	def test_valid_consultation_lead(self):
		result, status = self.post(self.consultation_payload())

		self.assertEqual(status, 200)
		self.assertTrue(result["success"])
		self.assertFalse(result["duplicate"])

		lead = frappe.get_doc("CRM Lead", result["lead"])
		self.assertEqual(lead.first_name, "Arun")  # title-cased
		self.assertEqual(lead.last_name, "Kumar")
		self.assertEqual(lead.email, "arun.kumar@example.com")  # lower-cased
		self.assertEqual(lead.mobile_no, "+919876543210")  # normalised
		self.assertEqual(lead.custom_city, "Chennai")
		self.assertEqual(lead.custom_form_type, "consultation")
		self.assertEqual(lead.custom_utm_source, "google")
		self.assertEqual(lead.source, "Website")
		# Not set by us — the controller's own default must still win.
		self.assertEqual(lead.status, "New")

	def test_valid_evaluation_lead(self):
		result, status = self.post(self.evaluation_payload())

		self.assertEqual(status, 200)
		lead = frappe.get_doc("CRM Lead", result["lead"])
		self.assertEqual(lead.custom_highest_qualification, "Bachelors")
		self.assertEqual(lead.custom_course_level, "Masters")
		self.assertEqual(lead.custom_preferred_state, "Victoria")
		self.assertEqual(lead.custom_start_timeline, "2027 Intake")
		self.assertEqual(lead.custom_form_type, "evaluation")

	def test_tenant_and_owner_are_set(self):
		"""The two things that decide whether anyone can SEE the lead."""
		result, _status = self.post(self.consultation_payload())
		lead = frappe.get_doc("CRM Lead", result["lead"])

		# Without this the lead is invisible under tenancy_strict.
		self.assertEqual(lead.crm_company, TEST_COMPANY)
		# "Never leave a web lead unowned" — falls back to CRM Company.owner_user.
		self.assertTrue(lead.lead_owner)
		self.assertEqual(lead.lead_owner, OWNER_USER)

	def test_form_encoded_and_nested_payloads_both_work(self):
		"""A caller may post flat fields or {"data": {...}}."""
		import json as _json

		result, status = self.post(
			{
				"data": _json.dumps(
					self.consultation_payload(email="nested@example.com", mobile_no="9876500099")
				)
			}
		)
		self.assertEqual(status, 200)
		self.assertEqual(frappe.db.get_value("CRM Lead", result["lead"], "email"), "nested@example.com")

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

	def test_email_is_optional(self):
		_result, status = self.post(self.consultation_payload(email=""))
		self.assertEqual(status, 200)

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

	# -- dedup ------------------------------------------------------------

	def test_duplicate_by_email(self):
		first, _ = self.post(self.consultation_payload())
		second, status = self.post(self.consultation_payload(mobile_no="9876500002"))

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"])
		self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": TEST_COMPANY}), 1)

	def test_duplicate_by_mobile(self):
		first, _ = self.post(self.consultation_payload())
		second, status = self.post(self.consultation_payload(email="different@example.com"))

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"])

	def test_same_person_submits_both_forms(self):
		"""The case this dedup rule exists for."""
		first, _ = self.post(self.consultation_payload())
		second, _ = self.post(self.evaluation_payload(email="arun.kumar@example.com", mobile_no="9876543210"))

		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"])
		self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": TEST_COMPANY}), 1)

		# The second form's answers must not be lost — they go on as a note.
		notes = frappe.get_all(
			"FCRM Note",
			filters={"reference_doctype": "CRM Lead", "reference_docname": first["lead"]},
			fields=["title", "content"],
		)
		self.assertTrue(notes)
		self.assertIn("Masters", notes[0].content)

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

	def test_converted_lead_does_not_block_a_new_one(self):
		first, _ = self.post(self.consultation_payload())
		frappe.db.set_value("CRM Lead", first["lead"], "converted", 1)
		frappe.db.commit()
		# A real later re-inquiry, not a transport retry — see
		# test_retry_wins_over_the_converted_rule for the other side of this.
		self._age_submission_log()

		second, status = self.post(self.consultation_payload())

		self.assertEqual(status, 200)
		self.assertFalse(second["duplicate"])
		self.assertNotEqual(second["lead"], first["lead"])
		# ...and the new lead points back at the old one.
		notes = frappe.get_all(
			"FCRM Note",
			filters={"reference_doctype": "CRM Lead", "reference_docname": second["lead"]},
			pluck="content",
		)
		self.assertTrue(any(first["lead"] in n for n in notes))

	def test_dedup_is_scoped_to_the_tenant(self):
		"""A different company's lead with the same email is NOT a duplicate."""
		other = frappe.get_doc(
			{
				"doctype": "CRM Lead",
				"first_name": "Arun",
				"email": "arun.kumar@example.com",
				"mobile_no": "+919876543210",
				"crm_company": OTHER_COMPANY,
			}
		).insert(ignore_permissions=True)
		frappe.db.commit()

		result, status = self.post(self.consultation_payload())

		self.assertEqual(status, 200)
		self.assertFalse(result["duplicate"])
		self.assertNotEqual(result["lead"], other.name)

	# -- auth -------------------------------------------------------------

	def test_wrong_api_key_is_401(self):
		result, status = self.post(self.consultation_payload(), api_key="wrong-key")
		self.assertEqual(status, 401)
		self.assertFalse(result["success"])
		self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": TEST_COMPANY}), 0)

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
			self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": TEST_COMPANY}), 0)
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

	def test_payload_cannot_set_arbitrary_lead_fields(self):
		"""Only FIELD_MAP keys are written — not status, converted or crm_company."""
		result, status = self.post(
			self.consultation_payload(
				status="Qualified", converted=1, crm_company=OTHER_COMPANY, lead_owner="Administrator"
			)
		)
		self.assertEqual(status, 200)
		lead = frappe.get_doc("CRM Lead", result["lead"])
		self.assertEqual(lead.status, "New")
		self.assertFalse(lead.converted)
		self.assertEqual(lead.crm_company, TEST_COMPANY)
		self.assertEqual(lead.lead_owner, OWNER_USER)

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

	# -- caller tolerance (Zapier) ----------------------------------------

	def test_unknown_fields_are_ignored_not_rejected(self):
		"""Zapier sends its own bookkeeping fields alongside the mapped ones."""
		result, status = self.post(
			self.consultation_payload(
				zap_id="01HXYZ", zap_meta="whatever", attempt="2", **{"Raw Body": "{...}"}
			)
		)
		self.assertEqual(status, 200)
		self.assertTrue(result["success"])

	def test_empty_strings_are_treated_as_missing(self):
		"""An unmapped Zapier field arrives as "" rather than being absent."""
		result, status = self.post(self.consultation_payload(last_name="", email="", city="", utm_source=""))
		self.assertEqual(status, 200)
		lead = frappe.get_doc("CRM Lead", result["lead"])
		self.assertFalse(lead.last_name)
		self.assertFalse(lead.email)
		self.assertFalse(lead.custom_city)

	def test_blank_words_are_treated_as_missing(self):
		"""A Zap that stringifies an absent value sends the word, not "".

		Storing the literal text "null" in a lead's city is worse than storing
		nothing, and it would also defeat the email/mobile validation below.
		"""
		result, status = self.post(self.consultation_payload(city="null", email="undefined"))
		self.assertEqual(status, 200, "a blank-word email must not fail validation")
		lead = frappe.get_doc("CRM Lead", result["lead"])
		self.assertFalse(lead.custom_city)
		self.assertFalse(lead.email)

	def test_whitespace_only_required_field_is_rejected(self):
		_result, status = self.post(self.consultation_payload(first_name="   "))
		self.assertEqual(status, 400)

	def test_errors_carry_a_machine_readable_code(self):
		"""A Zap filter needs something stabler than a translated sentence."""
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

	def test_retry_replays_the_original_lead_without_a_second_note(self):
		"""Zapier re-POSTs after a timeout. The second call must be inert."""
		payload = self.consultation_payload()
		first, _ = self.post(payload)

		def note_count():
			return frappe.db.count(
				"FCRM Note",
				{"reference_doctype": "CRM Lead", "reference_docname": first["lead"]},
			)

		notes_before = note_count()

		second, status = self.post(payload)
		third, _ = self.post(payload)

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"])
		self.assertEqual(third["lead"], first["lead"])
		# The whole point: a retry adds nothing.
		self.assertEqual(note_count(), notes_before, "a retry must not add another note")
		self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": TEST_COMPANY}), 1)

	def test_a_different_form_is_not_a_retry(self):
		"""The same person on a second form still gets their answers recorded.

		This is the boundary the fingerprint exists to draw: identical payload =
		retry (silent), different form_type = a real second inquiry (noted).
		"""
		consult = self.consultation_payload()
		first, _ = self.post(consult)

		evaluation = self.evaluation_payload(email=consult["email"], mobile_no=consult["mobile_no"])
		second, _ = self.post(evaluation)

		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"])
		notes = frappe.get_all(
			"FCRM Note",
			filters={"reference_doctype": "CRM Lead", "reference_docname": first["lead"]},
			pluck="content",
		)
		self.assertTrue(any("Masters" in n for n in notes), "the second form's answers must be kept")

	def test_retry_wins_over_the_converted_rule(self):
		"""The one case where the two rules disagree — pinned deliberately.

		A converted match normally means "create a new lead". A retry means "we
		already answered this". Inside the window the retry wins, because the
		alternative is a fresh duplicate lead for every Zapier retry.
		"""
		payload = self.consultation_payload()
		first, _ = self.post(payload)
		frappe.db.set_value("CRM Lead", first["lead"], "converted", 1)
		frappe.db.commit()

		second, status = self.post(payload)

		self.assertEqual(status, 200)
		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"], "a retry must not mint a second lead")
		self.assertEqual(frappe.db.count("CRM Lead", {"crm_company": TEST_COMPANY}), 1)

	def test_retry_outside_the_window_is_a_fresh_inquiry(self):
		payload = self.consultation_payload()
		first, _ = self.post(payload)
		self._age_submission_log()

		before = frappe.db.count(
			"FCRM Note", {"reference_doctype": "CRM Lead", "reference_docname": first["lead"]}
		)
		second, _ = self.post(payload)

		self.assertTrue(second["duplicate"])
		self.assertEqual(second["lead"], first["lead"])
		after = frappe.db.count(
			"FCRM Note", {"reference_doctype": "CRM Lead", "reference_docname": first["lead"]}
		)
		self.assertEqual(after, before + 1, "outside the window it is a real re-inquiry")

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
			self.assertNotEqual(second["lead"], first["lead"])
			self.assertEqual(frappe.db.get_value("CRM Lead", second["lead"], "crm_company"), OTHER_COMPANY)
		finally:
			frappe.delete_doc("CRM Web Lead Key", other_key.name, force=True, ignore_permissions=True)
			frappe.db.commit()

	# -- rate limiting ----------------------------------------------------

	def test_rate_limit_fires(self):
		"""30 requests per minute per IP, then refuse.

		Uses an invalid payload so the 31 calls stay cheap — the limiter runs in the
		decorator, before any validation, so a rejected body exercises it just as
		well as a valid one and creates no leads.
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
		"""A new form on the website must not start dropping leads."""
		result, status = self.post(self.consultation_payload(form_type="brochure_download"))
		self.assertEqual(status, 200)
		self.assertEqual(
			frappe.db.get_value("CRM Lead", result["lead"], "custom_form_type"), "brochure_download"
		)
