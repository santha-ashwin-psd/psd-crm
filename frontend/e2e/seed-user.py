"""
Create a dedicated user for the end-to-end tests.

Deliberately a NEW account rather than a password change on Administrator or on
one of the crm.* fixtures: nothing existing is touched, and removing it is a
single delete. The password is not a secret — it exists only on this local dev
site, and the E2E suite needs a credential it can hard-code.
"""
import frappe

EMAIL = "e2e@crm.test"
PASSWORD = "e2e-playwright-local"
ROLES = ["System Manager", "Sales Manager", "Sales User"]

existing = frappe.db.exists("User", EMAIL)
if existing:
    user = frappe.get_doc("User", EMAIL)
    print(f"reusing existing {EMAIL}")
else:
    user = frappe.new_doc("User")
    user.email = EMAIL
    user.first_name = "E2E"
    user.last_name = "Runner"
    user.send_welcome_email = 0
    user.user_type = "System User"
    print(f"creating {EMAIL}")

user.enabled = 1
have = {r.role for r in user.get("roles", [])}
for role in ROLES:
    if frappe.db.exists("Role", role) and role not in have:
        user.append("roles", {"role": role})

user.flags.ignore_permissions = True
user.save(ignore_permissions=True)

from frappe.utils.password import update_password
update_password(EMAIL, PASSWORD)

frappe.db.commit()

roles = sorted(r.role for r in frappe.get_doc("User", EMAIL).get("roles", []))
print("email:   ", EMAIL)
print("password:", PASSWORD)
print("roles:   ", ", ".join(roles) or "(none)")
