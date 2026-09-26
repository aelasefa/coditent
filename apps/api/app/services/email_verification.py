"""Email OTP verification for password registration.

Security properties:
- OTP is 6 digits from secrets (CSPRNG), stored only as sha256 hash.
- Plaintext OTP never logged and never returned by any API.
- Attempts, expiry and cooldown enforced inside row-locked transactions.
"""
from __future__ import annotations

import hashlib
import hmac
import html as html_module
import base64
import secrets
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from pathlib import Path

from app.config import settings
from app.observability import get_logger

logger = get_logger("email_verification")

OTP_LENGTH = 6
OTP_MODULUS = 10**OTP_LENGTH
VERIFICATION_ART_CONTENT_ID = "coditent-verification-art"
VERIFICATION_ART_PATH = Path(__file__).resolve().parent.parent / "assets" / "verification-email-art.jpg"


def generate_otp() -> str:
    """Cryptographically secure 6-digit code, zero-padded."""
    return f"{secrets.randbelow(OTP_MODULUS):06d}"


def hash_otp(otp: str) -> str:
    return hashlib.sha256(otp.encode()).hexdigest()


def verify_otp(candidate: str, expected_hash: str) -> bool:
    """Constant-time comparison against the stored hash."""
    if not candidate or not expected_hash:
        return False
    return hmac.compare_digest(hash_otp(candidate.strip()), expected_hash)


def otp_expiry(from_time: datetime | None = None) -> datetime:
    base = from_time or datetime.now(timezone.utc).replace(tzinfo=None)
    return base + timedelta(minutes=settings.otp_expire_minutes)


def is_expired(expires_at: datetime, now: datetime | None = None) -> bool:
    now = now or datetime.utcnow()
    return expires_at <= now


def cooldown_remaining_seconds(last_sent_at: datetime, now: datetime | None = None) -> int:
    now = now or datetime.utcnow()
    elapsed = (now - last_sent_at).total_seconds()
    remaining = settings.otp_resend_cooldown_seconds - elapsed
    return max(0, int(remaining))


def attempts_exceeded(attempts: int) -> bool:
    return attempts >= settings.otp_max_attempts


@lru_cache(maxsize=1)
def verification_art_attachment() -> dict[str, str]:
    """Return the email hero as an inline CID attachment.

    Embedding avoids broken localhost/private asset URLs in webmail clients.
    """
    content = base64.b64encode(VERIFICATION_ART_PATH.read_bytes()).decode("ascii")
    return {
        "filename": "coditent-verification.jpg",
        "content": content,
        "content_type": "image/jpeg",
        "content_id": VERIFICATION_ART_CONTENT_ID,
    }


def build_otp_email(full_name: str, otp: str) -> tuple[str, str]:
    """Return (subject, html). Caller sends; never logs the OTP itself."""
    first = (full_name or "").strip().split()[0] if full_name else "there"
    first = html_module.escape(first)
    subject = "Your CODITENT verification code"
    html = f"""<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <title>{subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f8f8f3;color:#192b23;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">
    Your CODITENT verification code expires in 5 minutes.
  </div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f8f8f3;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:600px;background-color:#fffefa;border:1px solid #cfdbcf;border-radius:18px;overflow:hidden;">
          <tr>
            <td style="padding:22px 28px 18px;border-bottom:1px solid #e3e9df;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                <tr>
                  <td style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:20px;font-weight:800;line-height:1;color:#192b23;letter-spacing:-0.4px;">Coditent</td>
                  <td align="right" style="font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:10px;font-weight:700;line-height:1.4;color:#617369;letter-spacing:1.4px;text-transform:uppercase;">Talent workflow</td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0;background-color:#edf1e9;line-height:0;">
              <img src="cid:{VERIFICATION_ART_CONTENT_ID}" width="600" alt="A calm illustrated path leading to a safely delivered envelope" style="display:block;width:100%;max-width:600px;height:auto;border:0;line-height:100%;outline:none;text-decoration:none;">
            </td>
          </tr>
          <tr>
            <td style="padding:32px 28px 30px;">
              <p style="margin:0 0 9px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;font-weight:700;line-height:1.4;color:#5b765e;letter-spacing:1.8px;text-transform:uppercase;">Confirm your email</p>
              <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:32px;font-weight:400;line-height:1.12;color:#192b23;letter-spacing:-1px;">Hi {first}, your path starts here.</h1>
              <p style="margin:14px 0 22px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:15px;line-height:1.65;color:#53665a;">Use the code below to finish creating your CODITENT account.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#edf1e9;border:1px solid #cfdbcf;border-radius:12px;">
                <tr>
                  <td align="center" style="padding:20px 12px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:36px;font-weight:800;line-height:1;color:#194d38;letter-spacing:9px;white-space:nowrap;">{otp}</td>
                </tr>
              </table>

              <p style="margin:20px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.55;color:#194d38;">This verification code expires in 5 minutes.</p>
              <p style="margin:7px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:14px;font-weight:700;line-height:1.55;color:#a25c38;">Do not share this code with anyone.</p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:22px;border-top:1px solid #e3e9df;">
                <tr>
                  <td style="padding-top:18px;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:12px;line-height:1.6;color:#617369;">If you did not request this code, you can safely ignore this email. No account will be created without verification.</td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
        <p style="margin:14px 0 0;font-family:Inter,-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;font-size:11px;line-height:1.5;color:#617369;text-align:center;">CODITENT · Talent Workflow Platform</p>
      </td>
    </tr>
  </table>
</body>
</html>"""
    return subject, html


def send_email_change_code(to_email: str, full_name: str, otp: str) -> None:
    from app.services.email import send_email

    first = html_module.escape((full_name or "there").strip().split()[0])
    subject = "Confirm your new CODITENT email address"
    body = f"""
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181B;">
      <h2>Hi {first}, confirm your new email</h2>
      <p>Enter this code in CODITENT. It expires in {settings.otp_expire_minutes} minutes.</p>
      <div style="font-size:32px;font-weight:800;letter-spacing:0.35em;text-align:center;padding:16px;background:#FAFAF9;border:1px solid #E4E4E7;border-radius:12px;">{otp}</div>
      <p style="font-size:12px;color:#71717A;">If you did not request this change, keep your current email and change your password.</p>
    </div>
    """
    send_email(to_email, subject, body)


def send_otp_email(to_email: str, full_name: str, otp: str, expires_at: datetime) -> None:
    from app.services.email import send_email

    subject, html = build_otp_email(full_name, otp)
    try:
        send_email(to_email, subject, html, attachments=[verification_art_attachment()])
    except Exception as exc:
        # Log provider status only — message contains no OTP, no key.
        logger.warning("otp_email_failed", email=to_email, error=str(exc)[:300])
        raise RuntimeError("Could not send verification email") from exc
