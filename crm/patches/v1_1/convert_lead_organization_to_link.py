"""Normalise `CRM Lead.organization` before it becomes a Link.

Runs in [pre_model_sync] so the data is resolved to real docnames *before* the
column type changes. Without this, a lead holding a company name with no
matching organization becomes permanently unsaveable once link validation
applies — every later save fails, including an unrelated status change.

Idempotent: on an already-converted site every value is in the `exact` bucket
and nothing is written.
"""

import click
import frappe

from crm.fcrm.doctype.crm_lead.lead_organization_migration import classify, normalise


def execute():
	if not frappe.db.has_column("CRM Lead", "organization"):
		return

	report = classify()

	# 1. `exact` needs nothing — the stored string already is the docname.

	# 2. Case/whitespace variants point at the canonical organization.
	for entry in report["variant"]:
		frappe.db.sql(
			"update `tabCRM Lead` set organization = %s where organization = %s",
			(entry["canonical"], entry["value"]),
		)
		click.secho(
			f"  repointed {entry['value']!r} -> {entry['canonical']!r}"
			f" on {entry['leads']} lead(s)",
			fg="cyan",
		)

	# 3. No match: create the organization rather than blanking the field.
	#    `organization` feeds lead_name/title and the contact's company_name at
	#    conversion, so clearing it would silently destroy all three.
	created = {}
	for entry in report["missing"]:
		key = normalise(entry["value"])
		name = created.get(key) or _create_organization_from_lead(entry["value"])
		created[key] = name
		frappe.db.sql(
			"update `tabCRM Lead` set organization = %s where organization = %s",
			(name, entry["value"]),
		)
		click.secho(
			f"  created organization {name!r} for {entry['leads']} lead(s)", fg="green"
		)

	# 4. Cannot be a docname at all. Null it, but leave a recoverable record —
	#    otherwise those leads simply stop saving with no explanation.
	for entry in report["unnameable"]:
		leads = frappe.get_all("CRM Lead", filters={"organization": entry["value"]}, pluck="name")
		frappe.db.sql(
			"update `tabCRM Lead` set organization = NULL where organization = %s",
			(entry["value"],),
		)
		frappe.log_error(
			title="CRM Lead organization dropped during Link migration",
			message=f"value={entry['value']!r}\nleads={leads}",
		)
		click.secho(
			f"  dropped {entry['value']!r} from {len(leads)} lead(s) — see Error Log",
			fg="yellow",
		)

	frappe.db.commit()


def _create_organization_from_lead(value):
	"""Seed the new organization from the most recently modified lead using it."""
	seed = (
		frappe.db.get_value(
			"CRM Lead",
			{"organization": value},
			["website", "territory", "industry", "annual_revenue", "no_of_employees"],
			as_dict=True,
			order_by="modified desc",
		)
		or {}
	)

	organization = frappe.new_doc("CRM Organization")
	organization.organization_name = value.strip()
	organization.update({k: v for k, v in seed.items() if v})
	organization.flags.ignore_permissions = True
	organization.flags.ignore_mandatory = True
	organization.insert()
	return organization.name
