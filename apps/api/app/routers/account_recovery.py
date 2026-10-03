from __future__ import annotations

import hashlib
import html
import secrets
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.core.audit import log_audit
from app.database import get_db
from app.limiter import limiter
from app.models import PasswordRecovery, User
from app.observability import get_logger
from app.schemas import PasswordRecoveryConfirm, PasswordRecoveryRequest
from app.services.email_outbox import EmailOutboxUnavailable, enqueue_email_delivery
from app.services.passwords import hash_password, verify_password


router = APIRouter(prefix="/recovery")
logger = get_logger("auth")
RECOVERY_TTL_MINUTES = 30
GENERIC_RESPONSE = {
    "detail": "If an eligible account exists, a password recovery email has been queued."
}


def _token_hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _recovery_email(full_name: str, token: str) -> tuple[str, str]:
    reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={token}"
    safe_name = html.escape(full_name)
    safe_url = html.escape(reset_url, quote=True)
    subject = "Reset your CODITENT password"
    body = f"""<!doctype html>
<html lang="en"><body style="margin:0;background:#f8f8f3;color:#192b23;font-family:Arial,sans-serif">
<table role="presentation" width="100%"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="560" style="max-width:560px;background:#fffefa;border:1px solid #cfdbcf;border-radius:16px"><tr><td style="padding:30px">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#5b765e">CODITENT account recovery</p>
<h1 style="margin:0 0 16px;font-family:Georgia,serif;font-weight:400">Reset your password</h1>
<p style="line-height:1.6">Hello {safe_name}, use the button below to choose a new password. This single-use link expires in {RECOVERY_TTL_MINUTES} minutes.</p>
<p style="margin:24px 0"><a href="{safe_url}" style="display:inline-block;border-radius:999px;background:#194d38;color:white;padding:13px 21px;text-decoration:none;font-weight:700">Reset password</a></p>
<p style="font-size:12px;line-height:1.6;color:#617369">If the button does not work, copy this link:<br><a href="{safe_url}" style="color:#194d38;word-break:break-all">{safe_url}</a></p>
<p style="font-size:12px;line-height:1.6;color:#617369">If you did not request this change, ignore this email. Your password remains unchanged.</p>
</td></tr></table></td></tr></table></body></html>"""
    return subject, body


@router.post("/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def request_password_recovery(
    data: PasswordRecoveryRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    """Queue a reset email without revealing account existence."""
    email = str(data.email).strip().lower()
    user = await db.scalar(select(User).where(User.email == email))
    if user is None or not user.is_active or not user.is_approved:
        return GENERIC_RESPONSE

    now = datetime.utcnow()
    await db.execute(
        update(PasswordRecovery)
        .where(
            PasswordRecovery.user_id == user.id,
            PasswordRecovery.used_at.is_(None),
        )
        .values(used_at=now)
    )
    token = secrets.token_urlsafe(48)
    recovery = PasswordRecovery(
        user_id=user.id,
        token_hash=_token_hash(token),
        expires_at=now + timedelta(minutes=RECOVERY_TTL_MINUTES),
        created_at=now,
    )
    db.add(recovery)
    await db.flush()
    subject, body = _recovery_email(user.full_name, token)
    try:
        await enqueue_email_delivery(
            db,
            kind="password_recovery",
            dedupe_key=f"password-recovery:{recovery.id}",
            resource_type="password_recovery",
            resource_id=recovery.id,
            to_email=user.email,
            subject=subject,
            html=body,
        )
    except EmailOutboxUnavailable:
        # Do not persist a reset credential that cannot be delivered and do
        # not disclose configuration state to the requester.
        await db.rollback()
        logger.warning("password_recovery_not_queued", reason="email_outbox_unavailable")
        return GENERIC_RESPONSE

    await db.commit()
    logger.info("password_recovery_queued", user_id=str(user.id))
    return GENERIC_RESPONSE


@router.post("/confirm")
@limiter.limit("10/hour")
async def confirm_password_recovery(
    data: PasswordRecoveryConfirm,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str]:
    now = datetime.utcnow()
    recovery = await db.scalar(
        select(PasswordRecovery)
        .where(PasswordRecovery.token_hash == _token_hash(data.token))
        .with_for_update()
    )
    if recovery is None or recovery.used_at is not None or recovery.expires_at <= now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired recovery link",
        )
    user = await db.scalar(select(User).where(User.id == recovery.user_id).with_for_update())
    if user is None or not user.is_active or not user.is_approved:
        recovery.used_at = now
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired recovery link",
        )
    if verify_password(data.new_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="New password must be different from the current password",
        )

    user.password_hash = hash_password(data.new_password)
    user.auth_version = int(user.auth_version or 0) + 1
    recovery.used_at = now
    await db.execute(
        update(PasswordRecovery)
        .where(
            PasswordRecovery.user_id == user.id,
            PasswordRecovery.id != recovery.id,
            PasswordRecovery.used_at.is_(None),
        )
        .values(used_at=now)
    )
    await db.commit()
    await log_audit(
        db,
        action="PASSWORD_RECOVERED",
        actor=user,
        resource_type="user",
        resource_id=user.id,
    )
    logger.info("password_recovery_completed", user_id=str(user.id))
    return {"detail": "Password updated. Sign in again with your new password."}
