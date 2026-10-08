# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Reminders: one in-app notification and one email at every reminder time.

Reminders are set on many kinds of records (events, tasks, ...). Each kind is a
*provider* in this package that answers one question — "which reminders fell due
in this window?" — and `service.send_due_reminders` delivers all of them the same
way: a log row (duplicate guard), an in-app notification for CRM users, and an
email from the reminder type's Email Template.

To add a new reminder type, write a provider and add it to `providers.PROVIDERS`.
"""
