from __future__ import annotations

import secrets
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from urllib.parse import urlencode

import httpx
from fastapi import HTTPException, status
from jose import JWTError, jwt

from app.config import settings


oauth_state_expire_minutes = 10


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


def create_oauth_state(provider: str) -> str:
    state_payload = {
        "purpose": "oauth_state",
        "provider": provider,
        "nonce": secrets.token_urlsafe(24),
        "exp": datetime.now(timezone.utc) + timedelta(minutes=oauth_state_expire_minutes),
    }
    return jwt.encode(state_payload, settings.secret_key, algorithm=settings.algorithm)


def verify_oauth_state(state_token: str, provider: str) -> None:
    try:
        payload = jwt.decode(state_token, settings.secret_key, algorithms=[settings.algorithm])
    except JWTError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state") from exc

    if payload.get("purpose") != "oauth_state" or payload.get("provider") != provider:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")


def build_frontend_dashboard_url() -> str:
    return f"{settings.frontend_url.rstrip('/')}/dashboard"


def build_oauth_authorize_url(provider: OAuthProvider, redirect_uri: str, state_token: str) -> str:
    query_params: dict[str, str] = {
        "client_id": provider.client_id or "",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider.scopes),
        "state": state_token,
    }

    if provider.name == "google":
        query_params["prompt"] = "select_account"

    return f"{provider.authorization_url}?{urlencode(query_params)}"


def resolve_redirect_uri(provider: OAuthProvider, request_redirect_uri: str) -> str:
    if provider.name == "google":
        return settings.google_redirect_uri
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

    if response.is_error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_profile_fetch_failed")

    try:
        profile_payload = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="sso_profile_parse_failed") from exc

    return _parse_identity_payload(provider.name, profile_payload)
