"""Classify the free-text values in `CRM Lead.organization`.

`organization` is a `Data` field on Lead while `CRM Deal.organization` is a
proper `Link`. Converting it is tractable because `CRM Organization` autonames
from `organization_name`, so for any organization that already exists the stored
text and the docname are the same string.

The danger is not data loss — it is that a lead holding a name with no matching
organization becomes permanently unsaveable once the fieldtype flips: link
validation then fails on every later save, including an unrelated status change.

Run this before changing anything:

    bench --site <site> execute \
        crm.fcrm.doctype.crm_lead.lead_organization_migration.classify

Buckets:
  exact      the value already is an organization docname — nothing to do
  variant    differs only by case/whitespace/punctuation — repoint to canonical
  missing    no match — the organization must be created
  unnameable cannot be a docname at all — must be nulled, with a log entry
"""

import re

import frappe

# Frappe rejects these in a docname (frappe.model.naming.validate_name), and a
# very long value cannot be a name either.
ILLEGAL_IN_NAME = re.compile(r"[<>;?#%\"\n]")
MAX_NAME_LENGTH = 140


def normalise(value: str) -> str:
	"""Case, whitespace and trailing punctuation only.

	Deliberately does NOT strip legal suffixes — "Acme Inc" and "Acme Ltd" are
	different companies and must not be collapsed into one.
	"""
	return re.sub(r"[\s.,]+", " ", (value or "")).strip().casefold()


def classify():
	rows = frappe.db.sql(
		"""
		select organization as value, count(*) as cnt
		from `tabCRM Lead`
		where ifnull(organization, '') != ''
		group by organization
		""",
		as_dict=True,
	)

	names = frappe.get_all("CRM Organization", pluck="name")
	exact_names = set(names)
	by_normalised = {normalise(n): n for n in names}

	report = {"exact": [], "variant": [], "missing": [], "unnameable": []}

	for row in rows:
		value = (row.value or "").strip()
		if value in exact_names:
			report["exact"].append({"value": value, "leads": row.cnt})
		elif normalise(value) in by_normalised:
			report["variant"].append(
				{
					"value": value,
					"canonical": by_normalised[normalise(value)],
					"leads": row.cnt,
				}
			)
		elif len(value) > MAX_NAME_LENGTH or ILLEGAL_IN_NAME.search(value):
			report["unnameable"].append({"value": value, "leads": row.cnt})
		else:
			report["missing"].append({"value": value, "leads": row.cnt})

	print("CRM Lead.organization — migration readiness\n")
	for bucket in ("exact", "variant", "missing", "unnameable"):
		entries = report[bucket]
		leads = sum(e["leads"] for e in entries)
		print(f"  {bucket:11} {len(entries):3} distinct value(s), {leads:4} lead(s)")
		for e in entries:
			extra = f"  -> {e['canonical']}" if "canonical" in e else ""
			print(f"                  {e['value']!r} x{e['leads']}{extra}")

	if report["unnameable"]:
		print(
			"\n  STOP: the values above cannot become docnames. Converting the "
			"fieldtype would null them and leave those leads without an "
			"organization. Resolve them by hand first."
		)
	else:
		print("\n  Safe to convert: every value can be resolved to a real organization.")

	return report
