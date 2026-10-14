"""HTML bodies for authentication email, in the CRM's blue palette."""

from xbr_crm.utils.email_system import send_system_email

_ACCENT = "#2563eb"
_ACCENT_SOFT = "#eff6ff"
_INK = "#111827"
_MUTED = "#6b7280"
_BORDER = "#e5e7eb"

_FONT = (
	"-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif"
)


def _shell(heading: str, intro: str, body: str, footer: str = "") -> str:
	return f"""\
<div style="margin:0;padding:32px 16px;background:#f0f2f5;font-family:{_FONT}">
  <div style="max-width:480px;margin:0 auto;background:#ffffff;border:1px solid {_BORDER};
              border-radius:16px;overflow:hidden">
    <div style="padding:28px 32px 8px">
      <div style="font-size:13px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;
                  color:{_ACCENT}">PS Digitise CRM</div>
      <h1 style="margin:12px 0 8px;font-size:22px;line-height:1.3;color:{_INK}">{heading}</h1>
      <p style="margin:0;font-size:14px;line-height:1.6;color:{_MUTED}">{intro}</p>
    </div>
    <div style="padding:20px 32px 28px">{body}</div>
    <div style="padding:16px 32px;background:#f9fafb;border-top:1px solid {_BORDER};
                font-size:12px;line-height:1.6;color:{_MUTED}">
      {footer or "If you didn't request this, you can safely ignore this email."}
    </div>
  </div>
</div>"""


def _otp_block(otp: str) -> str:
	return f"""\
<div style="text-align:center;padding:18px;background:{_ACCENT_SOFT};border-radius:12px">
  <div style="font-size:34px;font-weight:700;letter-spacing:10px;color:{_ACCENT};
              font-family:ui-monospace,SFMono-Regular,Menlo,monospace">{otp}</div>
</div>"""


def send_signup_otp(email: str, first_name: str, otp: str, minutes: int) -> bool:
	html = _shell(
		"Verify your email",
		f"Hi {first_name or 'there'}, use this code to finish creating your CRM account.",
		_otp_block(otp)
		+ f'<p style="margin:18px 0 0;font-size:13px;color:{_MUTED};text-align:center">'
		f"This code expires in {minutes} minutes.</p>",
	)
	return send_system_email(
		email,
		"Your PS Digitise CRM verification code",
		html,
		f"Your PS Digitise CRM verification code is {otp}. It expires in {minutes} minutes.",
	)


def send_login_otp(email: str, otp: str, minutes: int) -> bool:
	html = _shell(
		"Your sign-in code",
		"Use this code to sign in to PS Digitise CRM.",
		_otp_block(otp)
		+ f'<p style="margin:18px 0 0;font-size:13px;color:{_MUTED};text-align:center">'
		f"This code expires in {minutes} minutes.</p>",
		"If you didn't try to sign in, change your password — someone may know it.",
	)
	return send_system_email(
		email, "Your PS Digitise CRM sign-in code", html,
		f"Your PS Digitise CRM sign-in code is {otp}. It expires in {minutes} minutes.",
	)


def send_reset_otp(email: str, otp: str, minutes: int) -> bool:
	html = _shell(
		"Reset your password",
		"Use this code to set a new password for your CRM account.",
		_otp_block(otp)
		+ f'<p style="margin:18px 0 0;font-size:13px;color:{_MUTED};text-align:center">'
		f"This code expires in {minutes} minutes.</p>",
	)
	return send_system_email(
		email, "Your PS Digitise CRM password reset code", html,
		f"Your PS Digitise CRM password reset code is {otp}. It expires in {minutes} minutes.",
	)


def send_invite(email: str, first_name: str, company: str, password: str, role: str, url: str) -> bool:
	body = f"""\
<div style="border:1px solid {_BORDER};border-radius:12px;padding:16px 18px">
  <div style="font-size:12px;color:{_MUTED};margin-bottom:4px">Email</div>
  <div style="font-size:14px;color:{_INK};margin-bottom:14px">{email}</div>
  <div style="font-size:12px;color:{_MUTED};margin-bottom:4px">Temporary password</div>
  <div style="font-size:18px;font-weight:700;color:{_ACCENT};letter-spacing:1px;
              font-family:ui-monospace,SFMono-Regular,Menlo,monospace">{password}</div>
</div>
<div style="text-align:center;margin-top:22px">
  <a href="{url}" style="display:inline-block;background:{_ACCENT};color:#ffffff;
     text-decoration:none;font-size:14px;font-weight:600;padding:12px 26px;border-radius:10px">
    Sign in to CRM</a>
</div>"""
	html = _shell(
		f"You've been invited to {company}",
		f"Hi {first_name or 'there'}, you now have {role} access to {company} on PS Digitise CRM.",
		body,
		"Please change this temporary password after your first sign-in.",
	)
	return send_system_email(
		email,
		f"You've been invited to {company} on PS Digitise CRM",
		html,
		f"You've been invited to {company} on PS Digitise CRM.\n"
		f"Email: {email}\nTemporary password: {password}\nSign in: {url}",
	)
