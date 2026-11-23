from xbr_crm.install import add_desk_user_role


def execute():
	"""Add the Desk User role: the only non-Administrator users allowed into /app and /desk."""
	add_desk_user_role()
