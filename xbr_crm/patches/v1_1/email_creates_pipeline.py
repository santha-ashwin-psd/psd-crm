from xbr_crm.install import add_email_account_custom_field


def execute():
	"""Relabel the Email Account switch: incoming email now creates a pipeline, not a lead."""
	add_email_account_custom_field()
