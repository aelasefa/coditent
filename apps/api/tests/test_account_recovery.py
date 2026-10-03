from __future__ import annotations

import html
import re
from inspect import unwrap
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool
from starlette.requests import Request

from app.config import settings
from app.models import Company, EmailDelivery, PasswordRecovery, User, UserRole
from app.routers import account_recovery
from app.schemas import PasswordRecoveryConfirm, PasswordRecoveryRequest
from app.services.email_outbox import _decrypt_payload
from app.services.passwords import hash_password, verify_password


def _request(path: str) -> Request:
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": path,
            "headers": [],
            "client": ("127.0.0.1", 41000),
        }
    )


@pytest_asyncio.fixture
async def sessions(monkeypatch):
    monkeypatch.setattr(
        settings,
        "email_outbox_encryption_key",
        Fernet.generate_key().decode("ascii"),
    )
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Company.__table__.create)
        await connection.run_sync(User.__table__.create)
        await connection.run_sync(EmailDelivery.__table__.create)
        await connection.run_sync(PasswordRecovery.__table__.create)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_recovery_is_non_enumerating_single_use_and_invalidates_sessions(sessions):
    async with sessions() as db:
        unknown = await unwrap(account_recovery.request_password_recovery)(
            PasswordRecoveryRequest(email="unknown@example.com"),
            _request("/auth/recovery/request"),
            db,
        )
        assert unknown == account_recovery.GENERIC_RESPONSE
        assert await db.scalar(select(PasswordRecovery)) is None

    old_hash = hash_password("CurrentPassword123!")
    async with sessions() as db:
        user = User(
            email="candidate@example.com",
            password_hash=old_hash,
            role=UserRole.CANDIDATE,
            is_approved=True,
            is_active=True,
            full_name="Candidate Person",
            auth_version=7,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)
        user_id = user.id

        known = await unwrap(account_recovery.request_password_recovery)(
            PasswordRecoveryRequest(email="candidate@example.com"),
            _request("/auth/recovery/request"),
            db,
        )
        assert known == unknown
        delivery = await db.scalar(select(EmailDelivery))
        assert delivery is not None
        assert "candidate@example.com" not in delivery.encrypted_payload
        payload = _decrypt_payload(delivery.encrypted_payload)
        match = re.search(r"/reset-password\?token=([^\"&]+)", html.unescape(payload["html"]))
        assert match is not None
        token = match.group(1)

    with patch.object(account_recovery, "log_audit", AsyncMock(return_value=None)):
        async with sessions() as db:
            result = await unwrap(account_recovery.confirm_password_recovery)(
                PasswordRecoveryConfirm(
                    token=token,
                    new_password="ReplacementPassword456!",
                ),
                _request("/auth/recovery/confirm"),
                db,
            )
            assert result["detail"].startswith("Password updated")
            refreshed = await db.scalar(select(User).where(User.id == user_id))
            assert refreshed is not None
            assert refreshed.auth_version == 8
            assert verify_password("ReplacementPassword456!", refreshed.password_hash)
            assert not verify_password("CurrentPassword123!", refreshed.password_hash)

        async with sessions() as db:
            with pytest.raises(HTTPException) as replay:
                await unwrap(account_recovery.confirm_password_recovery)(
                    PasswordRecoveryConfirm(
                        token=token,
                        new_password="AnotherPassword789!",
                    ),
                    _request("/auth/recovery/confirm"),
                    db,
                )
            assert replay.value.status_code == 400
