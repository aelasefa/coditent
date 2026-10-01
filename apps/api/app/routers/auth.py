import asyncio
import hashlib
import secrets
from datetime import datetime, timezone
from uuid import UUID, uuid4
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import CandidateProfile, User, UserRole
from app.limiter import limiter
from app.observability import get_logger
from app.schemas import (
    AvatarUpdate,
    AccountNameUpdate,
    EmailChangeConfirm,
    EmailChangeRequest,
    LoginRequest,
    OAuthHandoffExchangeRequest,
    OAuthHandoffExchangeResponse,
    PasswordChangeRequest,
    RegisterRequest,
    RegistrationStarted,
    ResendVerificationRequest,
    TokenResponse,
    TwoFactorChallengeResponse,
    UserMeOut,
    UserOut,
    VerifyEmailRequest,
)
from app.services.email_verification import (
    attempts_exceeded,
    cooldown_remaining_seconds,
    generate_otp,
    hash_otp,
    is_expired,
    otp_expiry,
    send_otp_email,
    send_email_change_code,
    verify_otp,
)
from app.services.oauth_service import (
    OAuthIdentity,
    build_oauth_authorize_url,
    create_oauth_state,
    create_oauth_handoff,
    consume_oauth_handoff,
    exchange_code_for_access_token,
    fetch_user_identity,
    get_oauth_provider,
    resolve_redirect_uri,
    verify_oauth_state,
)
from app.services.passwords import hash_password, verify_password, verify_password_and_rehash
from app.utils.jwt import create_access_token, verify_token
from app.services.two_factor import verify_and_consume_backup_code, verify_totp_code


router = APIRouter()
logger = get_logger("auth")


def _verify_sensitive_action(user: User, password: str, two_factor_code: str | None) -> None:
    if not verify_password(password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid account password.")
    if not user.is_2fa_enabled:
        return
    if not two_factor_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor code is required.")
    totp_valid = verify_totp_code(user.totp_secret or "", two_factor_code)
    backup_valid, remaining = verify_and_consume_backup_code(user.backup_codes, two_factor_code)
    if not (totp_valid or backup_valid):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authenticator or recovery code.")
    if backup_valid:
        user.backup_codes = remaining


def _new_candidate_profile(user_id) -> CandidateProfile:
    return CandidateProfile(
        user_id=user_id,
        city=None,
        phone=None,
        field_of_study=None,
        university=None,
        study_level=None,
        onboarding_step=1,
        onboarding_completed=False,
    )


def _legacy_candidate_profile(user_id) -> CandidateProfile:
    return CandidateProfile(
        user_id=user_id,
        city=None,
        phone=None,
        field_of_study=None,
        university=None,
        study_level=None,
        onboarding_step=7,
        onboarding_completed=True,
        onboarding_completed_at=datetime.now(timezone.utc).replace(tzinfo=None),
    )


async def _sync_existing_sso_user(db: AsyncSession, user: User, identity: OAuthIdentity) -> User:
    needs_commit = False

    if not user.full_name.strip() and identity.full_name:
        user.full_name = identity.full_name
        needs_commit = True
    if identity.provider and user.oauth_provider != identity.provider:
        user.oauth_provider = identity.provider
        needs_commit = True
    if identity.oauth_id and user.oauth_id != identity.oauth_id:
        user.oauth_id = identity.oauth_id
        needs_commit = True
    if identity.avatar_url and user.avatar_url != identity.avatar_url:
        user.avatar_url = identity.avatar_url
        needs_commit = True

    if user.role == UserRole.CANDIDATE:
        profile_result = await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == user.id)
        )
        profile = profile_result.scalar_one_or_none()
        if profile is None:
            db.add(_legacy_candidate_profile(user.id))
            needs_commit = True

    if needs_commit:
        await db.commit()
        await db.refresh(user)

    return user


async def _create_sso_candidate(db: AsyncSession, identity: OAuthIdentity) -> User:
    user = User(
        email=identity.email,
        password_hash=hash_password(secrets.token_urlsafe(32)),
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name=identity.full_name,
        oauth_provider=identity.provider,
        oauth_id=identity.oauth_id,
        avatar_url=identity.avatar_url,
        company_id=None,
        company_role=None,
    )
    db.add(user)
    await db.flush()
    db.add(_new_candidate_profile(user.id))

    await db.commit()
    await db.refresh(user)
    return user


def _set_access_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )


def _build_sso_response(
    request: Request,
    token: str,
    user: User,
    handoff_code: str,
    popup_origin: str,
    attempt_id: str,
    provider: str,
) -> Response:
    accept_header = request.headers.get("accept", "").lower()
    wants_html = "text/html" in accept_header

    if wants_html:
        callback_url = f"{popup_origin}/auth/sso/callback?{urlencode({'handoff': handoff_code, 'attempt': attempt_id, 'provider': provider})}"
        response: Response = RedirectResponse(
            url=callback_url,
            status_code=status.HTTP_302_FOUND,
        )
    else:
        response = JSONResponse(
            status_code=status.HTTP_200_OK,
            content=TokenResponse(token=token, user=UserOut.model_validate(user)).model_dump(mode="json"),
        )

    if not wants_html:
        _set_access_cookie(response, token)
    return response


def _build_sso_error_response(
    request: Request,
    detail: str,
    status_code: int,
    provider: str,
    popup_origin: str | None = None,
    attempt_id: str | None = None,
) -> Response:
    if "text/html" in request.headers.get("accept", "").lower():
        origin = popup_origin or settings.frontend_url.rstrip("/")
        callback_url = (
            f"{origin}/auth/sso/callback?"
            f"{urlencode({'error': detail, 'provider': provider, 'attempt': attempt_id or ''})}"
        )
        return RedirectResponse(url=callback_url, status_code=status.HTTP_302_FOUND)
    raise HTTPException(status_code=status_code, detail=detail)


@router.get("/sso/providers")
async def sso_providers() -> dict[str, bool]:
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
        "linkedin": bool(settings.linkedin_client_id and settings.linkedin_client_secret),
    }


@router.get("/sso/{provider}/start")
async def sso_start(
    provider: str,
    request: Request,
    popup_origin: str | None = None,
    attempt_id: str | None = None,
) -> RedirectResponse:
    oauth_provider = get_oauth_provider(provider)
    request_redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
    redirect_uri = resolve_redirect_uri(oauth_provider, request_redirect_uri)
    state_token = create_oauth_state(
        oauth_provider.name,
        popup_origin or settings.frontend_url,
        attempt_id or secrets.token_urlsafe(24),
    )
    authorization_url = build_oauth_authorize_url(oauth_provider, redirect_uri, state_token)
    logger.info("sso_start", provider=oauth_provider.name)
    return RedirectResponse(url=authorization_url, status_code=status.HTTP_302_FOUND)


@router.get("/sso/{provider}/callback", name="sso_callback")
async def sso_callback(
    provider: str,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> Response:
    try:
        oauth_provider = get_oauth_provider(provider)
    except HTTPException as exc:
        return _build_sso_error_response(request, str(exc.detail), exc.status_code, provider)

    if error:
        logger.warning("sso_error", provider=provider, error=error)
        popup_origin = None
        attempt_id = None
        if state:
            try:
                popup_origin, attempt_id = verify_oauth_state(state, oauth_provider.name)
            except HTTPException:
                pass
        return _build_sso_error_response(
            request, "sso_provider_error", status.HTTP_400_BAD_REQUEST,
            oauth_provider.name, popup_origin, attempt_id,
        )

    if not code or not state:
        logger.warning("sso_error", provider=provider, error="sso_code_or_state_missing")
        return _build_sso_error_response(
            request, "sso_code_or_state_missing", status.HTTP_400_BAD_REQUEST,
            oauth_provider.name,
        )

    try:
        popup_origin, attempt_id = verify_oauth_state(state, oauth_provider.name)
        request_redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
        redirect_uri = resolve_redirect_uri(oauth_provider, request_redirect_uri)
        provider_access_token = await exchange_code_for_access_token(oauth_provider, code, redirect_uri)
        identity = await fetch_user_identity(oauth_provider, provider_access_token)
        result = await db.execute(select(User).where(User.email == identity.email))
        user = result.scalar_one_or_none()
    except HTTPException as exc:
        logger.warning(
            "sso_error",
            provider=provider,
            status_code=exc.status_code,
            reason="provider_request_rejected",
        )
        return _build_sso_error_response(
            request, str(exc.detail), exc.status_code, oauth_provider.name,
            locals().get("popup_origin"), locals().get("attempt_id"),
        )
    except Exception as exc:
        logger.error(
            "sso_error",
            provider=provider,
            reason="sso_internal_error",
            exception_type=type(exc).__name__,
        )
        return _build_sso_error_response(
            request, "sso_internal_error", status.HTTP_500_INTERNAL_SERVER_ERROR,
            oauth_provider.name, locals().get("popup_origin"), locals().get("attempt_id"),
        )

    is_new_registration = user is None
    if is_new_registration:
        user = await _create_sso_candidate(db, identity)
    else:
        user = await _sync_existing_sso_user(db, user, identity)
    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )
    wants_html = "text/html" in request.headers.get("accept", "").lower()
    handoff_code = (
        await create_oauth_handoff(token, str(user.id), is_new_registration)
        if wants_html
        else ""
    )

    response = _build_sso_response(
        request, token, user, handoff_code, popup_origin, attempt_id, oauth_provider.name
    )
    logger.info("sso_success", provider=oauth_provider.name, user_id=str(user.id))
    return response


@router.post("/oauth/handoff/exchange", response_model=OAuthHandoffExchangeResponse)
async def exchange_oauth_handoff(
    data: OAuthHandoffExchangeRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    handoff = await consume_oauth_handoff(data.code)
    try:
        user_id = UUID(str(handoff["user_id"]))
    except (ValueError, TypeError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_sso_handoff") from exc
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_sso_handoff")
    token = str(handoff["token"])
    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content=OAuthHandoffExchangeResponse(
            token=token,
            user=UserOut.model_validate(user),
            is_new_registration=bool(handoff.get("is_new_registration")),
        ).model_dump(mode="json"),
    )
    _set_access_cookie(response, token)
    return response


@router.post(
    "/register",
    response_model=RegistrationStarted,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("10/minute")
async def register(
    data: RegisterRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RegistrationStarted:
    """Start password registration: validate, create/refresh a pending OTP
    record, email the code. No user account and no token exist until
    POST /auth/verify-email succeeds."""
    email = data.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is not None:
        logger.warning("register_failed", email=email, reason="email_in_use")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    res = await db.execute(
        text("SELECT * FROM pending_registrations WHERE email=:email FOR UPDATE"), {"email": email}
    )
    pending = res.mappings().first()
    if pending is not None:
        if not is_expired(pending["otp_expires_at"], now):
            remaining = cooldown_remaining_seconds(pending["last_otp_sent_at"], now)
            if remaining > 0:
                raise HTTPException(
                    status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                    detail={"message": "Verification already sent", "retry_after_seconds": remaining},
                )
        else:
            await db.execute(text("DELETE FROM pending_registrations WHERE email=:email"), {"email": email})
            pending = None

    otp = generate_otp()
    expires_at = otp_expiry()
    registration_id = uuid4()
    password_hash = hash_password(data.password)
    full_name = data.full_name.strip()
    if pending is None:
        try:
            await db.execute(
                text(
                    "INSERT INTO pending_registrations (id, email, full_name, password_hash, otp_hash, otp_expires_at, otp_attempts, last_otp_sent_at, created_at)"
                    " VALUES (:id, :email, :name, :pw, :otp, :exp, 0, :now, :now)"
                ),
                {
                    "id": str(registration_id),
                    "email": email,
                    "name": full_name,
                    "pw": password_hash,
                    "otp": hash_otp(otp),
                    "exp": expires_at,
                    "now": now,
                },
            )
            await db.flush()
        except IntegrityError:
            # Lost a concurrent race: another request created the row first.
            await db.rollback()
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A verification is already in progress for this email",
            )
    else:
        # This is a complete attempt replacement, not an OTP-only rotation.
        # The new public attempt id, password hash, name, and OTP move together
        # under the email row lock. A code or id from the former attempt can no
        # longer complete registration or inherit the other attempt's fields.
        await db.execute(
            text(
                "UPDATE pending_registrations SET id=:id, full_name=:name,"
                " password_hash=:pw, otp_hash=:otp, otp_expires_at=:exp,"
                " otp_attempts=0, last_otp_sent_at=:now, created_at=:now"
                " WHERE email=:email"
            ),
            {
                "id": str(registration_id),
                "name": full_name,
                "pw": password_hash,
                "otp": hash_otp(otp),
                "exp": expires_at,
                "now": now,
                "email": email,
            },
        )
        await db.flush()

    try:
        await asyncio.to_thread(send_otp_email, email, full_name, otp, expires_at)
    except RuntimeError:
        # Roll back the challenge rotation. A previously delivered code stays
        # usable; a brand-new undelivered challenge is never persisted.
        await db.rollback()
        logger.warning("register_failed", email=email, reason="otp_email_failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not send verification email. Please try again.",
        )

    await db.commit()

    logger.info("register_otp_sent", email=email)
    return RegistrationStarted(
        detail="Verification code sent",
        email=email,
        registration_id=registration_id,
        expires_in_seconds=settings.otp_expire_minutes * 60,
    )


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_email(
    data: VerifyEmailRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    """Verify the OTP and atomically create the real user account."""
    from app.models import CandidateProfile

    email = data.email.strip().lower()
    registration_id = data.registration_id
    code = data.otp.strip()
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    res = await db.execute(
        text(
            "SELECT * FROM pending_registrations"
            " WHERE id=:id AND email=:email FOR UPDATE"
        ),
        {"id": str(registration_id), "email": email},
    )
    pending = res.mappings().first()
    if pending is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid or expired verification code")

    if is_expired(pending["otp_expires_at"], now):
        await db.execute(
            text("DELETE FROM pending_registrations WHERE id=:id"),
            {"id": str(registration_id)},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired. Please register again.",
        )

    if attempts_exceeded(pending["otp_attempts"]):
        await db.execute(
            text("DELETE FROM pending_registrations WHERE id=:id"),
            {"id": str(registration_id)},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Too many attempts. Please register again.",
        )

    if not verify_otp(code, pending["otp_hash"]):
        next_attempt = pending["otp_attempts"] + 1
        if attempts_exceeded(next_attempt):
            # Destroy the challenge as soon as its final allowed attempt is
            # spent. A correct guess after this point can never revive it.
            await db.execute(
                text("DELETE FROM pending_registrations WHERE id=:id"),
                {"id": str(registration_id)},
            )
        else:
            await db.execute(
                text(
                    "UPDATE pending_registrations SET otp_attempts=:attempts"
                    " WHERE id=:id"
                ),
                {"attempts": next_attempt, "id": str(registration_id)},
            )
        await db.commit()
        detail = "Too many attempts. Please register again." if attempts_exceeded(next_attempt) else "Invalid verification code"
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail)

    result = await db.execute(select(User).where(User.email == email))
    if result.scalar_one_or_none() is not None:
        await db.execute(text("DELETE FROM pending_registrations WHERE email=:email"), {"email": email})
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    user = User(
        email=email,
        password_hash=pending["password_hash"],
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name=pending["full_name"],
        company_id=None,
        company_role=None,
    )
    db.add(user)
    await db.flush()

    db.add(_new_candidate_profile(user.id))
    await db.execute(text("DELETE FROM pending_registrations WHERE email=:email"), {"email": email})
    await db.commit()
    await db.refresh(user)

    logger.info("register_success", user_id=str(user.id), role=user.role.value)

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )
    return TokenResponse(token=token, user=UserOut.model_validate(user))


@router.post(
    "/resend-verification",
    response_model=RegistrationStarted,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("5/minute")
async def resend_verification(
    data: ResendVerificationRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RegistrationStarted:
    """Issue a fresh OTP, invalidating the previous one. Cooldown enforced."""
    email = data.email.strip().lower()
    registration_id = data.registration_id
    now = datetime.now(timezone.utc).replace(tzinfo=None)

    res = await db.execute(
        text(
            "SELECT * FROM pending_registrations"
            " WHERE id=:id AND email=:email FOR UPDATE"
        ),
        {"id": str(registration_id), "email": email},
    )
    pending = res.mappings().first()
    if pending is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No pending verification for this email")

    if is_expired(pending["otp_expires_at"], now):
        await db.execute(
            text("DELETE FROM pending_registrations WHERE id=:id"),
            {"id": str(registration_id)},
        )
        await db.commit()
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification code expired. Please register again.",
        )

    remaining = cooldown_remaining_seconds(pending["last_otp_sent_at"], now)
    if remaining > 0:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={"message": "Please wait before requesting a new code", "retry_after_seconds": remaining},
        )

    otp = generate_otp()
    expires_at = otp_expiry()
    await db.execute(
        text(
            "UPDATE pending_registrations SET otp_hash=:otp, otp_expires_at=:exp,"
            " otp_attempts=0, last_otp_sent_at=:now WHERE id=:id"
        ),
        {
            "otp": hash_otp(otp),
            "exp": expires_at,
            "now": now,
            "id": str(registration_id),
        },
    )
    await db.flush()

    try:
        await asyncio.to_thread(send_otp_email, email, pending["full_name"], otp, expires_at)
    except RuntimeError:
        # Roll back to the previous code so the user is not locked out.
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Could not send verification email. Please try again.",
        )
    await db.commit()

    logger.info("register_otp_resent", email=email)
    return RegistrationStarted(
        detail="Verification code sent",
        email=email,
        registration_id=registration_id,
        expires_in_seconds=settings.otp_expire_minutes * 60,
    )


@router.post("/login", response_model=TokenResponse | TwoFactorChallengeResponse)
@limiter.limit("5/minute")
async def login(
    data: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse | TwoFactorChallengeResponse:
    email = data.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    password_verified = False
    replacement_hash: str | None = None
    if user is not None:
        password_verified, replacement_hash = verify_password_and_rehash(
            data.password,
            user.password_hash,
        )
    if user is None or not password_verified:
        logger.warning("login_failed", email=email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.role == UserRole.RECRUITER and not user.is_approved:
        logger.warning("login_failed", email=email, reason="recruiter_unapproved")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter account is pending admin approval",
        )

    if replacement_hash is not None:
        user.password_hash = replacement_hash
        await db.commit()
        logger.info("password_hash_upgraded", user_id=str(user.id), algorithm="argon2id")

    trusted_device = data.trusted_device_token or request.cookies.get(settings.trusted_device_cookie_name)
    trusted_device_valid = False
    if user.is_2fa_enabled and trusted_device:
        try:
            trusted_payload = verify_token(trusted_device)
            trusted_device_valid = (
                trusted_payload.get("type") == "trusted_device"
                and trusted_payload.get("sub") == str(user.id)
                and trusted_payload.get("factor")
                == hashlib.sha256((user.totp_secret or "").encode()).hexdigest()
            )
        except ValueError:
            trusted_device_valid = False

    if user.is_2fa_enabled and not trusted_device_valid:
        from datetime import timedelta
        mfa_token = create_access_token(
            {"sub": str(user.id), "type": "mfa_pending"},
            expires_delta=timedelta(minutes=5),
        )
        logger.info("login_2fa_challenge_issued", user_id=str(user.id))
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"require_2fa": True, "mfa_token": mfa_token},
        )

    if user.is_2fa_enabled:
        logger.info("login_trusted_device", user_id=str(user.id))

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )
    logger.info("login_success", user_id=str(user.id), role=user.role.value)
    return TokenResponse(token=token, user=UserOut.model_validate(user))



@router.put("/account/name", response_model=UserMeOut)
async def update_account_name(
    data: AccountNameUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMeOut:
    full_name = data.full_name.strip()
    if len(full_name) < 2:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Name must contain at least two characters.")
    current_user.full_name = full_name
    await db.commit()
    result = await db.execute(
        select(User).options(joinedload(User.profile)).where(User.id == current_user.id)
    )
    return UserMeOut.model_validate(result.scalar_one())


@router.post("/account/email/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def request_email_change(
    data: EmailChangeRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _verify_sensitive_action(current_user, data.current_password, data.two_factor_code)
    new_email = str(data.new_email).strip().lower()
    if new_email == current_user.email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This is already your email address.")
    existing = await db.scalar(select(User.id).where(User.email == new_email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That email address is already in use.")
    otp = generate_otp()
    current_user.pending_email = new_email
    current_user.pending_email_otp_hash = hash_otp(otp)
    current_user.pending_email_expires_at = otp_expiry()
    current_user.pending_email_attempts = 0
    try:
        await asyncio.to_thread(send_email_change_code, new_email, current_user.full_name, otp)
    except Exception:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not send the verification code.")
    await db.commit()
    return {"detail": "Verification code sent to the new email address.", "email": new_email}


@router.post("/account/email/confirm", response_model=TokenResponse)
@limiter.limit("10/hour")
async def confirm_email_change(
    data: EmailChangeConfirm,
    request: Request,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    if not current_user.pending_email or not current_user.pending_email_otp_hash or not current_user.pending_email_expires_at:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No email change is pending.")
    if is_expired(current_user.pending_email_expires_at):
        current_user.pending_email = current_user.pending_email_otp_hash = None
        current_user.pending_email_expires_at = None
        current_user.pending_email_attempts = 0
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code expired. Request a new one.")
    if not verify_otp(data.otp, current_user.pending_email_otp_hash):
        current_user.pending_email_attempts += 1
        if current_user.pending_email_attempts >= settings.otp_max_attempts:
            current_user.pending_email = current_user.pending_email_otp_hash = None
            current_user.pending_email_expires_at = None
            current_user.pending_email_attempts = 0
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code.")
    new_email = current_user.pending_email
    current_user.email = new_email
    current_user.pending_email = current_user.pending_email_otp_hash = None
    current_user.pending_email_expires_at = None
    current_user.pending_email_attempts = 0
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That email address is already in use.") from exc
    token = create_access_token({"sub": str(current_user.id), "email": current_user.email, "role": current_user.role.value})
    _set_access_cookie(response, token)
    return TokenResponse(token=token, user=UserOut.model_validate(current_user))


@router.post("/account/password")
@limiter.limit("5/hour")
async def change_account_password(
    data: PasswordChangeRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    _verify_sensitive_action(current_user, data.current_password, data.two_factor_code)
    if verify_password(data.new_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different from the current password.")
    current_user.password_hash = hash_password(data.new_password)
    await db.commit()
    return {"detail": "Password changed successfully."}


@router.put("/me/avatar", response_model=UserMeOut)
async def update_avatar(
    data: AvatarUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMeOut:
    current_user.avatar_url = data.avatar_url.strip() or None
    await db.commit()
    await db.refresh(current_user)
    result = await db.execute(
        select(User).options(joinedload(User.profile)).where(User.id == current_user.id)
    )
    user = result.scalar_one()
    return UserMeOut.model_validate(user)


@router.get("/me", response_model=UserMeOut)
async def me(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMeOut:
    result = await db.execute(
        select(User).options(joinedload(User.profile)).where(User.id == current_user.id)
    )
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    return UserMeOut.model_validate(user)
