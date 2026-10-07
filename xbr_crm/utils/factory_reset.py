"""One-shot factory reset: wipe all CRM data, users and companies.

Deliberately NOT a patch (patches.txt runs on every fresh install too, so a wipe
patch would destroy future deployments) and deliberately NOT whitelisted — this
must be unreachable over HTTP.

    bench --site <site> execute xbr_crm.utils.factory_reset.factory_reset \\
        --kwargs "{'confirm': 'RESET', 'dry_run': True}"

Keeps configuration — statuses, sources, industries, territories, lost reasons,
field layouts, form scripts, standard views, Web Forms, Assignment Rules and
FCRM Settings (minus default_crm_company). Deletes every record, every user
except Administrator/Guest, and every company, so the next signup starts clean.
"""

import frappe

# Doctypes whose rows are removed outright, and whose names are used to find
# dependent activity rows.
CRM_DOCTYPES = (
	"CRM Lead",
	"CRM Deal",
	"CRM Task",
	"FCRM Note",
	"CRM Call Log",
	"CRM Organization",
	"Contact",
	"CRM Sales Hierarchy",
)

# Order matters: CRM Call Log carries a hard Link to FCRM Note, so it must go
# first; deals reference leads, contacts and organizations.
DELETE_ORDER = (
	"CRM Call Log",
	"CRM Task",
	"FCRM Note",
	"Communication",
	"CRM Deal",
	"CRM Lead",
	"Contact",
	"CRM Organization",
)

DEMO_DEFAULT_KEYS = (
	"crm_demo_data_created",
	"crm_demo_leads",
	"crm_demo_notes",
	"crm_demo_tasks",
	"crm_demo_call_logs",
	"crm_demo_activities",
	"crm_demo_deals",
)


def _count(doctype: str) -> int:
	try:
		return frappe.db.count(doctype)
	except Exception:
		return 0


def factory_reset(confirm: str = "", dry_run: bool = False) -> dict:
	if confirm != "RESET":
		frappe.throw("Refusing to run. Pass confirm='RESET' to proceed.")

	before = {dt: _count(dt) for dt in CRM_DOCTYPES}
	before["Communication"] = _count("Communication")
	before["CRM Company"] = _count("CRM Company")
	before["CRM Company Member"] = _count("CRM Company Member")
	before["User (deletable)"] = len(_deletable_users())

	if dry_run:
		print("DRY RUN — nothing written. Would delete:")
		for k, v in before.items():
			print(f"  {k:24s} {v}")
		return before

	frappe.flags.in_bulk_delete = True

	_sweep_activity()
	_delete_documents()
	_reset_tenancy()
	_delete_users()
	_clear_demo_defaults()
	sweep_logs()

	frappe.db.commit()
	frappe.clear_cache()

	after = {dt: _count(dt) for dt in CRM_DOCTYPES}
	after["CRM Company"] = _count("CRM Company")
	after["CRM Company Member"] = _count("CRM Company Member")
	after["Users remaining"] = frappe.db.count("User")

	print("Factory reset complete.")
	for k, v in after.items():
		print(f"  {k:24s} {v}")
	return after


def _sweep_activity():
	"""Raw deletes of child/activity rows — no hooks, no link checks.

	Dynamic Link and Communication Link need explicit removal: neither is in
	Frappe's ignore_links_on_delete, so leftovers would block document deletes.
	"""
	frappe.db.delete("CRM Notification")
	frappe.db.delete("CRM Status Change Log", {"parenttype": ["in", ("CRM Lead", "CRM Deal")]})
	frappe.db.delete("Dynamic Link", {"link_doctype": ["in", CRM_DOCTYPES]})
	frappe.db.delete("Communication Link", {"link_doctype": ["in", CRM_DOCTYPES]})
	# ToDo's column is reference_type, not reference_doctype.
	frappe.db.delete("ToDo", {"reference_type": ["in", CRM_DOCTYPES]})
	frappe.db.delete("Comment", {"reference_doctype": ["in", CRM_DOCTYPES]})
	frappe.db.delete("Version", {"ref_doctype": ["in", CRM_DOCTYPES]})
	frappe.db.delete("Tag Link", {"document_type": ["in", CRM_DOCTYPES]})
	frappe.db.delete("Notification Log", {"document_type": ["in", CRM_DOCTYPES]})

	# Files go through delete_doc so the blobs on disk go too.
	for name in frappe.get_all(
		"File", filters={"attached_to_doctype": ["in", CRM_DOCTYPES]}, pluck="name"
	):
		_delete(("File", name))

	frappe.db.commit()


def _delete_documents():
	for doctype in DELETE_ORDER:
		if not frappe.db.table_exists(doctype):
			continue
		filters = None
		if doctype == "Communication":
			filters = {"reference_doctype": ["in", CRM_DOCTYPES]}
		names = frappe.get_all(doctype, filters=filters, pluck="name")
		for name in names:
			_delete((doctype, name))
		frappe.db.commit()

	# NestedSet: its on_trash rebuilds lft/rgt and fights a bulk delete, so the
	# whole tree goes out in one raw statement instead.
	if frappe.db.table_exists("CRM Sales Hierarchy"):
		frappe.db.delete("CRM Sales Hierarchy")
		frappe.db.commit()


def _reset_tenancy():
	# Clear the default BEFORE deleting the company, or tenancy.default_company()
	# would stamp new records with a company that no longer exists.
	frappe.db.set_single_value("FCRM Settings", "default_crm_company", None)
	# Raw: skips _sync_user_role and takes orphan rows (user already deleted) too.
	frappe.db.delete("CRM Company Member")
	if frappe.db.table_exists("CRM Invitation"):
		frappe.db.delete("CRM Invitation")
	for name in frappe.get_all("CRM Company", pluck="name"):
		_delete(("CRM Company", name))
	frappe.db.commit()


def _deletable_users() -> list[str]:
	return frappe.get_all(
		"User", filters={"name": ["not in", ("Administrator", "Guest")]}, pluck="name"
	)


def _delete_users():
	# Null out user references held by config rows we are keeping, so nothing
	# dangles once the users are gone.
	for doctype, field in (
		("CRM Territory", "territory_manager"),
		("Assignment Rule", "last_user"),
		("Email Account", "connected_user"),
	):
		if frappe.db.table_exists(doctype) and frappe.get_meta(doctype).has_field(field):
			frappe.db.sql(f"update `tab{doctype}` set `{field}` = null")

	victims = _deletable_users()
	for user in victims:
		_delete(("User", user))

	if victims:
		frappe.db.delete("Sessions", {"user": ["in", victims]})
	frappe.db.commit()


def _clear_demo_defaults():
	# set_default(key, None) writes the literal string "None" — delete the rows.
	frappe.db.delete("DefaultValue", {"defkey": ["in", DEMO_DEFAULT_KEYS]})
	frappe.defaults.clear_defaults_cache()
	frappe.db.commit()


def sweep_logs():
	"""Transient logs and rows orphaned by the document deletes above.

	Separate and re-runnable: deleting a document leaves Comment/Version audit
	rows behind (the sweep in phase 1 runs *before* the deletes, so it cannot
	catch the ones the deletes themselves create).
	"""
	# Every user is gone, so no email history is worth keeping. Attached File and
	# Comment rows are removed by Communication's own on_trash.
	for name in frappe.get_all("Communication", pluck="name"):
		_delete(("Communication", name))
	frappe.db.commit()

	# Per-user views belonged to deleted users; the standard ones ship with the app.
	# Must run BEFORE the orphan sweep below, so the rows it strands are collected.
	frappe.db.delete("CRM View Settings", {"is_standard": 0})

	# Comments whose subject no longer exists.
	for ref in frappe.db.sql_list("select distinct reference_doctype from tabComment"):
		if not ref or not frappe.db.table_exists(ref):
			continue
		frappe.db.sql(
			"""delete c from tabComment c
			left join `tab{ref}` r on r.name = c.reference_name
			where c.reference_doctype = %s and r.name is null""".format(ref=ref),
			(ref,),
		)

	# Version is an audit trail of edits made by users who no longer exist —
	# transient by the same argument as Activity Log, so it goes wholesale.
	for doctype in (
		"Version",
		"Email Queue",
		"Email Queue Recipient",
		"Error Log",
		"Activity Log",
		"Route History",
	):
		if frappe.db.table_exists(doctype):
			frappe.db.delete(doctype)

	frappe.db.commit()


def _delete(target: tuple[str, str]):
	doctype, name = target
	try:
		frappe.delete_doc(
			doctype,
			name,
			force=1,
			ignore_permissions=True,
			delete_permanently=True,
		)
	except Exception as exc:
		# Keep going: one stubborn row must not abort the whole reset.
		print(f"  ! could not delete {doctype} {name}: {exc}")
