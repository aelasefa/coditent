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
import secrets
from datetime import datetime, timedelta, timezone

from app.config import settings
from app.observability import get_logger

logger = get_logger("email_verification")

OTP_LENGTH = 6
OTP_MODULUS = 10**OTP_LENGTH


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


def build_otp_email(full_name: str, otp: str) -> tuple[str, str]:
    """Return (subject, html). Caller sends; never logs the OTP itself."""
    first = (full_name or "").strip().split()[0] if full_name else "there"
    first = html_module.escape(first)
    subject = "Your CODITENT verification code"
    html = f"""
    <div style="font-family:Inter,system-ui,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#18181B;">
      <div style="border:1px solid #E4E4E7;border-radius:16px;overflow:hidden;">
        <div style="background:#18181B;color:#fff;padding:20px 24px;">
          <div style="font-weight:800;letter-spacing:-0.02em;font-size:18px;">CODITENT</div>
          <div style="font-size:12px;opacity:0.7;letter-spacing:0.08em;text-transform:uppercase;margin-top:4px;">Talent Workflow Platform</div>
        </div>
        <div style="padding:24px;">
          <h2 style="margin:0 0 8px;font-size:18px;">Hi {first}, verify your email</h2>
          <p style="margin:0 0 12px;color:#52525B;font-size:14px;line-height:1.6;">
            Use this code to finish creating your account. It expires in {settings.otp_expire_minutes} minutes.
          </p>
          <div style="font-size:32px;font-weight:800;letter-spacing:0.35em;text-align:center;background:#FAFAF9;border:1px solid #E4E4E7;border-radius:12px;padding:14px 0;margin:12px 0;">{otp}</div>
          <p style="font-size:12px;color:#71717A;margin:8px 0 0;">If you did not request this, you can safely ignore this email.</p>
        </div>
      </div>
      <p style="font-size:11px;color:#A1A1AA;text-align:center;margin-top:12px;">CODITENT · Talent Workflow Platform</p>
    </div>
    """
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
        send_email(to_email, subject, html)
    except Exception as exc:
        # Log provider status only — message contains no OTP, no key.
        logger.warning("otp_email_failed", email=to_email, error=str(exc)[:300])
        raise RuntimeError("Could not send verification email") from exc
