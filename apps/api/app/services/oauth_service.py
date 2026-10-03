from __future__ import annotations

import secrets
import hashlib
import json
import base64
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
oauth_attempt_expire_seconds = oauth_state_expire_minutes * 60

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
    issuer: str


@dataclass(frozen=True)
class OAuthIdentity:
    email: str
    full_name: str
    oauth_id: str
    avatar_url: str | None
    provider: str
    issuer: str = ""
    email_verified: bool = False


@dataclass(frozen=True)
class OAuthAttempt:
    state: str
    browser_id: str
    code_verifier: str
    nonce: str
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
            issuer="https://accounts.google.com",
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
            issuer="https://www.linkedin.com",
        )
    else:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sso_provider_not_supported")

    if not config.client_id or not config.client_secret:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="sso_not_configured")

    return config


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


def _browser_binding(browser_id: str) -> str:
    return hashlib.sha256(browser_id.encode("utf-8")).hexdigest()


def _oauth_state_key(state_id: str) -> str:
    return f"oauth:state:{hashlib.sha256(state_id.encode()).hexdigest()}"


def create_oauth_state(
    provider: str,
    popup_origin: str,
    attempt_id: str,
    *,
    browser_id: str | None = None,
    state_id: str | None = None,
) -> str:
    validated_origin = validate_popup_origin(popup_origin)
    if not attempt_id or len(attempt_id) > 120:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_attempt")
    state_payload = {
        "purpose": "oauth_state",
        "provider": provider,
        "csrf": secrets.token_urlsafe(24),
        "popup_origin": validated_origin,
        "attempt_id": attempt_id,
        "state_id": state_id or secrets.token_urlsafe(24),
        "browser": _browser_binding(browser_id) if browser_id else None,
        "exp": datetime.now(timezone.utc) + timedelta(minutes=oauth_state_expire_minutes),
    }
    return jwt.encode(state_payload, settings.secret_key, algorithm=settings.algorithm)


def _decode_oauth_state(state_token: str, provider: str) -> dict[str, Any]:
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
    payload["popup_origin"] = popup_origin
    payload["attempt_id"] = attempt_id
    return payload


def verify_oauth_state(state_token: str, provider: str) -> tuple[str, str]:
    """Verify the signed envelope (compatibility helper for error rendering/tests)."""
    payload = _decode_oauth_state(state_token, provider)
    return str(payload["popup_origin"]), str(payload["attempt_id"])


async def create_oauth_attempt(
    provider: str,
    popup_origin: str,
    attempt_id: str,
    browser_id: str | None,
) -> OAuthAttempt:
    resolved_browser_id = browser_id or secrets.token_urlsafe(32)
    state_id = secrets.token_urlsafe(32)
    code_verifier = secrets.token_urlsafe(64)
    nonce = secrets.token_urlsafe(32)
    state = create_oauth_state(
        provider,
        popup_origin,
        attempt_id,
        browser_id=resolved_browser_id,
        state_id=state_id,
    )
    payload = {
        "provider": provider,
        "browser": _browser_binding(resolved_browser_id),
        "code_verifier": code_verifier,
        "nonce": nonce,
        "popup_origin": validate_popup_origin(popup_origin),
        "attempt_id": attempt_id,
    }
    try:
        stored = await get_async_redis().set(
            _oauth_state_key(state_id),
            json.dumps(payload),
            ex=oauth_attempt_expire_seconds,
            nx=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sso_state_store_unavailable",
        ) from exc
    if not stored:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sso_state_store_unavailable",
        )
    return OAuthAttempt(
        state=state,
        browser_id=resolved_browser_id,
        code_verifier=code_verifier,
        nonce=nonce,
        popup_origin=str(payload["popup_origin"]),
        attempt_id=attempt_id,
    )


async def consume_oauth_attempt(
    state_token: str,
    provider: str,
    browser_id: str | None,
) -> OAuthAttempt:
    payload = _decode_oauth_state(state_token, provider)
    state_id = str(payload.get("state_id") or "")
    browser_binding = str(payload.get("browser") or "")
    if (
        not state_id
        or not browser_id
        or not browser_binding
        or not secrets.compare_digest(browser_binding, _browser_binding(browser_id))
    ):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    try:
        encoded = await get_async_redis().getdel(_oauth_state_key(state_id))
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="sso_state_store_unavailable",
        ) from exc
    if not encoded:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    try:
        stored = json.loads(encoded)
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state") from exc
    expected = {
        "provider": provider,
        "browser": browser_binding,
        "popup_origin": payload["popup_origin"],
        "attempt_id": payload["attempt_id"],
    }
    if any(stored.get(key) != value for key, value in expected.items()):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    verifier = str(stored.get("code_verifier") or "")
    nonce = str(stored.get("nonce") or "")
    if len(verifier) < 43 or not nonce:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sso_state")
    return OAuthAttempt(
        state=state_token,
        browser_id=browser_id,
        code_verifier=verifier,
        nonce=nonce,
        popup_origin=str(payload["popup_origin"]),
        attempt_id=str(payload["attempt_id"]),
    )


def _handoff_key(code: str) -> str:
    digest = hashlib.sha256(code.encode()).hexdigest()
    return f"oauth:handoff:{digest}"


async def create_oauth_handoff(
    token: str,
    user_id: str,
    is_new_registration: bool,
    *,
    requires_2fa: bool = False,
) -> str:
    code = secrets.token_urlsafe(32)
    payload = json.dumps(
        {
            "token": token,
            "user_id": user_id,
            "is_new_registration": is_new_registration,
            "requires_2fa": requires_2fa,
        }
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
    if not isinstance(data.get("requires_2fa", False), bool):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_sso_handoff")
    return data


def build_oauth_authorize_url(
    provider: OAuthProvider,
    redirect_uri: str,
    state_token: str,
    *,
    code_verifier: str | None = None,
    nonce: str | None = None,
) -> str:
    query_params: dict[str, str] = {
        "client_id": provider.client_id or "",
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(provider.scopes),
        "state": state_token,
    }

    if code_verifier:
        digest = hashlib.sha256(code_verifier.encode("ascii")).digest()
        query_params["code_challenge"] = base64.urlsafe_b64encode(digest).decode("ascii").rstrip("=")
        query_params["code_challenge_method"] = "S256"
    if nonce:
        query_params["nonce"] = nonce

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
    *,
    code_verifier: str,
) -> str:
    payload = {
        "grant_type": "authorization_code",
        "code": code,
        "client_id": provider.client_id,
        "client_secret": provider.client_secret,
        "redirect_uri": redirect_uri,
        "code_verifier": code_verifier,
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


def _parse_identity_payload(provider: OAuthProvider, payload: dict[str, Any]) -> OAuthIdentity:
    email = str(payload.get("email") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_email_missing")
    verified_value = payload.get("email_verified")
    email_verified = verified_value is True or str(verified_value).lower() in {"1", "true"}
    if not email_verified:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_email_unverified")

    issuer = str(payload.get("iss") or provider.issuer).strip().rstrip("/")
    if issuer != provider.issuer.rstrip("/"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_issuer_invalid")

    full_name = str(payload.get("name") or "").strip()
    if not full_name and provider.name == "linkedin":
        given_name = str(payload.get("given_name") or "").strip()
        family_name = str(payload.get("family_name") or "").strip()
        full_name = " ".join([value for value in [given_name, family_name] if value]).strip()

    if not full_name:
        full_name = _name_from_email(email)

    oauth_id = str(payload.get("sub") or "").strip()
    if not oauth_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="sso_subject_missing")

    avatar_url = payload.get("picture") or payload.get("picture_url") or None
    if avatar_url is not None:
        avatar_url = str(avatar_url).strip() or None

    return OAuthIdentity(
        email=email,
        full_name=full_name,
        oauth_id=oauth_id,
        avatar_url=avatar_url,
        provider=provider.name,
        issuer=provider.issuer,
        email_verified=True,
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

    return _parse_identity_payload(provider, profile_payload)
