# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

"""Shared types and helpers for reminder providers."""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import frappe

# Units a reminder offset can be expressed in (Event Notifications.interval).
INTERVALS = {
	"minutes": lambda n: timedelta(minutes=n),
	"hours": lambda n: timedelta(hours=n),
	"days": lambda n: timedelta(days=n),
	"weeks": lambda n: timedelta(weeks=n),
}


@dataclass
class Recipient:
	email: str
	user: str | None = None  # set for CRM users; None for external participants
	full_name: str | None = None


@dataclass
class DueReminder:
	"""One reminder that is due now, for one item (and one occurrence of it)."""

	reminder_type: str  # provider key, e.g. "event", "task"
	reference_doctype: str
	reference_name: str
	reminder_key: str  # which reminder row on the item (or global default)
	trigger_at: datetime  # when the reminder is due (system timezone, naive)
	occurrence_start: datetime  # event occurrence start / task due time
	before: int
	interval: str
	title: str
	crm_company: str | None = None
	recipients: list[Recipient] = field(default_factory=list)
	# Template context beyond the common fields (location, meeting link, ...).
	context: dict = field(default_factory=dict)
	# The CRM record this item belongs to (e.g. a deal), if any.
	related_doctype: str | None = None
	related_name: str | None = None
	# False when the reminder row asks for an in-app notification only.
	email: bool = True


def offset(before, interval) -> timedelta | None:
	"""The reminder's lead time, or None for an unusable row."""
	make = INTERVALS.get((interval or "").lower())
	try:
		before = int(before or 0)
	except (TypeError, ValueError):
		return None
	if make is None or before < 0:
		return None
	return make(before)


def describe_offset(before, interval) -> str:
	"""'10 minutes before', '1 day before', 'At the time'."""
	try:
		before = int(before or 0)
	except (TypeError, ValueError):
		before = 0
	if before == 0:
		return frappe._("At the time")
	unit = (interval or "").lower().rstrip("s")
	label = unit if before == 1 else f"{unit}s"
	return frappe._("{0} {1} before").format(before, frappe._(label))


def system_timezone() -> str:
	return frappe.utils.get_system_timezone() or "Asia/Kolkata"


def user_timezone(user: str | None) -> str:
	if user:
		tz = frappe.db.get_value("User", user, "time_zone")
		if tz:
			return tz
	return system_timezone()


def in_timezone(dt: datetime, tz: str) -> datetime:
	"""A naive system-time datetime expressed in `tz`."""
	return dt.replace(tzinfo=ZoneInfo(system_timezone())).astimezone(ZoneInfo(tz))


def format_when(dt: datetime, tz: str, all_day: bool = False) -> str:
	local = in_timezone(dt, tz)
	if all_day:
		return local.strftime("%A, %d %B %Y") + " (" + frappe._("all day") + ")"
	return local.strftime("%A, %d %B %Y, %I:%M %p") + f" ({tz})"


def related_company(doctype: str | None, name: str | None) -> str | None:
	"""The CRM Company of a linked CRM record, if it has one."""
	if not (doctype and name) or not frappe.db.exists(doctype, name):
		return None
	if not frappe.get_meta(doctype).has_field("crm_company"):
		return None
	return frappe.db.get_value(doctype, name, "crm_company")


def user_recipient(user: str | None) -> Recipient | None:
	"""A CRM user as a recipient: enabled, real, with an email address."""
	if not user or user in ("Administrator", "Guest"):
		return None
	row = frappe.db.get_value("User", user, ["email", "full_name", "enabled"], as_dict=True)
	if not row or not row.enabled or not row.email:
		return None
	return Recipient(email=row.email, user=user, full_name=row.full_name)


def user_in_company(user: str, company: str | None) -> bool:
	"""Whether `user` may receive a reminder for an item of `company`.

	Follows the tenancy rules: a user mapped to a different company never gets
	another company's reminders; an unmapped user only when tenancy is lenient.
	"""
	if not company:
		return True
	from xbr_crm.permissions.tenancy import get_user_company, is_bypass, is_strict

	if is_bypass(user):
		return True
	mapped = get_user_company(user)
	if mapped:
		return mapped == company
	return not is_strict()
