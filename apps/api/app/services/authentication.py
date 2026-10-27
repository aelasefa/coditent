from __future__ import annotations

import hashlib
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.exceptions import RedisError
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_async_redis
from app.models import RevokedSession, RevokedTrustedDevice, User
from app.utils.jwt import (
    create_access_token,
    create_mfa_token,
    verify_mfa_token,
    verify_trusted_device_token,
)


MFA_CHALLENGE_TTL_SECONDS = 5 * 60


class AuthenticationRejected(ValueError):
    pass


def ensure_login_account_type(user: User, account_type: str | None) -> None:
    if account_type is None:
        return  # Shared login API compatibility, including OAuth/admin flows.
    role = user.role.value
    if account_type == "candidate" and role == "CANDIDATE":
        return
    if account_type == "recruiter" and role in {"RECRUITER", "COMPANY_USER"}:
        return
    # Do not disclose an account's role through the public login endpoint.
    # A wrong portal/tab must be indistinguishable from invalid credentials.
    raise AuthenticationRejected("Invalid credentials")


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


async def _durable_session_revoked(session_id: UUID) -> bool:
    from sqlalchemy import select
    from sqlalchemy.exc import SQLAlchemyError

    from app.database import AsyncSessionLocal

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        async with AsyncSessionLocal() as db:
            durable = await db.scalar(
                select(RevokedSession.session_id).where(
                    RevokedSession.session_id == session_id,
                    RevokedSession.expires_at > now,
                )
            )
    except SQLAlchemyError as exc:
        raise AuthenticationStoreUnavailable("Session validation unavailable") from exc
    return durable is not None


async def _durable_trusted_device_revoked(token_id: UUID) -> bool:
    from sqlalchemy import select
    from sqlalchemy.exc import SQLAlchemyError

    from app.database import AsyncSessionLocal

    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        async with AsyncSessionLocal() as db:
            durable = await db.scalar(
                select(RevokedTrustedDevice.token_id).where(
                    RevokedTrustedDevice.token_id == token_id,
                    RevokedTrustedDevice.expires_at > now,
                )
            )
    except SQLAlchemyError as exc:
        raise AuthenticationStoreUnavailable(
            "Trusted-device validation unavailable"
        ) from exc
    return durable is not None


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
    except RedisError:
        revoked = None
    if revoked is not None:
        return False

    return not await _durable_trusted_device_revoked(UUID(str(payload["jti"])))


async def _issue_mfa_challenge(user: User, account_type: str | None = None) -> str:
    token = create_mfa_token(str(user.id), auth_version=account_auth_version(user), account_type=account_type)
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
    account_type: str | None = None,
) -> AuthenticationCompletion:
    """Finish primary authentication without allowing OAuth to bypass local MFA."""
    ensure_account_can_authenticate(user)
    ensure_login_account_type(user, account_type)
    if user.is_2fa_enabled and not await trusted_device_is_valid(user, trusted_device_token):
        return AuthenticationCompletion(
            token=await _issue_mfa_challenge(user, account_type),
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
    """Reject a revoked session using Redis as a cache and PostgreSQL as truth."""
    session_id = str(payload.get("sid") or "")
    try:
        normalized_session_id = UUID(session_id)
    except (TypeError, ValueError, AttributeError) as exc:
        raise AuthenticationRejected("Invalid access session") from exc

    # Redis gives a fast rejection while it is available. A missing key is not
    # authoritative because Redis may have restarted since logout.
    try:
        revoked = await get_async_redis().get(_revoked_session_key(session_id))
    except RedisError as exc:
        revoked = None
    if revoked is not None:
        raise AuthenticationRejected("Access session revoked")

    if await _durable_session_revoked(normalized_session_id):
        raise AuthenticationRejected("Access session revoked")


async def revoke_access_session(payload: dict, db: AsyncSession) -> None:
    """Persist logout before best-effort Redis cache publication."""
    from sqlalchemy import delete
    from sqlalchemy.dialects.postgresql import insert
    from sqlalchemy.exc import SQLAlchemyError

    try:
        session_id = UUID(str(payload.get("sid") or ""))
        user_id = UUID(str(payload.get("sub") or ""))
        expires_epoch = int(payload.get("exp") or 0)
        expires_at = datetime.fromtimestamp(expires_epoch, tz=timezone.utc).replace(
            tzinfo=None
        )
    except (TypeError, ValueError, OverflowError, AttributeError) as exc:
        raise AuthenticationRejected("Invalid access session") from exc
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    if expires_at <= now:
        raise AuthenticationRejected("Access session expired")
    try:
        await db.execute(
            delete(RevokedSession).where(RevokedSession.expires_at <= now)
        )
        await db.execute(
            insert(RevokedSession)
            .values(
                session_id=session_id,
                user_id=user_id,
                expires_at=expires_at,
                revoked_at=now,
            )
            .on_conflict_do_nothing(index_elements=[RevokedSession.session_id])
        )
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        raise AuthenticationStoreUnavailable("Session revocation unavailable") from exc

    from time import time

    ttl = max(1, expires_epoch - int(time()))
    try:
        await get_async_redis().set(
            _revoked_session_key(str(session_id)), "1", ex=ttl
        )
    except RedisError:
        # PostgreSQL is authoritative; logout remains complete even if the
        # cache is restarting.
        return


async def revoke_trusted_device(token: str | None, db: AsyncSession) -> None:
    if not token:
        return
    try:
        payload = verify_trusted_device_token(token)
    except ValueError:
        return
    from sqlalchemy import delete
    from sqlalchemy.dialects.postgresql import insert
    from sqlalchemy.exc import SQLAlchemyError

    token_id = UUID(str(payload["jti"]))
    user_id = UUID(str(payload["sub"]))
    expires_epoch = int(payload.get("exp") or 0)
    expires_at = datetime.fromtimestamp(expires_epoch, tz=timezone.utc).replace(
        tzinfo=None
    )
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    try:
        await db.execute(
            delete(RevokedTrustedDevice).where(
                RevokedTrustedDevice.expires_at <= now
            )
        )
        await db.execute(
            insert(RevokedTrustedDevice)
            .values(
                token_id=token_id,
                user_id=user_id,
                expires_at=expires_at,
                revoked_at=now,
            )
            .on_conflict_do_nothing(
                index_elements=[RevokedTrustedDevice.token_id]
            )
        )
        await db.commit()
    except SQLAlchemyError as exc:
        await db.rollback()
        raise AuthenticationStoreUnavailable(
            "Trusted-device revocation unavailable"
        ) from exc

    from time import time

    ttl = max(1, expires_epoch - int(time()))
    try:
        await get_async_redis().set(
            _revoked_trusted_device_key(str(token_id)), "1", ex=ttl
        )
    except RedisError:
        return
