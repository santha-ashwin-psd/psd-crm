#!/usr/bin/env python3
"""End-to-end check for the website inquiry endpoint.

Unlike the FrappeTestCase suite, this talks to a running bench over real HTTP,
so it exercises the parts the unit tests fake: the API key header, status codes,
JSON vs form encoding, and the old pre-rename method path.

    python3 scripts/test_web_lead.py --key YOUR_API_KEY
    python3 scripts/test_web_lead.py --key YOUR_API_KEY --admin-password admin

Every inquiry creates a Pipeline (CRM Deal) and a Contact — never a lead. The
closed-pipeline check has to close a pipeline first, which needs a logged-in
user; pass --admin-password to run it, otherwise it is skipped.

It creates real pipelines. Point it at a dev site, not production.

Exit code is 0 when every check passed, 1 otherwise, so it can gate a deploy.
"""

import argparse
import json
import random
import sys
import uuid

try:
	import requests
except ImportError:
	sys.exit("This script needs `requests`:  pip install requests")

ENDPOINT = "/api/method/xbr_crm.api.web_lead.capture_inquiry"
# The path websites used before the app was renamed from `crm` to `xbr_crm`.
LEGACY_ENDPOINT = "/api/method/crm.api.web_lead.capture_inquiry"

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"
SKIP = "\033[33mSKIP\033[0m"


class Runner:
	def __init__(self, base_url: str, api_key: str, admin_password: str | None = None):
		self.base_url = base_url.rstrip("/")
		self.api_key = api_key
		self.admin_password = admin_password
		self.passed = 0
		self.failed = 0
		self.skipped = 0

	def post(self, payload, api_key=..., as_form=False, endpoint=ENDPOINT):
		"""POST one inquiry. `api_key=None` sends no header at all."""
		key = self.api_key if api_key is ... else api_key
		headers = {"X-Lead-Api-Key": key} if key else {}
		url = self.base_url + endpoint

		try:
			if as_form:
				resp = requests.post(url, data=payload, headers=headers, timeout=30)
			else:
				headers["Content-Type"] = "application/json"
				resp = requests.post(url, data=json.dumps(payload), headers=headers, timeout=30)
		except requests.exceptions.ConnectionError:
			# A traceback here says nothing useful; the bench is simply not up.
			sys.exit(f"\nCannot reach {self.base_url} — is `bench start` running?\n")

		try:
			# Frappe wraps whitelisted return values in {"message": ...}
			body = resp.json()
			body = body.get("message", body)
		except ValueError:
			body = {"_raw": resp.text[:400]}
		return resp.status_code, body

	def skip(self, label, reason):
		self.skipped += 1
		print(f"  {SKIP}  {label} ({reason})")

	def close_pipeline(self, name) -> bool:
		"""Mark a pipeline Won as Administrator, so the next inquiry sees it closed."""
		session = requests.Session()
		login = session.post(
			self.base_url + "/api/method/login",
			json={"usr": "Administrator", "pwd": self.admin_password},
			timeout=30,
		)
		if login.status_code != 200:
			return False
		resp = session.put(
			f"{self.base_url}/api/resource/CRM Deal/{name}",
			json={"status": "Won"},
			timeout=30,
		)
		return resp.status_code == 200

	def check(self, label, condition, detail=""):
		if condition:
			self.passed += 1
			print(f"  {PASS}  {label}")
		else:
			self.failed += 1
			print(f"  {FAIL}  {label}")
			if detail:
				print(f"         {detail}")

	# -- payload builders ---------------------------------------------------

	@staticmethod
	def unique_suffix():
		return uuid.uuid4().hex[:6]

	@staticmethod
	def unique_mobile():
		"""A fresh, valid Indian mobile for every payload.

		This matters more than it looks: the endpoint dedups on email OR mobile, so
		a shared constant here makes every inquiry in the run collide with the
		first one and the dedup checks assert against the wrong record.
		"""
		return "9" + "".join(random.choice("0123456789") for _ in range(9))

	def consultation(self, **overrides):
		n = self.unique_suffix()
		payload = {
			"form_type": "consultation",
			"first_name": "arjun",
			"last_name": "menon",
			"email": f"arjun.{n}@example.com",
			"mobile_no": self.unique_mobile(),
			"city": "Chennai",
			"page_url": "https://ieagents.co.in/",
			"utm_source": "google",
			"utm_medium": "cpc",
			"utm_campaign": "study-abroad-2026",
		}
		payload.update(overrides)
		return payload

	def evaluation(self, **overrides):
		n = self.unique_suffix()
		payload = {
			"form_type": "evaluation",
			"first_name": "Divya",
			"last_name": "Sundaram",
			"email": f"divya.{n}@example.com",
			"mobile_no": self.unique_mobile(),
			"city": "Coimbatore",
			"highest_qualification": "Bachelors in Commerce",
			"course_level": "Masters",
			"preferred_state": "New South Wales",
			"start_timeline": "Feb 2027 Intake",
		}
		payload.update(overrides)
		return payload

	# -- the checks ---------------------------------------------------------

	def run(self):
		print(f"\nTarget: {self.base_url}{ENDPOINT}\n")

		print("Valid submissions")
		payload = self.consultation()
		status, body = self.post(payload)
		self.check(
			"consultation form creates a pipeline",
			status == 200
			and body.get("success")
			and not body.get("duplicate")
			and body.get("pipeline")
			and body.get("contact"),
			f"{status} {body}",
		)
		if body.get("pipeline"):
			print(f"         -> {body['pipeline']} (contact {body.get('contact')})")
		self.check("response never mentions a lead", "lead" not in body, f"{body}")

		status, body = self.post(self.evaluation())
		self.check(
			"evaluation form creates a pipeline", status == 200 and body.get("pipeline"), f"{status} {body}"
		)

		status, body = self.post(self.consultation(form_type="contact"))
		self.check(
			"contact form creates a pipeline", status == 200 and body.get("pipeline"), f"{status} {body}"
		)

		status, body = self.post(self.consultation(), as_form=True)
		self.check("form-encoded body is accepted", status == 200 and body.get("success"), f"{status} {body}")

		status, body = self.post(self.consultation(), endpoint=LEGACY_ENDPOINT)
		self.check(
			"old crm.api.web_lead path still works",
			status == 200 and body.get("pipeline"),
			f"{status} {body}",
		)

		print("\nDuplicates")
		dup = self.consultation()
		status, first = self.post(dup)
		# Different mobile, same email -> must still match.
		status, second = self.post(dict(dup, mobile_no=self.unique_mobile()))
		self.check(
			"same email + open pipeline -> duplicate, no second pipeline",
			second.get("duplicate") and second.get("pipeline") == first.get("pipeline"),
			f"{status} {second}",
		)

		dup2 = self.consultation()
		status, first2 = self.post(dup2)
		# Different email, same mobile -> must still match.
		status, second2 = self.post(dict(dup2, email=f"other.{self.unique_suffix()}@example.com"))
		self.check(
			"same mobile + open pipeline -> duplicate, no second pipeline",
			second2.get("duplicate") and second2.get("pipeline") == first2.get("pipeline"),
			f"{status} {second2}",
		)

		both = self.consultation()
		status, first3 = self.post(both)
		status, cross = self.post(self.evaluation(email=both["email"], mobile_no=both["mobile_no"]))
		self.check(
			"same person via a second form -> noted on the same pipeline",
			cross.get("duplicate") and cross.get("pipeline") == first3.get("pipeline"),
			f"{status} {cross}",
		)

		print("\nRetries")
		retry = self.consultation()
		status, original = self.post(retry)
		status, again = self.post(retry)
		self.check(
			"identical re-POST replays the same pipeline",
			status == 200 and again.get("duplicate") and again.get("pipeline") == original.get("pipeline"),
			f"{status} {again}",
		)

		print("\nClosed pipeline")
		if not self.admin_password:
			self.skip("closed pipeline -> new pipeline", "pass --admin-password to run")
		else:
			closed = self.consultation()
			status, first4 = self.post(closed)
			if not self.close_pipeline(first4.get("pipeline")):
				self.check(
					"closed pipeline -> new pipeline", False, "could not close the pipeline as Administrator"
				)
			else:
				# A different form, so it is a fresh inquiry rather than a retry.
				status, after = self.post(dict(closed, form_type="contact"))
				self.check(
					"closed pipeline -> new pipeline for the same contact",
					status == 200
					and not after.get("duplicate")
					and after.get("pipeline") != first4.get("pipeline")
					and after.get("contact") == first4.get("contact"),
					f"{status} {after}",
				)

		print("\nValidation (expect 400)")
		status, body = self.post(self.consultation(first_name=""))
		self.check(
			"missing first_name rejected", status == 400 and not body.get("success"), f"{status} {body}"
		)

		status, body = self.post(self.consultation(mobile_no=""))
		self.check("missing mobile rejected", status == 400, f"{status} {body}")

		status, body = self.post(self.consultation(mobile_no="12345"))
		self.check(
			"invalid mobile rejected",
			status == 400 and body.get("code") == "invalid_mobile",
			f"{status} {body}",
		)

		status, body = self.post(self.consultation(email="not-an-email"))
		self.check("invalid email rejected", status == 400, f"{status} {body}")

		status, body = self.post(self.consultation(email=""))
		self.check("blank email accepted (optional)", status == 200, f"{status} {body}")

		print("\nAuthentication (expect 401)")
		status, body = self.post(self.consultation(), api_key="definitely-not-the-key")
		self.check(
			"wrong API key rejected",
			status == 401 and body.get("code") == "invalid_api_key",
			f"{status} {body}",
		)

		status, body = self.post(self.consultation(), api_key=None)
		self.check("missing API key rejected", status == 401, f"{status} {body}")

		print(f"\n{self.passed} passed, {self.failed} failed, {self.skipped} skipped\n")
		return 0 if self.failed == 0 else 1


def main():
	parser = argparse.ArgumentParser(
		description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter
	)
	parser.add_argument(
		"--url", default="http://localhost:8002", help="bench base URL (default: %(default)s)"
	)
	parser.add_argument("--key", required=True, help="value for the X-Lead-Api-Key header")
	parser.add_argument(
		"--admin-password", help="Administrator password, to run the closed-pipeline check (dev sites only)"
	)
	args = parser.parse_args()

	sys.exit(Runner(args.url, args.key, args.admin_password).run())


if __name__ == "__main__":
	main()
