from __future__ import annotations

import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from cryptography.fernet import Fernet
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.models import EmailDelivery
from app.services import email_outbox
from app.services.email_outbox import deliver_email_job, enqueue_email_delivery


@pytest_asyncio.fixture
async def sessions(monkeypatch):
    monkeypatch.setattr(
        settings,
        "email_outbox_encryption_key",
        Fernet.generate_key().decode("ascii"),
    )
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(EmailDelivery.__table__.create)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    try:
        yield factory
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_email_payload_is_encrypted_deduplicated_and_retried_idempotently(
    sessions,
    monkeypatch,
):
    invitation_id = uuid.uuid4()
    recipient = "candidate@example.com"
    secret_link = "https://example.com/invite?token=never-store-this-plain"
    async with sessions() as db:
        first = await enqueue_email_delivery(
            db,
            kind="employee_invitation",
            dedupe_key=f"employee-invitation:{invitation_id}",
            resource_type="employee_invitation",
            resource_id=invitation_id,
            to_email=recipient,
            subject="Invitation",
            html=f'<a href="{secret_link}">Join</a>',
        )
        second = await enqueue_email_delivery(
            db,
            kind="employee_invitation",
            dedupe_key=f"employee-invitation:{invitation_id}",
            resource_type="employee_invitation",
            resource_id=invitation_id,
            to_email=recipient,
            subject="Invitation",
            html=f'<a href="{secret_link}">Join</a>',
        )
        assert first.id == second.id
        assert recipient not in first.encrypted_payload
        assert "never-store-this-plain" not in first.encrypted_payload
        await db.commit()

    calls: list[str] = []

    def flaky_send(*_args, idempotency_key=None, **_kwargs):
        calls.append(str(idempotency_key))
        if len(calls) == 1:
            raise RuntimeError("provider unavailable")
        return {"id": "provider-message"}

    monkeypatch.setattr(email_outbox, "send_email", flaky_send)
    async with sessions() as db:
        assert await deliver_email_job(db, first.id, worker_id="worker-one") == "retry"
        await db.execute(
            update(EmailDelivery)
            .where(EmailDelivery.id == first.id)
            .values(available_at=datetime.utcnow() - timedelta(seconds=1))
        )
        await db.commit()
        assert await deliver_email_job(db, first.id, worker_id="worker-two") == "sent"
        stored = await db.scalar(select(EmailDelivery).where(EmailDelivery.id == first.id))
        assert stored is not None
        assert stored.status == "sent"
        assert stored.attempts == 2
        assert stored.provider_message_id == "provider-message"
        assert stored.last_error_code is None

    assert calls == [f"coditent-email-{first.id}", f"coditent-email-{first.id}"]


@pytest.mark.asyncio
async def test_expired_processing_lease_is_recoverable(sessions, monkeypatch):
    monkeypatch.setattr(email_outbox, "send_email", lambda *_args, **_kwargs: {"id": "ok"})
    async with sessions() as db:
        delivery = await enqueue_email_delivery(
            db,
            kind="company_invitation",
            dedupe_key=f"company-invitation:{uuid.uuid4()}",
            resource_type="company_invitation",
            resource_id=uuid.uuid4(),
            to_email="company@example.com",
            subject="Join",
            html="<p>Join</p>",
        )
        delivery.status = "processing"
        delivery.lease_until = datetime.utcnow() - timedelta(seconds=1)
        delivery.lease_owner = "dead-worker"
        await db.commit()
        assert await deliver_email_job(db, delivery.id, worker_id="replacement") == "sent"
