import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse, RedirectResponse
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user
from app.models import CandidateProfile, User, UserRole
from app.limiter import limiter
from app.observability import get_logger
from app.schemas import (
    LoginRequest,
    OAuthCompleteRegistrationRequest,
    OAuthCompleteRegistrationResponse,
    RegisterRequest,
    TokenResponse,
    UserMeOut,
    UserOut,
)
from app.services.oauth_service import (
    OAuthIdentity,
    build_frontend_choose_role_url,
    build_frontend_dashboard_url,
    build_oauth_authorize_url,
    create_oauth_state,
    create_onboarding_session,
    exchange_code_for_access_token,
    fetch_user_identity,
    get_oauth_provider,
    resolve_redirect_uri,
    validate_oauth_role,
    verify_onboarding_session,
    verify_oauth_state,
)
from app.utils.jwt import create_access_token


router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = get_logger("auth")


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
            db.add(
                CandidateProfile(
                    user_id=user.id,
                    city=None,
                    phone=None,
                    field_of_study=None,
                    university=None,
                    study_level=None,
                )
            )
            needs_commit = True

    if needs_commit:
        await db.commit()
        await db.refresh(user)

    return user


async def _create_sso_user(db: AsyncSession, identity: OAuthIdentity, role: UserRole) -> User:
    user = User(
        email=identity.email,
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        role=role,
        is_approved=role != UserRole.RECRUITER,
        full_name=identity.full_name,
        oauth_provider=identity.provider,
        oauth_id=identity.oauth_id,
        avatar_url=identity.avatar_url,
    )
    db.add(user)
    await db.flush()

    if role == UserRole.CANDIDATE:
        db.add(
            CandidateProfile(
                user_id=user.id,
                city=None,
                phone=None,
                field_of_study=None,
                university=None,
                study_level=None,
            )
        )

    await db.commit()
    await db.refresh(user)
    return user


def _build_sso_response(request: Request, token: str, user: User) -> Response:
    accept_header = request.headers.get("accept", "").lower()
    wants_html = "text/html" in accept_header

    if wants_html:
        response: Response = RedirectResponse(
            url=build_frontend_dashboard_url(),
            status_code=status.HTTP_302_FOUND,
        )
    else:
        response = JSONResponse(
            status_code=status.HTTP_200_OK,
            content=TokenResponse(token=token, user=UserOut.model_validate(user)).model_dump(),
        )

    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    return response


def _build_onboarding_response(request: Request, onboarding_token: str) -> Response:
    accept_header = request.headers.get("accept", "").lower()
    wants_html = "text/html" in accept_header

    if wants_html:
        response: Response = RedirectResponse(
            url=build_frontend_choose_role_url(),
            status_code=status.HTTP_302_FOUND,
        )
    else:
        response = JSONResponse(
            status_code=status.HTTP_202_ACCEPTED,
            content={"detail": "oauth_role_required"},
        )

    response.set_cookie(
        key=settings.oauth_onboarding_cookie_name,
        value=onboarding_token,
        httponly=True,
        secure=settings.oauth_onboarding_cookie_secure,
        samesite=settings.oauth_onboarding_cookie_samesite,
        max_age=settings.oauth_onboarding_expire_minutes * 60,
        path="/",
    )
    return response


def _clear_onboarding_cookie(response: Response) -> None:
    response.set_cookie(
        key=settings.oauth_onboarding_cookie_name,
        value="",
        httponly=True,
        secure=settings.oauth_onboarding_cookie_secure,
        samesite=settings.oauth_onboarding_cookie_samesite,
        max_age=0,
        path="/",
    )


@router.get("/sso/providers")
async def sso_providers() -> dict[str, bool]:
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
        "linkedin": bool(settings.linkedin_client_id and settings.linkedin_client_secret),
    }


@router.get("/sso/{provider}/start")
async def sso_start(provider: str, request: Request) -> RedirectResponse:
    oauth_provider = get_oauth_provider(provider)
    request_redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
    redirect_uri = resolve_redirect_uri(oauth_provider, request_redirect_uri)
    state_token = create_oauth_state(oauth_provider.name)
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
    oauth_provider = get_oauth_provider(provider)

    if error:
        logger.warning("sso_error", provider=provider, error=error)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_provider_error")

    if not code or not state:
        logger.warning("sso_error", provider=provider, error="sso_code_or_state_missing")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sso_code_or_state_missing",
        )

    try:
        verify_oauth_state(state, oauth_provider.name)
        request_redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
        redirect_uri = resolve_redirect_uri(oauth_provider, request_redirect_uri)
        provider_access_token = await exchange_code_for_access_token(oauth_provider, code, redirect_uri)
        identity = await fetch_user_identity(oauth_provider, provider_access_token)
        result = await db.execute(select(User).where(User.email == identity.email))
        user = result.scalar_one_or_none()
    except HTTPException as exc:
        logger.warning("sso_error", provider=provider, error=str(exc.detail))
        raise
    except Exception as exc:
        logger.exception("sso_error", provider=provider, error="sso_internal_error")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="sso_internal_error",
        ) from exc

    if user is None:
        onboarding_token = create_onboarding_session(identity)
        response = _build_onboarding_response(request, onboarding_token)
        logger.info("sso_onboarding", provider=oauth_provider.name, email=identity.email)
        return response

    user = await _sync_existing_sso_user(db, user, identity)
    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )

    response = _build_sso_response(request, token, user)
    logger.info("sso_success", provider=oauth_provider.name, user_id=str(user.id))
    return response


@router.post("/oauth/complete-registration", response_model=OAuthCompleteRegistrationResponse)
async def complete_oauth_registration(
    data: OAuthCompleteRegistrationRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OAuthCompleteRegistrationResponse:
    try:
        role = validate_oauth_role(data.role)
    except HTTPException as exc:
        if exc.status_code == status.HTTP_400_BAD_REQUEST:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role selected",
            ) from exc
        raise
    onboarding_token = request.cookies.get(settings.oauth_onboarding_cookie_name)
    logger.info(
        "sso_complete_registration_start",
        role=role,
        has_onboarding_cookie=bool(onboarding_token),
    )
    if not onboarding_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OAuth session missing",
        )

    try:
        identity = verify_onboarding_session(onboarding_token)
        logger.info(
            "sso_complete_registration_identity",
            email=identity.email,
            provider=identity.provider,
            role=role,
        )
        result = await db.execute(select(User).where(User.email == identity.email))
        user = result.scalar_one_or_none()

        if user is None:
            user_role = UserRole(role.upper())
            user = await _create_sso_user(db, identity, user_role)
        else:
            user = await _sync_existing_sso_user(db, user, identity)
    except HTTPException as exc:
        logger.warning(
            "sso_complete_registration_failed",
            role=role,
            provider=getattr(identity, "provider", None),
        )
        if exc.detail == "oauth_onboarding_invalid":
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session expired, please login again",
            ) from exc
        raise
    except Exception as exc:
        logger.exception("sso_complete_registration_failed", role=role)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="oauth_complete_registration_failed",
        ) from exc

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )

    response = JSONResponse(
        status_code=status.HTTP_200_OK,
        content=OAuthCompleteRegistrationResponse(
            access_token=token,
            user=UserOut.model_validate(user),
        ).model_dump(),
    )
    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    _clear_onboarding_cookie(response)
    logger.info(
        "sso_complete_registration",
        provider=identity.provider,
        user_id=str(user.id),
    )
    return response


@router.post("/register", response_model=TokenResponse)
@limiter.limit("10/minute")
async def register(
    data: RegisterRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    email = data.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()
    if existing_user is not None:
        logger.warning("register_failed", email=email, reason="email_in_use")
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Email already in use")

    role = UserRole(data.role)

    user = User(
        email=email,
        password_hash=pwd_context.hash(data.password),
        role=role,
        is_approved=role != UserRole.RECRUITER,
        full_name=data.full_name,
    )
    db.add(user)
    await db.flush()

    if user.role == UserRole.CANDIDATE:
        profile = CandidateProfile(
            user_id=user.id,
            city=None,
            phone=None,
            field_of_study=None,
            university=None,
            study_level=None,
        )
        db.add(profile)

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


@router.post("/login", response_model=TokenResponse)
@limiter.limit("5/minute")
async def login(
    data: LoginRequest,
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    email = data.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not pwd_context.verify(data.password, user.password_hash):
        logger.warning("login_failed", email=email)
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.role == UserRole.RECRUITER and not user.is_approved:
        logger.warning("login_failed", email=email, reason="recruiter_unapproved")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter account is pending admin approval",
        )

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )
    logger.info("login_success", user_id=str(user.id), role=user.role.value)
    return TokenResponse(token=token, user=UserOut.model_validate(user))


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
