import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Annotated
from urllib.parse import urlencode

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import RedirectResponse
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.config import settings
from app.database import get_db
from app.dependencies import get_current_user, require_admin
from app.models import CandidateProfile, User, UserRole
from app.services.admin_seed import seed_admin_user
from app.schemas import (
    LoginRequest,
    RecruiterApprovalOut,
    RegisterRequest,
    TokenResponse,
    UserMeOut,
    UserOut,
)
from app.utils.jwt import create_access_token


router = APIRouter()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth_state_expire_minutes = 10
frontend_sso_callback_path = "/auth/sso/callback"


@dataclass(frozen=True)
class OAuthProvider:
    name: str
    client_id: str | None
    client_secret: str | None
    authorization_url: str
    token_url: str
    userinfo_url: str
    scopes: tuple[str, ...]


def _get_oauth_provider(provider: str) -> OAuthProvider:
    normalized_provider = provider.strip().lower()

    if normalized_provider == "google":
        config = OAuthProvider(
            name="google",
            client_id=settings.google_client_id,
            client_secret=settings.google_client_secret,
            authorization_url="https://accounts.google.com/o/oauth2/v2/auth",
            token_url="https://oauth2.googleapis.com/token",
            userinfo_url="https://www.googleapis.com/oauth2/v3/userinfo",
            scopes=("openid", "email", "profile"),
        )
    elif normalized_provider == "linkedin":
        config = OAuthProvider(
            name="linkedin",
            client_id=settings.linkedin_client_id,
            client_secret=settings.linkedin_client_secret,
            authorization_url="https://www.linkedin.com/oauth/v2/authorization",
            token_url="https://www.linkedin.com/oauth/v2/accessToken",
            userinfo_url="https://api.linkedin.com/v2/userinfo",
            scopes=("openid", "profile", "email"),
        )
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sso_provider_not_supported")

    if not config.client_id or not config.client_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="sso_not_configured")

    return config


def _create_oauth_state(provider: str) -> str:
    state_payload = {
        "purpose": "oauth_state",
        "provider": provider,
        "nonce": secrets.token_urlsafe(24),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=oauth_state_expire_minutes),
    }
    return jwt.encode(state_payload, settings.secret_key, algorithm=settings.algorithm)


def _verify_oauth_state(state_token: str, provider: str) -> None:
    try:
        payload = jwt.decode(state_token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state") from exc

    if payload.get("purpose") != "oauth_state" or payload.get("provider") != provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")


def _name_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0]
    words = [piece.capitalize() for piece in local_part.replace(".", " ").replace("_", " ").split()]
    return " ".join(words) or email


def _build_frontend_sso_callback_url(params: dict[str, str]) -> str:
    callback_base = f"{settings.frontend_url.rstrip('/')}{frontend_sso_callback_path}"
    return f"{callback_base}?{urlencode(params)}"


async def _exchange_code_for_access_token(
    provider: OAuthProvider,
    code: str,
    redirect_uri: str,
) -> str:
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": provider.client_id,
        "client_secret": provider.client_secret,
        "redirect_uri": redirect_uri,
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(provider.token_url, data=payload, headers={"Accept": "application/json"})

    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_token_exchange_failed")

    try:
        token_payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_token_parse_failed") from exc

    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_token_missing")

    return access_token


async def _fetch_user_identity(provider: OAuthProvider, access_token: str) -> tuple[str, str]:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            provider.userinfo_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )

    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_profile_fetch_failed")

    try:
        profile_payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_profile_parse_failed") from exc

    email = str(profile_payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="sso_email_missing",
        )

    full_name = str(profile_payload.get("name") or "").strip()
    if not full_name and provider.name == "linkedin":
        given_name = str(profile_payload.get("given_name") or "").strip()
        family_name = str(profile_payload.get("family_name") or "").strip()
        full_name = " ".join([value for value in [given_name, family_name] if value]).strip()

    if not full_name:
        full_name = _name_from_email(email)

    return email, full_name


async def _find_or_create_sso_user(
    db: AsyncSession,
    email: str,
    full_name: str,
) -> User:
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is not None:
        needs_commit = False

        if not user.full_name.strip() and full_name:
            user.full_name = full_name
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


async def ensure_default_admin_account(db: AsyncSession) -> None:
    admin_email = (settings.admin_email or "").strip().lower()
    admin_password = settings.admin_password or ""

    if not admin_email or not admin_password:
        return

    await seed_admin_user(
        db,
        email=admin_email,
        password=admin_password,
        full_name=settings.admin_full_name,
    )


@router.get("/sso/providers")
async def sso_providers() -> dict[str, bool]:
    return {
        "google": bool(settings.google_client_id and settings.google_client_secret),
        "linkedin": bool(settings.linkedin_client_id and settings.linkedin_client_secret),
    }


@router.get("/sso/{provider}/start")
async def sso_start(provider: str, request: Request) -> RedirectResponse:
    oauth_provider = _get_oauth_provider(provider)
    redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
    state_token = _create_oauth_state(oauth_provider.name)

    query_params: dict[str, str] = {
        "client_id": oauth_provider.client_id or "",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(oauth_provider.scopes),
        "state": state_token,
    }

    if oauth_provider.name == "google":
        query_params["prompt"] = "select_account"

    authorization_url = f"{oauth_provider.authorization_url}?{urlencode(query_params)}"
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
        oauth_provider = _get_oauth_provider(provider)
    except HTTPException as exc:
        return RedirectResponse(
            url=_build_frontend_sso_callback_url({"error": str(exc.detail)}),
            status_code=status.HTTP_302_FOUND,
        )

    if error:
        return RedirectResponse(
            url=_build_frontend_sso_callback_url({"error": "sso_access_denied"}),
            status_code=status.HTTP_302_FOUND,
        )

    if not code or not state:
        return RedirectResponse(
            url=_build_frontend_sso_callback_url({"error": "sso_code_or_state_missing"}),
            status_code=status.HTTP_302_FOUND,
        )

    try:
        _verify_oauth_state(state, oauth_provider.name)
        redirect_uri = str(request.url_for("sso_callback", provider=oauth_provider.name))
        provider_access_token = await _exchange_code_for_access_token(oauth_provider, code, redirect_uri)
        email, full_name = await _fetch_user_identity(oauth_provider, provider_access_token)
        user = await _find_or_create_sso_user(db, email=email, full_name=full_name)
    except HTTPException as exc:
        return RedirectResponse(
            url=_build_frontend_sso_callback_url({"error": str(exc.detail)}),
            status_code=status.HTTP_302_FOUND,
        )
    except Exception:
        return RedirectResponse(
            url=_build_frontend_sso_callback_url({"error": "sso_internal_error"}),
            status_code=status.HTTP_302_FOUND,
        )

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )

    return RedirectResponse(
        url=_build_frontend_sso_callback_url({"token": token, "role": user.role.value}),
        status_code=status.HTTP_302_FOUND,
    )


@router.post("/register", response_model=TokenResponse)
async def register(
    data: RegisterRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    email = data.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    existing_user = result.scalar_one_or_none()
    if existing_user is not None:
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

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
        }
    )
    return TokenResponse(token=token, user=UserOut.model_validate(user))


@router.post("/login", response_model=TokenResponse)
async def login(
    data: LoginRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    email = data.email.strip().lower()

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if user is None or not pwd_context.verify(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    if user.role == UserRole.RECRUITER and not user.is_approved:
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


@router.get("/admin/recruiters/pending", response_model=dict[str, list[RecruiterApprovalOut]])
async def list_pending_recruiters(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[RecruiterApprovalOut]]:
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.RECRUITER, User.is_approved.is_(False))
        .order_by(User.created_at.asc())
    )
    recruiters = result.scalars().all()
    return {"recruiters": [RecruiterApprovalOut.model_validate(recruiter) for recruiter in recruiters]}


@router.patch("/admin/recruiters/{recruiter_id}/approve", response_model=RecruiterApprovalOut)
async def approve_recruiter(
    recruiter_id: uuid.UUID,
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruiterApprovalOut:
    result = await db.execute(select(User).where(User.id == recruiter_id))
    recruiter = result.scalar_one_or_none()

    if recruiter is None or recruiter.role != UserRole.RECRUITER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recruiter not found")

    if recruiter.is_approved:
        return RecruiterApprovalOut.model_validate(recruiter)

    recruiter.is_approved = True
    await db.commit()
    await db.refresh(recruiter)
    return RecruiterApprovalOut.model_validate(recruiter)
