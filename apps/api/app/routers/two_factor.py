from datetime import timedelta
from typing import Annotated
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import User
from app.limiter import limiter
from app.observability import get_logger
from app.schemas import (
    TokenResponse,
    TwoFactorDisableRequest,
    TwoFactorEnableOut,
    TwoFactorEnableRequest,
    TwoFactorSetupOut,
    TwoFactorVerifyRequest,
    UserOut,
)
from app.services.two_factor import (
    TotpSecretUnavailable,
    consume_second_factor,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_totp_uri,
    matching_totp_step,
)
from app.services.passwords import verify_password
from app.services.auth_cookies import (
    clear_auth_cookies,
    set_access_cookie,
    set_trusted_device_cookie,
)
from app.services.authentication import (
    AuthenticationRejected,
    AuthenticationStoreUnavailable,
    consume_mfa_challenge,
    ensure_account_can_authenticate,
    ensure_credential_matches_account,
    ensure_mfa_challenge_active,
    factor_fingerprint,
    issue_access_token,
)
from app.utils.jwt import create_trusted_device_token, verify_mfa_token

router = APIRouter()
logger = get_logger("two_factor")


@router.get("/status")
async def two_factor_status(
    current_user: Annotated[User, Depends(get_current_user)],
) -> dict:
    """Check if 2FA is currently enabled for the authenticated user."""
    return {"is_2fa_enabled": current_user.is_2fa_enabled}


@router.post("/setup", response_model=TwoFactorSetupOut)
@limiter.limit("5/minute")
async def two_factor_setup(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TwoFactorSetupOut:
    """Generate TOTP secret and QR code for initial 2FA setup."""
    user = (
        await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    ).scalar_one()
    if user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already enabled for this account.",
        )

    secret = generate_totp_secret()
    try:
        user.totp_secret_encrypted = encrypt_totp_secret(secret)
    except TotpSecretUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Two-factor authentication is temporarily unavailable.",
        ) from exc
    user.totp_last_used_step = None
    await db.commit()

    otpauth_uri = get_totp_uri(secret, user.email)
    qr_code_b64 = generate_qr_code_base64(otpauth_uri)

    logger.info("2fa_setup_initiated", user_id=str(current_user.id))
    return TwoFactorSetupOut(
        secret=secret,
        otpauth_uri=otpauth_uri,
        qr_code=qr_code_b64,
    )


@router.post("/enable", response_model=TwoFactorEnableOut)
@limiter.limit("5/minute")
async def two_factor_enable(
    data: TwoFactorEnableRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TwoFactorEnableOut:
    """Verify 6-digit TOTP code, enable 2FA, and return emergency backup recovery codes."""
    user = (
        await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    ).scalar_one()
    if user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already enabled.",
        )

    try:
        secret = decrypt_totp_secret(user.totp_secret_encrypted)
    except TotpSecretUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Two-factor authentication is temporarily unavailable.",
        ) from exc
    if not secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please run 2FA setup first before enabling.",
        )

    step = matching_totp_step(secret, data.code)
    if step is None:
        logger.warning("2fa_enable_failed", user_id=str(current_user.id), reason="invalid_code")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 6-digit verification code. Check your authenticator app time.",
        )

    plaintext_backup_codes, hashed_json = generate_backup_codes(8)
    user.is_2fa_enabled = True
    user.totp_last_used_step = step
    user.backup_codes = hashed_json
    await db.commit()

    logger.info("2fa_enabled_success", user_id=str(current_user.id))
    return TwoFactorEnableOut(
        detail="Two-factor authentication enabled successfully. Store these recovery codes in a safe place.",
        backup_codes=plaintext_backup_codes,
    )


@router.post("/disable")
@limiter.limit("5/minute")
async def two_factor_disable(
    data: TwoFactorDisableRequest,
    request: Request,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Disable 2FA after validating current user password and TOTP/backup code."""
    user = (
        await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    ).scalar_one()
    if not user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not enabled.",
        )

    if not verify_password(data.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account password.",
        )

    try:
        consumed = consume_second_factor(user, data.code)
    except TotpSecretUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Two-factor authentication is temporarily unavailable.",
        ) from exc
    if not consumed:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification or backup code.",
        )

    user.is_2fa_enabled = False
    user.totp_secret_encrypted = None
    user.totp_last_used_step = None
    user.backup_codes = None
    user.auth_version += 1
    await db.commit()
    clear_auth_cookies(response)

    logger.info("2fa_disabled_success", user_id=str(current_user.id))
    return {"detail": "Two-factor authentication disabled successfully."}


@router.post("/verify", response_model=TokenResponse)
@limiter.limit("10/minute")
async def two_factor_verify_challenge(
    data: TwoFactorVerifyRequest,
    request: Request,
    response: Response,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    try:
        payload = verify_mfa_token(data.mfa_token)
        await ensure_mfa_challenge_active(payload)
        user_id = UUID(str(payload["sub"]))
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        ) from exc
    except (AuthenticationRejected, ValueError, TypeError, KeyError) as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA session token.",
        ) from exc

    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if user is None or not user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found or 2FA not active.",
        )
    try:
        ensure_account_can_authenticate(user)
        ensure_credential_matches_account(payload, user)
    except AuthenticationRejected as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Account is not active.",
        ) from exc

    try:
        consumed_factor = consume_second_factor(user, data.code)
    except TotpSecretUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Two-factor authentication is temporarily unavailable.",
        ) from exc
    if not consumed_factor:
        logger.warning("2fa_challenge_failed", user_id=str(user.id))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code or backup code.",
        )

    try:
        await consume_mfa_challenge(payload)
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable.",
        ) from exc
    except AuthenticationRejected as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA session token.",
        ) from exc

    await db.commit()
    if consumed_factor == "recovery":
        logger.info("2fa_backup_code_consumed", user_id=str(user.id))

    final_token = issue_access_token(user)
    set_access_cookie(response, final_token)
    from app.config import settings

    trusted_device_token = create_trusted_device_token(
        str(user.id),
        factor=factor_fingerprint(user),
        auth_version=user.auth_version,
        expires_delta=timedelta(days=settings.trusted_device_expire_days),
    )
    set_trusted_device_cookie(response, trusted_device_token)
    logger.info("2fa_login_success", user_id=str(user.id))
    return TokenResponse(
        token=final_token,
        user=UserOut.model_validate(user),
        trusted_device_token=trusted_device_token,
    )
