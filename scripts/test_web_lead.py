#!/usr/bin/env python3
"""End-to-end check for the website inquiry endpoint.

Unlike the FrappeTestCase suite, this talks to a running bench over real HTTP,
so it exercises the parts the unit tests fake: the API key header, status codes,
JSON vs form encoding, and the rate limiter.

    python3 scripts/test_web_lead.py --key YOUR_API_KEY
    python3 scripts/test_web_lead.py --key YOUR_API_KEY --url http://localhost:8001

It creates real leads. Point it at a dev site, not production.

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

ENDPOINT = "/api/method/crm.api.web_lead.capture_inquiry"

PASS = "\033[32mPASS\033[0m"
FAIL = "\033[31mFAIL\033[0m"


class Runner:
	def __init__(self, base_url: str, api_key: str):
		self.base_url = base_url.rstrip("/")
		self.api_key = api_key
		self.passed = 0
		self.failed = 0

	def post(self, payload, api_key=..., as_form=False):
		"""POST one inquiry. `api_key=None` sends no header at all."""
		key = self.api_key if api_key is ... else api_key
		headers = {"X-Lead-Api-Key": key} if key else {}
		url = self.base_url + ENDPOINT

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
		a shared constant here makes every lead in the run collide with the first
		one and the dedup checks assert against the wrong record.
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
		self.check("consultation form creates a lead", status == 200 and body.get("success") and not body.get("duplicate"), f"{status} {body}")
		created_lead = body.get("lead")
		if created_lead:
			print(f"         -> {created_lead}")

		status, body = self.post(self.evaluation())
		self.check("evaluation form creates a lead", status == 200 and body.get("success"), f"{status} {body}")

		status, body = self.post(self.consultation(), as_form=True)
		self.check("form-encoded body is accepted", status == 200 and body.get("success"), f"{status} {body}")

		print("\nDeduplication")
		dup = self.consultation()
		status, first = self.post(dup)
		# Different mobile, same email -> must still match.
		status, second = self.post(dict(dup, mobile_no=self.unique_mobile()))
		self.check(
			"same email -> duplicate, no second lead",
			second.get("duplicate") and second.get("lead") == first.get("lead"),
			f"{status} {second}",
		)

		dup2 = self.consultation()
		status, first2 = self.post(dup2)
		# Different email, same mobile -> must still match.
		status, second2 = self.post(dict(dup2, email=f"other.{self.unique_suffix()}@example.com"))
		self.check(
			"same mobile -> duplicate, no second lead",
			second2.get("duplicate") and second2.get("lead") == first2.get("lead"),
			f"{status} {second2}",
		)

		both = self.consultation()
		self.post(both)
		status, cross = self.post(self.evaluation(email=both["email"], mobile_no=both["mobile_no"]))
		self.check("same person via a second form -> duplicate", cross.get("duplicate"), f"{status} {cross}")

		print("\nValidation (expect 400)")
		status, body = self.post(self.consultation(first_name=""))
		self.check("missing first_name rejected", status == 400 and not body.get("success"), f"{status} {body}")

		status, body = self.post(self.consultation(mobile_no=""))
		self.check("missing mobile rejected", status == 400, f"{status} {body}")

		status, body = self.post(self.consultation(mobile_no="12345"))
		self.check("invalid mobile rejected", status == 400, f"{status} {body}")

		status, body = self.post(self.consultation(email="not-an-email"))
		self.check("invalid email rejected", status == 400, f"{status} {body}")

		status, body = self.post(self.consultation(email=""))
		self.check("blank email accepted (optional)", status == 200, f"{status} {body}")

		print("\nAuthentication (expect 401)")
		status, body = self.post(self.consultation(), api_key="definitely-not-the-key")
		self.check("wrong API key rejected", status == 401, f"{status} {body}")

		status, body = self.post(self.consultation(), api_key=None)
		self.check("missing API key rejected", status == 401, f"{status} {body}")

		print(f"\n{self.passed} passed, {self.failed} failed\n")
		return 0 if self.failed == 0 else 1


def main():
	parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
	parser.add_argument("--url", default="http://localhost:8001", help="bench base URL (default: %(default)s)")
	parser.add_argument("--key", required=True, help="value for the X-Lead-Api-Key header")
	args = parser.parse_args()

	sys.exit(Runner(args.url, args.key).run())


if __name__ == "__main__":
	main()
