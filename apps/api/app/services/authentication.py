from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import timedelta
from uuid import UUID

from redis.exceptions import RedisError

from app.cache import get_async_redis
from app.models import User
from app.utils.jwt import (
    create_access_token,
    create_mfa_token,
    verify_mfa_token,
    verify_trusted_device_token,
)


MFA_CHALLENGE_TTL_SECONDS = 5 * 60


class AuthenticationRejected(ValueError):
    pass


class AuthenticationStoreUnavailable(RuntimeError):
    pass


@dataclass(frozen=True)
class AuthenticationCompletion:
    token: str
    requires_2fa: bool


def _mfa_challenge_key(challenge_id: str) -> str:
    return f"auth:mfa-challenge:{challenge_id}"


def _revoked_session_key(session_id: str) -> str:
    return f"auth:revoked-session:{session_id}"


def _revoked_trusted_device_key(token_id: str) -> str:
    return f"auth:revoked-trusted-device:{token_id}"


def factor_fingerprint(user: User) -> str:
    return hashlib.sha256((user.totp_secret_encrypted or "").encode()).hexdigest()


def account_auth_version(user: User) -> int:
    return int(user.auth_version or 0)


def ensure_credential_matches_account(payload: dict, user: User) -> None:
    if payload.get("sub") != str(user.id):
        raise AuthenticationRejected("Credential subject mismatch")
    if payload.get("auth_version") != account_auth_version(user):
        raise AuthenticationRejected("Credential was invalidated")


def ensure_account_can_authenticate(user: User) -> None:
    """Apply one account-status decision to password, OAuth, HTTP, and sockets."""
    if user.is_active is False:
        raise AuthenticationRejected("Account is deactivated")
    if not user.is_approved:
        raise AuthenticationRejected("Account is not active")
    if user.role.value == "CANDIDATE" and user.company_id is not None:
        raise AuthenticationRejected("Invalid candidate account")
    if user.role.value == "COMPANY_USER" and (
        user.company_id is None or not user.company_role
    ):
        raise AuthenticationRejected("Invalid company membership")


def issue_access_token(user: User, *, extra_claims: dict | None = None) -> str:
    ensure_account_can_authenticate(user)
    return create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "auth_version": account_auth_version(user),
            **(extra_claims or {}),
        }
    )


async def trusted_device_is_valid(user: User, token: str | None) -> bool:
    if not token or not user.is_2fa_enabled:
        return False
    try:
        payload = verify_trusted_device_token(token)
    except ValueError:
        return False
    valid = (
        payload.get("sub") == str(user.id)
        and payload.get("factor") == factor_fingerprint(user)
        and payload.get("auth_version") == account_auth_version(user)
    )
    if not valid:
        return False
    try:
        revoked = await get_async_redis().get(
            _revoked_trusted_device_key(str(payload["jti"]))
        )
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("Trusted-device validation unavailable") from exc
    return revoked is None


async def _issue_mfa_challenge(user: User) -> str:
    token = create_mfa_token(str(user.id), auth_version=account_auth_version(user))
    payload = verify_mfa_token(token)
    try:
        stored = await get_async_redis().set(
            _mfa_challenge_key(str(payload["jti"])),
            str(user.id),
            ex=MFA_CHALLENGE_TTL_SECONDS,
            nx=True,
        )
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("MFA challenge store unavailable") from exc
    if not stored:
        raise AuthenticationStoreUnavailable("MFA challenge store unavailable")
    return token


async def complete_authentication(
    user: User,
    *,
    trusted_device_token: str | None = None,
) -> AuthenticationCompletion:
    """Finish primary authentication without allowing OAuth to bypass local MFA."""
    ensure_account_can_authenticate(user)
    if user.is_2fa_enabled and not await trusted_device_is_valid(user, trusted_device_token):
        return AuthenticationCompletion(
            token=await _issue_mfa_challenge(user),
            requires_2fa=True,
        )
    return AuthenticationCompletion(token=issue_access_token(user), requires_2fa=False)


async def ensure_mfa_challenge_active(payload: dict) -> None:
    challenge_id = str(payload.get("jti") or "")
    subject = str(payload.get("sub") or "")
    try:
        stored_subject = await get_async_redis().get(_mfa_challenge_key(challenge_id))
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("MFA challenge store unavailable") from exc
    if stored_subject != subject:
        raise AuthenticationRejected("MFA challenge is no longer active")


async def consume_mfa_challenge(payload: dict) -> None:
    """Atomically consume a successfully verified challenge to stop token replay."""
    challenge_id = str(payload.get("jti") or "")
    subject = str(payload.get("sub") or "")
    try:
        stored_subject = await get_async_redis().getdel(_mfa_challenge_key(challenge_id))
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("MFA challenge store unavailable") from exc
    if stored_subject != subject:
        raise AuthenticationRejected("MFA challenge is no longer active")


async def ensure_access_session_active(payload: dict) -> None:
    """Reject a structurally valid access credential when its session was revoked."""
    session_id = str(payload.get("sid") or "")
    try:
        UUID(session_id)
        revoked = await get_async_redis().get(_revoked_session_key(session_id))
    except (TypeError, ValueError, AttributeError) as exc:
        raise AuthenticationRejected("Invalid access session") from exc
    except RedisError as exc:
        # Authentication must fail closed when revocation state is unavailable.
        raise AuthenticationStoreUnavailable("Session validation unavailable") from exc
    if revoked is not None:
        raise AuthenticationRejected("Access session revoked")


async def revoke_access_session(payload: dict) -> None:
    session_id = str(payload.get("sid") or "")
    expires_at = int(payload.get("exp") or 0)
    from time import time

    ttl = max(1, expires_at - int(time()))
    try:
        await get_async_redis().set(_revoked_session_key(session_id), "1", ex=ttl)
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("Session validation unavailable") from exc


async def revoke_trusted_device(token: str | None) -> None:
    if not token:
        return
    try:
        payload = verify_trusted_device_token(token)
    except ValueError:
        return
    expires_at = int(payload.get("exp") or 0)
    from time import time

    ttl = max(1, expires_at - int(time()))
    try:
        await get_async_redis().set(
            _revoked_trusted_device_key(str(payload["jti"])), "1", ex=ttl
        )
    except RedisError as exc:
        raise AuthenticationStoreUnavailable("Trusted-device validation unavailable") from exc
