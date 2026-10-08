# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Create Pipeline form: clean input, duplicate matching, company scoping, note."""

import frappe
from frappe.tests.utils import FrappeTestCase

from xbr_crm.api.pipeline_entry import clean_mobile, find_duplicates, search_contacts
from xbr_crm.fcrm.doctype.crm_deal.crm_deal import create_deal

CO_A = "_Test Entry Co A"
CO_B = "_Test Entry Co B"
USER_A = "test_entry_a@example.com"


class TestPipelineEntry(FrappeTestCase):
	def setUp(self):
		frappe.set_user("Administrator")
		for company in (CO_A, CO_B):
			if not frappe.db.exists("CRM Company", company):
				frappe.get_doc({"doctype": "CRM Company", "company_name": company}).insert(
					ignore_permissions=True
				)
		if not frappe.db.exists("User", USER_A):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": USER_A,
					"first_name": "Entry",
					"send_welcome_email": 0,
					"roles": [{"role": "Sales User"}],
				}
			).insert(ignore_permissions=True)
		if not frappe.db.exists("CRM Company Member", USER_A):
			frappe.get_doc({"doctype": "CRM Company Member", "user": USER_A, "company": CO_A}).insert(
				ignore_permissions=True
			)
		self.made = []

	def tearDown(self):
		frappe.set_user("Administrator")
		for doctype, name in reversed(self.made):
			if doctype == "CRM Deal":
				frappe.db.delete("FCRM Note", {"reference_docname": name})
				frappe.db.delete("CRM Contacts", {"parent": name})
				frappe.db.delete("CRM Status Change Log", {"parent": name})
				frappe.db.delete("ToDo", {"reference_name": name})
			frappe.db.delete(doctype, {"name": name})
		frappe.db.commit()

	def contact(self, first, mobile=None, email=None, company=CO_A):
		doc = frappe.get_doc({"doctype": "Contact", "first_name": first, "crm_company": company})
		if mobile:
			doc.append("phone_nos", {"phone": mobile, "is_primary_mobile_no": 1})
		if email:
			doc.append("email_ids", {"email_id": email, "is_primary": 1})
		doc.insert(ignore_permissions=True)
		self.made.append(("Contact", doc.name))
		return doc.name

	def deal(self, values):
		stage = frappe.get_all(
			"CRM Deal Status", {"type": "Open"}, pluck="name", order_by="position asc", limit=1
		)[0]
		name = create_deal({"status": stage, **values})
		deal = frappe.get_doc("CRM Deal", name)
		self.made.append(("CRM Deal", name))
		for row in deal.contacts:
			if not any(row.contact == n for _, n in self.made):
				self.made.append(("Contact", row.contact))
		if deal.organization and not any(deal.organization == n for _, n in self.made):
			self.made.append(("CRM Organization", deal.organization))
		return deal

	# --- input clean-up --------------------------------------------------

	def test_indian_mobiles_in_any_format_become_plus_91(self):
		for raw in ("9876543210", "98765 43210", "+91 98765-43210", "09876543210", "919876543210"):
			self.assertEqual(clean_mobile(raw), "+919876543210", raw)

	def test_international_numbers_need_a_plus(self):
		self.assertEqual(clean_mobile("+44 20 7946 0958"), "+442079460958")
		self.assertIsNone(clean_mobile(""))
		for bad in ("12345", "abc", "5555555555"):
			with self.assertRaises(frappe.ValidationError, msg=bad):
				clean_mobile(bad)

	def test_bad_email_is_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			create_deal({"first_name": "X", "email": "not-an-email"})

	# --- duplicates ------------------------------------------------------

	def test_duplicate_found_whatever_the_mobile_format(self):
		existing = self.contact("Riya", mobile="98765 43210")
		frappe.set_user(USER_A)
		found = find_duplicates(mobile_no="+91-9876543210")
		self.assertEqual([(d["name"], d["matched_on"]) for d in found], [(existing, "mobile")])

	def test_duplicate_by_email_is_case_insensitive(self):
		existing = self.contact("Riya", email="riya@acme.in")
		frappe.set_user(USER_A)
		self.assertEqual([d["name"] for d in find_duplicates(email="RIYA@acme.in")], [existing])

	def test_other_companys_contact_is_not_a_duplicate(self):
		self.contact("Other", mobile="9876500000", company=CO_B)
		frappe.set_user(USER_A)
		self.assertEqual(find_duplicates(mobile_no="9876500000"), [])

	def test_new_pipeline_reuses_this_companys_contact(self):
		existing = self.contact("Riya", mobile="9876511111")
		frappe.set_user(USER_A)
		deal = self.deal({"first_name": "Riya", "mobile_no": "+91 98765 11111"})
		self.assertEqual(deal.contacts[0].contact, existing)

	def test_never_links_another_companys_contact(self):
		other = self.contact("Other", mobile="9876522222", company=CO_B)
		frappe.set_user(USER_A)
		deal = self.deal({"first_name": "Mine", "mobile_no": "9876522222"})
		self.assertNotEqual(deal.contacts[0].contact, other)
		self.assertEqual(frappe.db.get_value("Contact", deal.contacts[0].contact, "crm_company"), CO_A)

	def test_create_anyway_makes_a_new_contact(self):
		existing = self.contact("Riya", mobile="9876533333")
		frappe.set_user(USER_A)
		deal = self.deal({"first_name": "Riya", "mobile_no": "9876533333", "create_new_contact": 1})
		self.assertNotEqual(deal.contacts[0].contact, existing)

	def test_mobile_is_stored_normalised(self):
		frappe.set_user(USER_A)
		deal = self.deal({"first_name": "Norm", "mobile_no": "098765 44444"})
		contact = frappe.get_doc("Contact", deal.contacts[0].contact)
		self.assertEqual(contact.mobile_no, "+919876544444")

	# --- organisation ----------------------------------------------------

	def test_organisation_reused_only_within_the_company(self):
		frappe.set_user("Administrator")
		other = frappe.get_doc(
			{"doctype": "CRM Organization", "organization_name": "_Test Shared Name", "crm_company": CO_B}
		).insert(ignore_permissions=True)
		self.made.append(("CRM Organization", other.name))
		frappe.set_user(USER_A)
		# Another company's organisation of the same name is never linked...
		with self.assertRaisesRegex(frappe.ValidationError, "already exists in another company"):
			self.deal({"organization_name": "_Test Shared Name"})
		# ...and this company's own is reused.
		mine = self.deal({"organization_name": "_Test Mine Org"}).organization
		self.assertEqual(frappe.db.get_value("CRM Organization", mine, "crm_company"), CO_A)
		self.assertEqual(self.deal({"organization_name": "_Test Mine Org"}).organization, mine)

	# --- details and note ------------------------------------------------

	def test_value_date_and_note_are_saved(self):
		frappe.set_user(USER_A)
		deal = self.deal(
			{
				"first_name": "Valued",
				"deal_value": 250000,
				"expected_closure_date": "2026-12-31",
				"probability": 40,
				"next_step": "Send quotation",
				"note": "Met at the expo.\nWants a demo.",
			}
		)
		self.assertEqual(deal.deal_value, 250000)
		self.assertEqual(str(deal.expected_closure_date), "2026-12-31")
		self.assertEqual(deal.next_step, "Send quotation")
		note = frappe.get_all(
			"FCRM Note", {"reference_docname": deal.name}, ["title", "content", "reference_doctype"]
		)
		self.assertEqual(len(note), 1)
		self.assertEqual(note[0].title, "Met at the expo.")
		self.assertIn("Wants a demo.", note[0].content)
		self.assertEqual(note[0].reference_doctype, "CRM Deal")

	def test_no_note_when_left_empty(self):
		frappe.set_user(USER_A)
		deal = self.deal({"first_name": "Quiet", "note": "  "})
		self.assertFalse(frappe.db.exists("FCRM Note", {"reference_docname": deal.name}))

	def test_contact_search_by_name_email_or_mobile(self):
		existing = self.contact("Searchable", mobile="9876555555", email="find.me@acme.in")
		frappe.set_user(USER_A)
		for txt in ("Searchable", "find.me@", "55555"):
			self.assertIn(existing, [c["name"] for c in search_contacts(txt)], txt)
