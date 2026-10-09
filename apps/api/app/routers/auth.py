import asyncio
import io
import secrets
import json
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4
from typing import Annotated
from urllib.parse import urlencode

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from fastapi.responses import JSONResponse, RedirectResponse, StreamingResponse
from sqlalchemy import select, text, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.core.audit import log_audit
from app.database import get_db
from app.dependencies import get_current_access_payload, get_current_user
from app.models import AccountDeletionRequest, CandidateProfile, Company, EmailDelivery, OAuthAccount, User, UserRole
from app.limiter import limiter
from app.observability import get_logger
from app.schemas import (
    AccountNameUpdate,
    AccountDataExportRequest,
    AccountDeletionCreate,
    AccountDeletionOut,
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
    build_email_change_email,
    build_otp_email,
    cooldown_remaining_seconds,
    generate_otp,
    hash_otp,
    is_expired,
    otp_expiry,
    verification_art_attachment,
    verify_otp,
)
from app.services.email_outbox import (
    EmailOutboxUnavailable,
    deliver_email_job,
    enqueue_email_delivery,
)
from app.services.oauth_service import (
    OAuthIdentity,
    build_oauth_authorize_url,
    create_oauth_attempt,
    create_oauth_handoff,
    consume_oauth_attempt,
    consume_oauth_handoff,
    exchange_code_for_access_token,
    fetch_user_identity,
    get_oauth_provider,
    resolve_redirect_uri,
)
from app.services.passwords import hash_password, verify_password, verify_password_and_rehash
from app.services.authentication import (
    AuthenticationRejected,
    AuthenticationStoreUnavailable,
    complete_authentication,
    ensure_access_session_active,
    ensure_account_can_authenticate,
    ensure_credential_matches_account,
    ensure_mfa_challenge_active,
    issue_access_token,
    revoke_access_session,
    revoke_trusted_device,
)
from app.utils.jwt import verify_access_token, verify_mfa_token
from app.services.auth_cookies import (
    clear_auth_cookies,
    clear_oauth_browser_cookie,
    set_access_cookie,
    set_oauth_browser_cookie,
)
from app.services.two_factor import TotpSecretUnavailable, consume_second_factor
from app.services.avatar_storage import (
    AvatarStorageError,
    assert_avatar_path,
    build_avatar_path,
    delete_avatar,
    download_avatar,
    upload_avatar,
)
from app.services.company_logo import (
    CONTENT_TYPE_BY_EXT as AVATAR_CONTENT_TYPE_BY_EXT,
    MAX_LOGO_BYTES as MAX_AVATAR_BYTES,
    LogoResourceLimitError,
    LogoValidationTimeoutError,
    validate_logo_content_async,
    validate_logo_file,
)
from app.services.upload_limits import UploadTooLargeError, read_upload_limited
from app.services.privacy import DELETION_GRACE_DAYS, build_account_export


router = APIRouter()
logger = get_logger("auth")


async def _verify_sensitive_action(
    db: AsyncSession,
    user: User,
    password: str,
    two_factor_code: str | None,
) -> User:
    locked = (
        await db.execute(select(User).where(User.id == user.id).with_for_update())
    ).scalar_one()
    if not verify_password(password, locked.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid account password.")
    if not locked.is_2fa_enabled:
        return locked
    if not two_factor_code:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Two-factor code is required.")
    try:
        consumed = consume_second_factor(locked, two_factor_code)
    except TotpSecretUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Two-factor authentication is temporarily unavailable.",
        ) from exc
    if not consumed:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid authenticator or recovery code.")
    return locked


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


async def _supersede_code_deliveries(
    db: AsyncSession,
    *,
    kind: str,
    resource_id: UUID,
) -> None:
    """Stop queued codes after rotation or successful consumption."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    await db.execute(
        update(EmailDelivery)
        .where(
            EmailDelivery.kind == kind,
            EmailDelivery.resource_id == resource_id,
            EmailDelivery.status.in_(("pending", "retry")),
        )
        .values(
            status="failed",
            last_error_code="EMAIL_DELIVERY_SUPERSEDED",
            lease_owner=None,
            lease_until=None,
            updated_at=now,
        )
    )


async def _queue_registration_code(
    db: AsyncSession,
    *,
    registration_id: UUID,
    email: str,
    full_name: str,
    otp: str,
    expires_at: datetime,
) -> EmailDelivery:
    subject, html = build_otp_email(full_name, otp)
    return await enqueue_email_delivery(
        db,
        kind="registration_verification",
        dedupe_key=f"registration-verification:{registration_id}:{uuid4()}",
        resource_type="pending_registration",
        resource_id=registration_id,
        to_email=email,
        subject=subject,
        html=html,
        attachments=[verification_art_attachment()],
        expires_at=expires_at,
    )


async def _queue_email_change_code(
    db: AsyncSession,
    *,
    user: User,
    new_email: str,
    otp: str,
    expires_at: datetime,
) -> EmailDelivery:
    subject, html = build_email_change_email(user.full_name, otp)
    return await enqueue_email_delivery(
        db,
        kind="email_change_verification",
        dedupe_key=f"email-change-verification:{user.id}:{uuid4()}",
        resource_type="user",
        resource_id=user.id,
        to_email=new_email,
        subject=subject,
        html=html,
        expires_at=expires_at,
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


async def _sync_existing_sso_user(
    db: AsyncSession,
    user: User,
    identity: OAuthIdentity,
    *,
    commit: bool = True,
) -> User:
    needs_commit = False

    if not user.full_name.strip() and identity.full_name:
        user.full_name = identity.full_name
        needs_commit = True
    if identity.provider and not user.oauth_provider:
        user.oauth_provider = identity.provider
        needs_commit = True
    if identity.oauth_id and not user.oauth_id:
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

    if needs_commit and commit:
        await db.commit()
        await db.refresh(user)

    return user


async def _create_sso_candidate(
    db: AsyncSession,
    identity: OAuthIdentity,
    *,
    commit: bool = True,
) -> User:
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

    if commit:
        await db.commit()
        await db.refresh(user)
    return user


async def _optional_authenticated_cookie_user(
    request: Request,
    db: AsyncSession,
) -> User | None:
    token = (request.cookies.get(settings.access_token_cookie_name) or "").strip()
    if not token:
        return None
    try:
        payload = verify_access_token(token)
        await ensure_access_session_active(payload)
        user_id = UUID(str(payload["sub"]))
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="authentication_service_unavailable",
        ) from exc
    except (AuthenticationRejected, ValueError, TypeError, KeyError):
        return None
    user = (
        await db.execute(select(User).where(User.id == user_id))
    ).scalar_one_or_none()
    if user is None:
        return None
    try:
        ensure_account_can_authenticate(user)
        ensure_credential_matches_account(payload, user)
    except AuthenticationRejected:
        return None
    return user


def _legacy_oauth_link_matches(user: User, identity: OAuthIdentity) -> bool:
    """Recognize a provider link created by the legacy user-column schema."""
    return (
        (user.oauth_provider or "").strip().lower() == identity.provider
        and (user.oauth_id or "").strip() == identity.oauth_id
    )


async def _resolve_oauth_user(
    db: AsyncSession,
    request: Request,
    identity: OAuthIdentity,
) -> tuple[User, bool]:
    """Resolve a stable provider subject without email-based account takeover.

    A verified provider email may create a new candidate account. It never
    silently links to an existing local account: that requires a valid current
    local session for the same user. The only compatibility exception is an
    exact provider + subject already recorded by the legacy schema, after
    which the subject is stored under the hardened uniqueness constraints.
    """
    linked_row = (
        await db.execute(
            select(OAuthAccount, User)
            .join(User, User.id == OAuthAccount.user_id)
            .where(
                OAuthAccount.provider == identity.provider,
                OAuthAccount.subject == identity.oauth_id,
            )
        )
    ).first()
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if linked_row is not None:
        account, user = linked_row
        if account.issuer.rstrip("/") != identity.issuer.rstrip("/"):
            raise HTTPException(status_code=400, detail="sso_issuer_invalid")
        account.last_login_at = now
        await _sync_existing_sso_user(db, user, identity, commit=False)
        await db.commit()
        await db.refresh(user)
        return user, False

    existing = (
        await db.execute(select(User).where(User.email == identity.email))
    ).scalar_one_or_none()
    is_new_registration = existing is None
    if existing is None:
        if not identity.email_verified:
            raise HTTPException(status_code=400, detail="sso_email_unverified")
        user = await _create_sso_candidate(db, identity, commit=False)
    else:
        # Older releases stored the already-verified provider link directly on
        # the user row. Recover that link only when the immutable provider
        # subject matches exactly; a matching email alone is never sufficient.
        if not _legacy_oauth_link_matches(existing, identity):
            authenticated = await _optional_authenticated_cookie_user(request, db)
            if authenticated is None or authenticated.id != existing.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="sso_link_confirmation_required",
                )
        user = existing
        await _sync_existing_sso_user(db, user, identity, commit=False)

    db.add(
        OAuthAccount(
            user_id=user.id,
            provider=identity.provider,
            subject=identity.oauth_id,
            issuer=identity.issuer,
            email_at_link=identity.email,
            created_at=now,
            last_login_at=now,
        )
    )
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        linked_after_race = (
            await db.execute(
                select(OAuthAccount, User)
                .join(User, User.id == OAuthAccount.user_id)
                .where(
                    OAuthAccount.provider == identity.provider,
                    OAuthAccount.subject == identity.oauth_id,
                )
            )
        ).first()
        if linked_after_race is None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="sso_link_confirmation_required",
            ) from exc
        _, user = linked_after_race
        is_new_registration = False
    await db.refresh(user)
    return user, is_new_registration


def _build_sso_response(
    request: Request,
    token: str,
    user: User,
    handoff_code: str,
    popup_origin: str,
    attempt_id: str,
    provider: str,
    *,
    requires_2fa: bool = False,
    is_new_registration: bool = False,
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
        if requires_2fa:
            content = TwoFactorChallengeResponse(
                mfa_token=token,
                is_new_registration=is_new_registration,
            ).model_dump(mode="json")
        else:
            content = OAuthHandoffExchangeResponse(
                token=token,
                user=UserOut.model_validate(user),
                is_new_registration=is_new_registration,
            ).model_dump(mode="json")
        response = JSONResponse(
            status_code=status.HTTP_200_OK,
            content=content,
        )

    if not wants_html and not requires_2fa:
        set_access_cookie(response, token)
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
    oauth_attempt = await create_oauth_attempt(
        oauth_provider.name,
        popup_origin or settings.frontend_url,
        attempt_id or secrets.token_urlsafe(24),
        request.cookies.get(settings.oauth_browser_cookie_name),
    )
    authorization_url = build_oauth_authorize_url(
        oauth_provider,
        redirect_uri,
        oauth_attempt.state,
        code_verifier=oauth_attempt.code_verifier,
        nonce=oauth_attempt.nonce,
    )
    logger.info("sso_start", provider=oauth_provider.name)
    response = RedirectResponse(url=authorization_url, status_code=status.HTTP_302_FOUND)
    set_oauth_browser_cookie(response, oauth_attempt.browser_id)
    return response


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
                oauth_attempt = await consume_oauth_attempt(
                    state,
                    oauth_provider.name,
                    request.cookies.get(settings.oauth_browser_cookie_name),
                )
                popup_origin = oauth_attempt.popup_origin
                attempt_id = oauth_attempt.attempt_id
            except HTTPException:
                pass
        response = _build_sso_error_response(
            request, "sso_provider_error", status.HTTP_400_BAD_REQUEST,
            oauth_provider.name, popup_origin, attempt_id,
        )
        clear_oauth_browser_cookie(response)
        return response

    if not code or not state:
        logger.warning("sso_error", provider=provider, error="sso_code_or_state_missing")
        return _build_sso_error_response(
            request, "sso_code_or_state_missing", status.HTTP_400_BAD_REQUEST,
            oauth_provider.name,
        )

    try:
        oauth_attempt = await consume_oauth_attempt(
            state,
            oauth_provider.name,
            request.cookies.get(settings.oauth_browser_cookie_name),
        )
        popup_origin, attempt_id = oauth_attempt.popup_origin, oauth_attempt.attempt_id
        request_redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
        redirect_uri = resolve_redirect_uri(oauth_provider, request_redirect_uri)
        provider_access_token = await exchange_code_for_access_token(
            oauth_provider,
            code,
            redirect_uri,
            code_verifier=oauth_attempt.code_verifier,
        )
        identity = await fetch_user_identity(oauth_provider, provider_access_token)
        user, is_new_registration = await _resolve_oauth_user(db, request, identity)
    except HTTPException as exc:
        logger.warning(
            "sso_error",
            provider=provider,
            status_code=exc.status_code,
            reason="provider_request_rejected",
            error_code=str(exc.detail),
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

    trusted_device = request.cookies.get(settings.trusted_device_cookie_name)
    try:
        completion = await complete_authentication(
            user,
            trusted_device_token=trusted_device,
        )
    except AuthenticationRejected:
        return _build_sso_error_response(
            request,
            "account_not_active",
            status.HTTP_403_FORBIDDEN,
            oauth_provider.name,
            popup_origin,
            attempt_id,
        )
    except AuthenticationStoreUnavailable:
        return _build_sso_error_response(
            request,
            "authentication_service_unavailable",
            status.HTTP_503_SERVICE_UNAVAILABLE,
            oauth_provider.name,
            popup_origin,
            attempt_id,
        )
    token = completion.token
    wants_html = "text/html" in request.headers.get("accept", "").lower()
    handoff_code = (
        await create_oauth_handoff(
            token,
            str(user.id),
            is_new_registration,
            requires_2fa=completion.requires_2fa,
        )
        if wants_html
        else ""
    )

    response = _build_sso_response(
        request,
        token,
        user,
        handoff_code,
        popup_origin,
        attempt_id,
        oauth_provider.name,
        requires_2fa=completion.requires_2fa,
        is_new_registration=is_new_registration,
    )
    clear_oauth_browser_cookie(response)
    logger.info("sso_success", provider=oauth_provider.name, user_id=str(user.id))
    return response


@router.post(
    "/oauth/handoff/exchange",
    response_model=OAuthHandoffExchangeResponse | TwoFactorChallengeResponse,
)
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
    try:
        ensure_account_can_authenticate(user)
    except AuthenticationRejected as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="account_not_active") from exc
    token = str(handoff["token"])
    requires_2fa = bool(handoff.get("requires_2fa"))
    try:
        if requires_2fa:
            payload = verify_mfa_token(token)
            await ensure_mfa_challenge_active(payload)
        else:
            payload = verify_access_token(token)
            await ensure_access_session_active(payload)
        ensure_credential_matches_account(payload, user)
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="authentication_service_unavailable",
        ) from exc
    except (AuthenticationRejected, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_sso_handoff") from exc

    if requires_2fa:
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content=TwoFactorChallengeResponse(
                mfa_token=token,
                is_new_registration=bool(handoff.get("is_new_registration")),
            ).model_dump(mode="json"),
        )
    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content=OAuthHandoffExchangeResponse(
            token=token,
            user=UserOut.model_validate(user),
            is_new_registration=bool(handoff.get("is_new_registration")),
        ).model_dump(mode="json"),
    )
    set_access_cookie(response, token)
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
        logger.warning("register_failed", reason="email_in_use")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    res = await db.execute(
        text("SELECT * FROM pending_registrations WHERE email=:email FOR UPDATE"), {"email": email}
    )
    pending = res.mappings().first()
    previous_registration_id = UUID(str(pending["id"])) if pending is not None else None
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
        if previous_registration_id is not None:
            await _supersede_code_deliveries(
                db,
                kind="registration_verification",
                resource_id=previous_registration_id,
            )
        delivery = await _queue_registration_code(
            db,
            registration_id=registration_id,
            email=email,
            full_name=full_name,
            otp=otp,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        await db.rollback()
        logger.error("register_failed", reason="email_outbox_unavailable")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email service is temporarily unavailable.",
        )

    await db.commit()
    delivery_status = await deliver_email_job(db, delivery.id, worker_id="api-immediate")

    logger.info("register_otp_queued", delivery_status=delivery_status)
    return RegistrationStarted(
        detail=(
            "Verification code sent"
            if delivery_status == "sent"
            else "Verification code queued for delivery"
        ),
        email=email,
        registration_id=registration_id,
        expires_in_seconds=settings.otp_expire_minutes * 60,
        delivery_status=delivery_status,
    )


@router.post("/verify-email", response_model=TokenResponse)
@limiter.limit("10/minute")
async def verify_email(
    data: VerifyEmailRequest,
    request: Request,
    response: Response,
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
        await _supersede_code_deliveries(
            db,
            kind="registration_verification",
            resource_id=registration_id,
        )
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
        await _supersede_code_deliveries(
            db,
            kind="registration_verification",
            resource_id=registration_id,
        )
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
            await _supersede_code_deliveries(
                db,
                kind="registration_verification",
                resource_id=registration_id,
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
    await _supersede_code_deliveries(
        db,
        kind="registration_verification",
        resource_id=registration_id,
    )
    await db.execute(text("DELETE FROM pending_registrations WHERE email=:email"), {"email": email})
    await db.commit()
    await db.refresh(user)

    logger.info("register_success", user_id=str(user.id), role=user.role.value)

    token = issue_access_token(user)
    set_access_cookie(response, token)
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
        await _supersede_code_deliveries(
            db,
            kind="registration_verification",
            resource_id=registration_id,
        )
        delivery = await _queue_registration_code(
            db,
            registration_id=registration_id,
            email=email,
            full_name=pending["full_name"],
            otp=otp,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email service is temporarily unavailable.",
        )
    await db.commit()
    delivery_status = await deliver_email_job(db, delivery.id, worker_id="api-immediate")

    logger.info("register_otp_requeued", delivery_status=delivery_status)
    return RegistrationStarted(
        detail=(
            "Verification code sent"
            if delivery_status == "sent"
            else "Verification code queued for delivery"
        ),
        email=email,
        registration_id=registration_id,
        expires_in_seconds=settings.otp_expire_minutes * 60,
        delivery_status=delivery_status,
    )


@router.post("/login", response_model=TokenResponse | TwoFactorChallengeResponse)
@limiter.limit("5/minute")
async def login(
    data: LoginRequest,
    request: Request,
    response: Response,
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
        logger.warning("login_failed", reason="invalid_credentials")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.role == UserRole.RECRUITER and not user.is_approved:
        logger.warning("login_failed", reason="recruiter_unapproved")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter account is pending admin approval",
        )

    if replacement_hash is not None:
        user.password_hash = replacement_hash
        await db.commit()
        logger.info("password_hash_upgraded", user_id=str(user.id), algorithm="argon2id")

    trusted_device = data.trusted_device_token or request.cookies.get(settings.trusted_device_cookie_name)
    try:
        completion = await complete_authentication(
            user,
            trusted_device_token=trusted_device,
        )
    except AuthenticationRejected as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Account is not active") from exc
    except AuthenticationStoreUnavailable as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc

    if completion.requires_2fa:
        logger.info("login_2fa_challenge_issued", user_id=str(user.id))
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"require_2fa": True, "mfa_token": completion.token},
        )

    if user.is_2fa_enabled:
        logger.info("login_trusted_device", user_id=str(user.id))

    token = completion.token
    set_access_cookie(response, token)
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


@router.post("/account/data-export")
async def export_account_data(
    data: AccountDataExportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    current_user = await _verify_sensitive_action(
        db, current_user, data.current_password, data.two_factor_code
    )
    payload = await build_account_export(db, current_user)
    await db.commit()
    await log_audit(
        db,
        action="ACCOUNT_DATA_EXPORTED",
        actor=current_user,
        company_id=current_user.company_id,
        resource_type="user",
        resource_id=current_user.id,
    )
    filename = f"coditent-account-{current_user.id}.json"
    return Response(
        content=json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/account/deletion", response_model=AccountDeletionOut)
async def get_account_deletion(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountDeletionOut:
    deletion = (
        await db.execute(
            select(AccountDeletionRequest).where(
                AccountDeletionRequest.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()
    if deletion is None:
        raise HTTPException(status_code=404, detail="No account deletion is scheduled")
    return AccountDeletionOut.model_validate(deletion)


@router.post("/account/deletion", response_model=AccountDeletionOut, status_code=202)
async def schedule_account_deletion(
    data: AccountDeletionCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountDeletionOut:
    current_user = await _verify_sensitive_action(
        db, current_user, data.current_password, data.two_factor_code
    )
    if current_user.company_id is not None:
        owned_company = await db.scalar(
            select(Company.id).where(Company.owner_id == current_user.id)
        )
        if owned_company is not None:
            raise HTTPException(
                status_code=409,
                detail="Transfer or archive the company before deleting its owner account",
            )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    execute_after = now + timedelta(days=DELETION_GRACE_DAYS)
    deletion = (
        await db.execute(
            select(AccountDeletionRequest)
            .where(AccountDeletionRequest.user_id == current_user.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if deletion is not None and deletion.status in {"scheduled", "processing", "retry"}:
        return AccountDeletionOut.model_validate(deletion)
    if deletion is None:
        deletion = AccountDeletionRequest(
            user_id=current_user.id,
            status="scheduled",
            execute_after=execute_after,
            next_attempt_at=execute_after,
        )
        db.add(deletion)
    else:
        deletion.status = "scheduled"
        deletion.execute_after = execute_after
        deletion.next_attempt_at = execute_after
        deletion.attempts = 0
        deletion.lease_owner = None
        deletion.lease_expires_at = None
        deletion.last_error_type = None
        deletion.requested_at = now
        deletion.canceled_at = None
        deletion.completed_at = None
    await db.commit()
    await db.refresh(deletion)
    await log_audit(
        db,
        action="ACCOUNT_DELETION_SCHEDULED",
        actor=current_user,
        company_id=current_user.company_id,
        resource_type="account_deletion",
        resource_id=deletion.id,
        details=f"grace_days={DELETION_GRACE_DAYS}",
    )
    return AccountDeletionOut.model_validate(deletion)


@router.delete("/account/deletion", response_model=AccountDeletionOut)
async def cancel_account_deletion(
    data: AccountDataExportRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AccountDeletionOut:
    current_user = await _verify_sensitive_action(
        db, current_user, data.current_password, data.two_factor_code
    )
    deletion = (
        await db.execute(
            select(AccountDeletionRequest)
            .where(AccountDeletionRequest.user_id == current_user.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if deletion is None or deletion.status not in {"scheduled", "retry"}:
        raise HTTPException(status_code=409, detail="Account deletion cannot be canceled")
    deletion.status = "canceled"
    deletion.canceled_at = datetime.now(timezone.utc).replace(tzinfo=None)
    deletion.lease_owner = None
    deletion.lease_expires_at = None
    await db.commit()
    await db.refresh(deletion)
    await log_audit(
        db,
        action="ACCOUNT_DELETION_CANCELED",
        actor=current_user,
        company_id=current_user.company_id,
        resource_type="account_deletion",
        resource_id=deletion.id,
    )
    return AccountDeletionOut.model_validate(deletion)


@router.post("/account/email/request", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/hour")
async def request_email_change(
    data: EmailChangeRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    current_user = await _verify_sensitive_action(
        db, current_user, data.current_password, data.two_factor_code
    )
    new_email = str(data.new_email).strip().lower()
    if new_email == current_user.email.lower():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This is already your email address.")
    existing = await db.scalar(select(User.id).where(User.email == new_email))
    if existing:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That email address is already in use.")
    otp = generate_otp()
    expires_at = otp_expiry()
    current_user.pending_email = new_email
    current_user.pending_email_otp_hash = hash_otp(otp)
    current_user.pending_email_expires_at = expires_at
    current_user.pending_email_attempts = 0
    try:
        await _supersede_code_deliveries(
            db,
            kind="email_change_verification",
            resource_id=current_user.id,
        )
        delivery = await _queue_email_change_code(
            db,
            user=current_user,
            new_email=new_email,
            otp=otp,
            expires_at=expires_at,
        )
    except EmailOutboxUnavailable:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Verification email service is temporarily unavailable.",
        )
    await db.commit()
    delivery_status = await deliver_email_job(db, delivery.id, worker_id="api-immediate")
    return {
        "detail": (
            "Verification code sent to the new email address."
            if delivery_status == "sent"
            else "Verification code queued for delivery."
        ),
        "email": new_email,
        "delivery_status": delivery_status,
    }


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
        await _supersede_code_deliveries(
            db,
            kind="email_change_verification",
            resource_id=current_user.id,
        )
        current_user.pending_email = current_user.pending_email_otp_hash = None
        current_user.pending_email_expires_at = None
        current_user.pending_email_attempts = 0
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Verification code expired. Request a new one.")
    if not verify_otp(data.otp, current_user.pending_email_otp_hash):
        current_user.pending_email_attempts += 1
        if current_user.pending_email_attempts >= settings.otp_max_attempts:
            await _supersede_code_deliveries(
                db,
                kind="email_change_verification",
                resource_id=current_user.id,
            )
            current_user.pending_email = current_user.pending_email_otp_hash = None
            current_user.pending_email_expires_at = None
            current_user.pending_email_attempts = 0
        await db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid verification code.")
    new_email = current_user.pending_email
    await _supersede_code_deliveries(
        db,
        kind="email_change_verification",
        resource_id=current_user.id,
    )
    current_user.email = new_email
    current_user.pending_email = current_user.pending_email_otp_hash = None
    current_user.pending_email_expires_at = None
    current_user.pending_email_attempts = 0
    current_user.auth_version += 1
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="That email address is already in use.") from exc
    token = issue_access_token(current_user)
    set_access_cookie(response, token)
    return TokenResponse(token=token, user=UserOut.model_validate(current_user))


@router.post("/account/password")
@limiter.limit("5/hour")
async def change_account_password(
    data: PasswordChangeRequest,
    request: Request,
    response: Response,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    current_user = await _verify_sensitive_action(
        db, current_user, data.current_password, data.two_factor_code
    )
    if verify_password(data.new_password, current_user.password_hash):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be different from the current password.")
    current_user.password_hash = hash_password(data.new_password)
    current_user.auth_version += 1
    await db.commit()
    clear_auth_cookies(response)
    return {"detail": "Password changed successfully."}


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    request: Request,
    response: Response,
    payload: Annotated[dict, Depends(get_current_access_payload)],
) -> Response:
    """Revoke the active access session and remembered-device credential."""
    try:
        await revoke_access_session(payload)
        await revoke_trusted_device(
            request.cookies.get(settings.trusted_device_cookie_name)
        )
    except AuthenticationStoreUnavailable as exc:
        # Do not claim logout while a still-valid bearer session could remain
        # usable on another process.
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Authentication service unavailable",
        ) from exc
    clear_auth_cookies(response)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.post("/me/avatar", response_model=UserMeOut)
async def upload_account_avatar(
    file: Annotated[UploadFile, File(...)],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserMeOut:
    try:
        data = await read_upload_limited(file, MAX_AVATAR_BYTES)
    except UploadTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 2MB",
        ) from exc
    finally:
        await file.close()
    try:
        ext = validate_logo_file(file.filename, file.content_type, len(data))
        await validate_logo_content_async(data, ext)
    except LogoResourceLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail=str(exc)
        ) from exc
    except LogoValidationTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Avatar could not be validated within the processing limit",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    locked = (
        await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    ).scalar_one()
    old_path = locked.avatar_storage_path
    new_path = build_avatar_path(str(locked.id), ext)
    try:
        await asyncio.to_thread(
            upload_avatar, new_path, data, AVATAR_CONTENT_TYPE_BY_EXT[ext]
        )
    except AvatarStorageError as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    locked.avatar_storage_path = new_path
    locked.avatar_url = f"/auth/users/{locked.id}/avatar"
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        try:
            await asyncio.to_thread(delete_avatar, new_path)
        except AvatarStorageError:
            logger.warning("avatar_failed_upload_cleanup_deferred", user_id=str(locked.id))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Avatar could not be saved",
        ) from exc
    if old_path and old_path != new_path:
        try:
            assert_avatar_path(old_path, str(locked.id))
            await asyncio.to_thread(delete_avatar, old_path)
        except AvatarStorageError:
            logger.warning("avatar_replacement_cleanup_deferred", user_id=str(locked.id))
    await log_audit(
        db,
        action="ACCOUNT_AVATAR_UPDATED",
        actor=locked,
        resource_type="user",
        resource_id=locked.id,
    )
    result = await db.execute(
        select(User).options(joinedload(User.profile)).where(User.id == current_user.id)
    )
    user = result.scalar_one()
    return UserMeOut.model_validate(user)


@router.delete("/me/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def delete_account_avatar(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    locked = (
        await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    ).scalar_one()
    old_path = locked.avatar_storage_path
    if old_path is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    assert_avatar_path(old_path, str(locked.id))
    locked.avatar_storage_path = None
    locked.avatar_url = None
    await db.commit()
    try:
        await asyncio.to_thread(delete_avatar, old_path)
    except AvatarStorageError:
        logger.warning("avatar_delete_cleanup_deferred", user_id=str(locked.id))


@router.get("/users/{user_id}/avatar", response_class=StreamingResponse)
async def stream_account_avatar(
    user_id: UUID,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> StreamingResponse:
    path = (
        await db.execute(select(User.avatar_storage_path).where(User.id == user_id))
    ).scalar_one_or_none()
    if not path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found")
    try:
        assert_avatar_path(path, str(user_id))
        data = await asyncio.to_thread(download_avatar, path)
    except AvatarStorageError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Avatar not found") from exc
    ext = path.rsplit(".", 1)[-1].lower()
    content_type = AVATAR_CONTENT_TYPE_BY_EXT.get(ext, "application/octet-stream")
    return StreamingResponse(
        io.BytesIO(data),
        media_type=content_type,
        headers={"Cache-Control": "public, max-age=300, immutable"},
    )


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
