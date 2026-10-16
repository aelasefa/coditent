"""Durable logout revocation proofs against PostgreSQL."""

from __future__ import annotations

import os
import uuid
from datetime import timedelta

import pytest
import pytest_asyncio
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

import app.database as database
import app.services.authentication as authentication
from app.models import RevokedSession, RevokedTrustedDevice, User, UserRole
from app.services.authentication import AuthenticationRejected
from app.utils.jwt import create_trusted_device_token, verify_access_token


class _Redis:
    def __init__(self, *, unavailable: bool = False) -> None:
        self.values: dict[str, str] = {}
        self.unavailable = unavailable

    async def get(self, key: str) -> str | None:
        if self.unavailable:
            raise RedisError("restart")
        return self.values.get(key)

    async def set(self, key: str, value: str, **_kwargs) -> bool:
        if self.unavailable:
            raise RedisError("restart")
        self.values[key] = value
        return True


def _database_url() -> str:
    value = os.getenv("MULTI_USER_TEST_DATABASE_URL", "")
    if not value.startswith("postgresql"):
        pytest.skip("MULTI_USER_TEST_DATABASE_URL must point to PostgreSQL")
    return value


@pytest_asyncio.fixture
async def sessions(monkeypatch):
    engine = create_async_engine(
        _database_url(),
        pool_pre_ping=True,
        connect_args={"statement_cache_size": 0, "prepared_statement_cache_size": 0},
    )
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    monkeypatch.setattr(database, "AsyncSessionLocal", maker)
    try:
        yield maker
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_logout_revocation_survives_empty_and_unavailable_redis(
    sessions, monkeypatch
) -> None:
    suffix = uuid.uuid4().hex
    async with sessions() as setup:
        user = User(
            email=f"durable-logout-{suffix}@test.local",
            password_hash="unused",
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Durable Logout",
        )
        setup.add(user)
        await setup.commit()
        await setup.refresh(user)
        token = authentication.issue_access_token(user)
        payload = verify_access_token(token)
        user.totp_secret_encrypted = "proof-encrypted-factor"
        user.is_2fa_enabled = True
        await setup.commit()
        trusted_device_token = create_trusted_device_token(
            str(user.id),
            factor=authentication.factor_fingerprint(user),
            auth_version=authentication.account_auth_version(user),
            expires_delta=timedelta(days=1),
        )

    # Redis is unavailable during logout. PostgreSQL must still commit the
    # revocation and the endpoint may safely report success.
    monkeypatch.setattr(authentication, "get_async_redis", lambda: _Redis(unavailable=True))
    async with sessions() as logout_db:
        await authentication.revoke_access_session(payload, logout_db)
        await authentication.revoke_trusted_device(trusted_device_token, logout_db)

    async with sessions() as verify:
        durable = await verify.scalar(
            select(RevokedSession).where(
                RevokedSession.session_id == uuid.UUID(payload["sid"])
            )
        )
        assert durable is not None
        assert durable.user_id == user.id
        durable_device = await verify.scalar(
            select(RevokedTrustedDevice).where(
                RevokedTrustedDevice.user_id == user.id
            )
        )
        assert durable_device is not None

    # A restarted Redis has no revocation key. The durable row remains
    # authoritative for HTTP requests and socket-ticket consumption.
    monkeypatch.setattr(authentication, "get_async_redis", lambda: _Redis())
    with pytest.raises(AuthenticationRejected, match="revoked"):
        await authentication.ensure_access_session_active(payload)
    assert await authentication.trusted_device_is_valid(
        user, trusted_device_token
    ) is False
