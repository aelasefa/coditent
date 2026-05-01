import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
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
from app.schemas import LoginRequest, RegisterRequest, TokenResponse, UserMeOut, UserOut
from app.services.oauth_service import (
    build_frontend_dashboard_url,
    build_oauth_authorize_url,
    create_oauth_state,
    exchange_code_for_access_token,
    fetch_user_identity,
    get_oauth_provider,
    resolve_redirect_uri,
    verify_oauth_state,
)
from app.utils.jwt import create_access_token


router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
logger = get_logger("auth")


async def _find_or_create_sso_user(
    db: AsyncSession,
    *,
    email: str,
    full_name: str,
    oauth_provider: str,
    oauth_id: str,
    avatar_url: str | None,
) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is not None:
        needs_commit = False

        if not user.full_name.strip() and full_name:
            user.full_name = full_name
            needs_commit = True
        if oauth_provider and user.oauth_provider != oauth_provider:
            user.oauth_provider = oauth_provider
            needs_commit = True
        if oauth_id and user.oauth_id != oauth_id:
            user.oauth_id = oauth_id
            needs_commit = True
        if avatar_url and user.avatar_url != avatar_url:
            user.avatar_url = avatar_url
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

    user = User(
        email=email,
        password_hash=pwd_context.hash(secrets.token_urlsafe(32)),
        role=UserRole.CANDIDATE,
        full_name=full_name,
        oauth_provider=oauth_provider,
        oauth_id=oauth_id,
        avatar_url=avatar_url,
    )
    db.add(user)
    await db.flush()

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
) -> RedirectResponse:
    try:
        oauth_provider = get_oauth_provider(provider)
    except HTTPException as exc:
        return RedirectResponse(
            url=build_frontend_dashboard_url(),
            status_code=status.HTTP_302_FOUND,
        )

    if error:
        logger.warning("sso_error", provider=provider, error=error)
        return RedirectResponse(
            url=build_frontend_dashboard_url(),
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        logger.warning("sso_error", provider=provider, error="sso_code_or_state_missing")
        return RedirectResponse(
            url=build_frontend_dashboard_url(),
            status_code=status.HTTP_302_FOUND,
        )

    try:
        verify_oauth_state(state, oauth_provider.name)
        request_redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
        redirect_uri = resolve_redirect_uri(oauth_provider, request_redirect_uri)
        provider_access_token = await exchange_code_for_access_token(oauth_provider, code, redirect_uri)
        identity = await fetch_user_identity(oauth_provider, provider_access_token)
        user = await _find_or_create_sso_user(
            db,
            email=identity.email,
            full_name=identity.full_name,
            oauth_provider=identity.provider,
            oauth_id=identity.oauth_id,
            avatar_url=identity.avatar_url,
        )
    except HTTPException as exc:
        logger.warning("sso_error", provider=provider, error=str(exc.detail))
        return RedirectResponse(
            url=build_frontend_dashboard_url(),
            status_code=status.HTTP_302_FOUND,
        )
    except Exception:
        logger.error("sso_error", provider=provider, error="sso_internal_error")
        return RedirectResponse(
            url=build_frontend_dashboard_url(),
            status_code=status.HTTP_302_FOUND,
        )

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )

    response = RedirectResponse(url=build_frontend_dashboard_url(), status_code=status.HTTP_302_FOUND)
    response.set_cookie(
        key=settings.access_token_cookie_name,
        value=token,
        httponly=True,
        secure=settings.access_token_cookie_secure,
        samesite=settings.access_token_cookie_samesite,
        max_age=settings.access_token_expire_minutes * 60,
        path="/",
    )
    logger.info("sso_success", provider=oauth_provider.name, user_id=str(user.id))
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
