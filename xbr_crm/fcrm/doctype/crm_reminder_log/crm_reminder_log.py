# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Audit trail and duplicate guard for reminder emails.

Every reminder delivered — or deliberately skipped — writes one row per
recipient. `dedupe_key` is unique, so a reminder that was already handled can
never be sent a second time, however often the scheduler runs.
"""

from frappe.model.document import Document


class CRMReminderLog(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		communication: DF.Link | None
		crm_company: DF.Link | None
		dedupe_key: DF.Data | None
		email_queue: DF.Link | None
		message: DF.SmallText | None
		occurrence_start: DF.Datetime | None
		recipient: DF.Data | None
		recipient_is_user: DF.Check
		reference_doctype: DF.Link | None
		reference_name: DF.DynamicLink | None
		reminder_key: DF.Data | None
		reminder_type: DF.Data | None
		status: DF.Literal["Sent", "Skipped", "Failed"]
		trigger_at: DF.Datetime | None
	# end: auto-generated types

	pass
