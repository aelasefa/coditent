from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from passlib.context import CryptContext

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
    generate_backup_codes,
    generate_qr_code_base64,
    generate_totp_secret,
    get_totp_uri,
    verify_and_consume_backup_code,
    verify_totp_code,
)
from app.utils.jwt import create_access_token, verify_token

router = APIRouter()
logger = get_logger("two_factor")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")



def _set_access_cookie(response: Response, token: str) -> None:
    from app.config import settings

    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


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
    if current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already enabled for this account.",
        )

    secret = generate_totp_secret()
    current_user.totp_secret = secret
    await db.commit()

    otpauth_uri = get_totp_uri(secret, current_user.email)
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
    if current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is already enabled.",
        )

    if not current_user.totp_secret:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Please run 2FA setup first before enabling.",
        )

    if not verify_totp_code(current_user.totp_secret, data.code):
        logger.warning("2fa_enable_failed", user_id=str(current_user.id), reason="invalid_code")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid 6-digit verification code. Check your authenticator app time.",
        )

    plaintext_backup_codes, hashed_json = generate_backup_codes(8)
    current_user.is_2fa_enabled = True
    current_user.backup_codes = hashed_json
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
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Disable 2FA after validating current user password and TOTP/backup code."""
    if not current_user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Two-factor authentication is not enabled.",
        )

    if not pwd_context.verify(data.password, current_user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account password.",
        )

    totp_valid = verify_totp_code(current_user.totp_secret or "", data.code)
    backup_valid, _ = verify_and_consume_backup_code(current_user.backup_codes, data.code)

    if not (totp_valid or backup_valid):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification or backup code.",
        )

    current_user.is_2fa_enabled = False
    current_user.totp_secret = None
    current_user.backup_codes = None
    await db.commit()

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
        payload = verify_token(data.mfa_token)
    except Exception:
        payload = None

    if not payload or payload.get("type") != "mfa_pending":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired MFA session token.",
        )


    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None or not user.is_2fa_enabled:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User not found or 2FA not active.",
        )

    totp_valid = verify_totp_code(user.totp_secret or "", data.code)
    backup_valid, updated_backup_json = verify_and_consume_backup_code(user.backup_codes, data.code)

    if not (totp_valid or backup_valid):
        logger.warning("2fa_challenge_failed", user_id=str(user.id))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid verification code or backup code.",
        )

    if backup_valid:
        user.backup_codes = updated_backup_json
        await db.commit()
        logger.info("2fa_backup_code_consumed", user_id=str(user.id))

    final_token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )
    _set_access_cookie(response, final_token)
    logger.info("2fa_login_success", user_id=str(user.id))
    return TokenResponse(token=final_token, user=UserOut.model_validate(user))
