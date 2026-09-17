from __future__ import annotations

import secrets
import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode, urlparse

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings
from app.cache import get_async_redis
from app.observability import get_logger


oauth_state_expire_minutes = 10
oauth_handoff_expire_seconds = 90
allowed_oauth_roles = {"candidate", "recruiter"}

logger = get_logger("oauth")


@dataclass(frozen=True)
class OAuthProvider:
    name: str
    client_id: str | None
    client_secret: str | None
    authorization_url: str
    token_url: str
    userinfo_url: str
    scopes: tuple[str, ...]


@dataclass(frozen=True)
class OAuthIdentity:
    email: str
    full_name: str
    oauth_id: str
    avatar_url: str | None
    provider: str


@dataclass(frozen=True)
class OAuthOnboardingContext:
    identity: OAuthIdentity
    popup_origin: str
    attempt_id: str


def get_oauth_provider(provider: str) -> OAuthProvider:
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


def validate_oauth_role(role: str | None) -> str:
    if not role:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role is required",
        )
    normalized_role = role.strip().lower()
    if normalized_role not in allowed_oauth_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Role must be candidate or recruiter",
        )
    return normalized_role


def validate_popup_origin(origin: str | None) -> str:
    configured = urlparse(settings.frontend_url.rstrip("/"))
    candidate = urlparse((origin or settings.frontend_url).rstrip("/"))
    if candidate.scheme not in {"http", "https"} or not candidate.hostname or candidate.path not in {"", "/"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_origin")

    configured_origin = f"{configured.scheme}://{configured.netloc}"
    candidate_origin = f"{candidate.scheme}://{candidate.netloc}"
    if candidate_origin == configured_origin:
        return candidate_origin

    local_hosts = {"localhost", "127.0.0.1"}
    if (
        configured.hostname in local_hosts
        and candidate.hostname in local_hosts
        and configured.scheme == candidate.scheme == "http"
        and configured.port == candidate.port
    ):
        return candidate_origin
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_origin")


def create_oauth_state(provider: str, popup_origin: str, attempt_id: str) -> str:
    validated_origin = validate_popup_origin(popup_origin)
    if not attempt_id or len(attempt_id) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_attempt")
    state_payload = {
        "purpose": "oauth_state",
        "provider": provider,
        "csrf": secrets.token_urlsafe(24),
        "popup_origin": validated_origin,
        "attempt_id": attempt_id,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=oauth_state_expire_minutes),
    }
    return jwt.encode(state_payload, settings.secret_key, algorithm=settings.algorithm)


def verify_oauth_state(state_token: str, provider: str) -> tuple[str, str]:
    try:
        payload = jwt.decode(state_token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state") from exc

    if payload.get("purpose") != "oauth_state" or payload.get("provider") != provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    if not payload.get("csrf"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    popup_origin = validate_popup_origin(str(payload.get("popup_origin") or ""))
    attempt_id = str(payload.get("attempt_id") or "")
    if not attempt_id or len(attempt_id) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    return popup_origin, attempt_id


def create_onboarding_session(identity: OAuthIdentity, popup_origin: str, attempt_id: str) -> str:
    payload = {
        "purpose": "oauth_onboarding",
        "provider": identity.provider,
        "email": identity.email,
        "full_name": identity.full_name,
        "oauth_id": identity.oauth_id,
        "avatar_url": identity.avatar_url,
        "popup_origin": validate_popup_origin(popup_origin),
        "attempt_id": attempt_id,
        "exp": datetime.now(timezone.utc)
        + timedelta(minutes=settings.oauth_onboarding_expire_minutes),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def verify_onboarding_session(token: str) -> OAuthOnboardingContext:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="oauth_onboarding_invalid") from exc

    if payload.get("purpose") != "oauth_onboarding":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="oauth_onboarding_invalid")

    email = str(payload.get("email") or "").strip().lower()
    provider = str(payload.get("provider") or "").strip().lower()
    full_name = str(payload.get("full_name") or "").strip()
    oauth_id = str(payload.get("oauth_id") or "").strip()
    avatar_url = payload.get("avatar_url")
    if not email or not provider:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="oauth_onboarding_invalid")

    popup_origin = validate_popup_origin(str(payload.get("popup_origin") or ""))
    attempt_id = str(payload.get("attempt_id") or "")
    if not attempt_id or len(attempt_id) > 120:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="oauth_onboarding_invalid")

    return OAuthOnboardingContext(
        identity=OAuthIdentity(
            email=email,
            full_name=full_name or _name_from_email(email),
            oauth_id=oauth_id or email,
            avatar_url=str(avatar_url).strip() if avatar_url else None,
            provider=provider,
        ),
        popup_origin=popup_origin,
        attempt_id=attempt_id,
    )


def _handoff_key(code: str) -> str:
    digest = hashlib.sha256(code.encode()).hexdigest()
    return f"oauth:handoff:{digest}"


async def create_oauth_handoff(token: str, user_id: str, is_new_registration: bool) -> str:
    code = secrets.token_urlsafe(32)
    payload = json.dumps(
        {"token": token, "user_id": user_id, "is_new_registration": is_new_registration}
    )
    stored = await get_async_redis().set(
        _handoff_key(code), payload, ex=oauth_handoff_expire_seconds, nx=True
    )
    if not stored:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="sso_handoff_unavailable")
    return code


async def consume_oauth_handoff(code: str) -> dict[str, str | bool]:
    if not code or len(code) > 200:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_handoff")
    payload = await get_async_redis().getdel(_handoff_key(code))
    if not payload:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="sso_handoff_expired")
    try:
        data = json.loads(payload)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_sso_handoff") from exc
    if not isinstance(data.get("token"), str) or not isinstance(data.get("user_id"), str):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_sso_handoff")
    return data


def build_oauth_authorize_url(provider: OAuthProvider, redirect_uri: str, state_token: str) -> str:
    query_params: dict[str, str] = {
        "client_id": provider.client_id or "",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider.scopes),
        "state": state_token,
    }

    if provider.name == "google":
        logger.info("google_oauth_authorize", redirect_uri=redirect_uri)
        query_params["prompt"] = "select_account"

    return f"{provider.authorization_url}?{urlencode(query_params)}"


def resolve_redirect_uri(provider: OAuthProvider, request_redirect_uri: str) -> str:
    if provider.name == "google":
        return settings.google_redirect_uri
    if provider.name == "linkedin":
        return settings.linkedin_redirect_uri
    return request_redirect_uri


async def exchange_code_for_access_token(
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
        if provider.name == "google":
            logger.info(
                "google_oauth_token_exchange",
                redirect_uri=redirect_uri,
            )
        response = await client.post(
            provider.token_url,
            data=payload,
            headers={"Accept": "application/json"},
        )

    response_payload: dict[str, Any] | None = None
    if provider.name == "google":
        try:
            response_payload = response.json()
        except ValueError:
            response_payload = None

        if response.is_error:
            logger.warning(
                "google_oauth_token_error",
                status_code=response.status_code,
                error=(response_payload or {}).get("error"),
            )
            if isinstance(response_payload, dict) and response_payload.get("error") in {
                "invalid_client",
                "invalid_grant",
                "invalid_request",
                "unauthorized_client",
            }:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="google_token_exchange_failed",
                )
        else:
            logger.info("google_oauth_token_response", status_code=response.status_code)

    if response.status_code in {400, 401}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_invalid_code")
    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_token_exchange_failed")

    try:
        token_payload = response_payload if isinstance(response_payload, dict) else response.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_token_parse_failed") from exc

    access_token = token_payload.get("access_token")
    if not access_token:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_token_missing")

    return access_token


def _name_from_email(email: str) -> str:
    local_part = email.split("@", 1)[0]
    words = [piece.capitalize() for piece in local_part.replace(".", " ").replace("_", " ").split()]
    return " ".join(words) or email


def _parse_identity_payload(provider: str, payload: dict[str, Any]) -> OAuthIdentity:
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_email_missing")

    full_name = str(payload.get("name") or "").strip()
    if not full_name and provider == "linkedin":
        given_name = str(payload.get("given_name") or "").strip()
        family_name = str(payload.get("family_name") or "").strip()
        full_name = " ".join([value for value in [given_name, family_name] if value]).strip()

    if not full_name:
        full_name = _name_from_email(email)

    oauth_id = str(payload.get("sub") or payload.get("id") or "").strip()
    if not oauth_id:
        oauth_id = email

    avatar_url = payload.get("picture") or payload.get("picture_url") or None
    if avatar_url is not None:
        avatar_url = str(avatar_url).strip() or None

    return OAuthIdentity(
        email=email,
        full_name=full_name,
        oauth_id=oauth_id,
        avatar_url=avatar_url,
        provider=provider,
    )


async def fetch_user_identity(provider: OAuthProvider, access_token: str) -> OAuthIdentity:
    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.get(
            provider.userinfo_url,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/json",
            },
        )

    if response.status_code == 401:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="sso_access_token_expired")
    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_profile_fetch_failed")

    try:
        profile_payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_profile_parse_failed") from exc

    return _parse_identity_payload(provider.name, profile_payload)
