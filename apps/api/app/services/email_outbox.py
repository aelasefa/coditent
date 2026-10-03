"""Encrypted, durable, idempotent email delivery outbox.

Domain rows and their email intent are committed together. Delivery can be
attempted immediately for responsive UI, while the dispatcher recovers
provider failures and crashed processes from the same authoritative row.
"""

from __future__ import annotations

import asyncio
import json
import socket
import uuid
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from cryptography.fernet import Fernet, InvalidToken
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models import EmailDelivery
from app.services.email import send_email


MAX_ENCRYPTED_PAYLOAD_CHARS = 2_000_000
RETRY_DELAYS_SECONDS = (30, 120, 600, 1_800, 3_600)


class EmailOutboxUnavailable(RuntimeError):
    pass


def _cipher() -> Fernet:
    key = (settings.email_outbox_encryption_key or "").strip()
    if not key:
        raise EmailOutboxUnavailable("Email outbox encryption is not configured")
    try:
        return Fernet(key.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise EmailOutboxUnavailable("Email outbox encryption is invalid") from exc


def _encrypt_payload(payload: dict[str, Any]) -> str:
    encoded = json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")
    encrypted = "v1:" + _cipher().encrypt(encoded).decode("ascii")
    if len(encrypted) > MAX_ENCRYPTED_PAYLOAD_CHARS:
        raise ValueError("Email payload is too large")
    return encrypted


def _decrypt_payload(value: str) -> dict[str, Any]:
    if not value.startswith("v1:"):
        raise EmailOutboxUnavailable("Unsupported email payload version")
    try:
        decoded = _cipher().decrypt(value[3:].encode("ascii"))
        payload = json.loads(decoded.decode("utf-8"))
    except (InvalidToken, UnicodeError, json.JSONDecodeError) as exc:
        raise EmailOutboxUnavailable("Email payload cannot be decrypted") from exc
    if not isinstance(payload, dict):
        raise EmailOutboxUnavailable("Email payload is invalid")
    return payload


async def enqueue_email_delivery(
    db: AsyncSession,
    *,
    kind: str,
    dedupe_key: str,
    resource_type: str,
    resource_id: UUID,
    to_email: str,
    subject: str,
    html: str,
    text: str | None = None,
    attachments: list[dict[str, str]] | None = None,
) -> EmailDelivery:
    """Add one delivery intent to the caller's uncommitted transaction."""
    if not kind or len(kind) > 50 or not dedupe_key or len(dedupe_key) > 255:
        raise ValueError("Invalid email delivery identity")
    existing = await db.scalar(
        select(EmailDelivery).where(EmailDelivery.dedupe_key == dedupe_key)
    )
    if existing is not None:
        return existing

    now = datetime.utcnow()
    delivery = EmailDelivery(
        kind=kind,
        dedupe_key=dedupe_key,
        resource_type=resource_type,
        resource_id=resource_id,
        encrypted_payload=_encrypt_payload(
            {
                "to_email": to_email,
                "subject": subject,
                "html": html,
                "text": text,
                "attachments": attachments or [],
            }
        ),
        status="pending",
        attempts=0,
        max_attempts=settings.email_delivery_max_attempts,
        available_at=now,
        created_at=now,
        updated_at=now,
    )
    db.add(delivery)
    await db.flush()
    return delivery


def _due_condition(now: datetime):
    return or_(
        and_(
            EmailDelivery.status.in_(("pending", "retry")),
            EmailDelivery.available_at <= now,
        ),
        and_(
            EmailDelivery.status == "processing",
            EmailDelivery.lease_until.is_not(None),
            EmailDelivery.lease_until <= now,
        ),
    )


async def _claim_delivery(
    db: AsyncSession,
    delivery_id: UUID,
    *,
    worker_id: str,
) -> EmailDelivery | None:
    now = datetime.utcnow()
    delivery = await db.scalar(
        select(EmailDelivery)
        .where(EmailDelivery.id == delivery_id, _due_condition(now))
        .with_for_update(skip_locked=True)
    )
    if delivery is None:
        await db.rollback()
        return None
    if delivery.attempts >= delivery.max_attempts:
        delivery.status = "failed"
        delivery.lease_owner = None
        delivery.lease_until = None
        delivery.last_error_code = delivery.last_error_code or "EMAIL_DELIVERY_LEASE_EXHAUSTED"
        delivery.updated_at = now
        await db.commit()
        return None
    delivery.status = "processing"
    delivery.attempts += 1
    delivery.lease_owner = worker_id[:100]
    delivery.lease_until = now + timedelta(seconds=settings.email_delivery_lease_seconds)
    delivery.last_error_code = None
    delivery.updated_at = now
    await db.commit()
    return delivery


async def deliver_email_job(
    db: AsyncSession,
    delivery_id: UUID,
    *,
    worker_id: str | None = None,
) -> str:
    """Claim and deliver one row; return its visible final/current status."""
    identity = worker_id or f"{socket.gethostname()}:{uuid.uuid4().hex[:12]}"
    delivery = await _claim_delivery(db, delivery_id, worker_id=identity)
    if delivery is None:
        current = await db.scalar(
            select(EmailDelivery.status).where(EmailDelivery.id == delivery_id)
        )
        return str(current or "missing")

    try:
        payload = _decrypt_payload(delivery.encrypted_payload)
        provider_result = await asyncio.to_thread(
            send_email,
            str(payload["to_email"]),
            str(payload["subject"]),
            str(payload["html"]),
            payload.get("text"),
            payload.get("attachments") or None,
            idempotency_key=f"coditent-email-{delivery.id}",
        )
    except Exception as exc:
        now = datetime.utcnow()
        delivery = await db.scalar(
            select(EmailDelivery).where(EmailDelivery.id == delivery_id).with_for_update()
        )
        if delivery is None:
            return "missing"
        delivery.last_error_code = type(exc).__name__[:80]
        delivery.lease_owner = None
        delivery.lease_until = None
        delivery.updated_at = now
        if delivery.attempts >= delivery.max_attempts:
            delivery.status = "failed"
        else:
            delay_index = min(delivery.attempts - 1, len(RETRY_DELAYS_SECONDS) - 1)
            delivery.status = "retry"
            delivery.available_at = now + timedelta(seconds=RETRY_DELAYS_SECONDS[delay_index])
        await db.commit()
        return delivery.status

    now = datetime.utcnow()
    delivery = await db.scalar(
        select(EmailDelivery).where(EmailDelivery.id == delivery_id).with_for_update()
    )
    if delivery is None:
        return "missing"
    delivery.status = "sent"
    delivery.provider_message_id = str(provider_result.get("id") or "")[:255] or None
    delivery.last_error_code = None
    delivery.lease_owner = None
    delivery.lease_until = None
    delivery.sent_at = now
    delivery.updated_at = now
    await db.commit()
    return "sent"


async def run_email_delivery_cycle(
    session_factory: async_sessionmaker[AsyncSession],
    *,
    worker_id: str,
    limit: int = 10,
) -> int:
    """Recover due, retriable, or abandoned deliveries."""
    if not settings.email_outbox_encryption_key:
        return 0
    now = datetime.utcnow()
    async with session_factory() as db:
        ids = list(
            (
                await db.execute(
                    select(EmailDelivery.id)
                    .where(_due_condition(now))
                    .order_by(EmailDelivery.available_at, EmailDelivery.created_at)
                    .limit(max(1, min(limit, 50)))
                )
            ).scalars()
        )
    processed = 0
    for delivery_id in ids:
        async with session_factory() as db:
            status = await deliver_email_job(db, delivery_id, worker_id=worker_id)
            if status != "missing":
                processed += 1
    return processed
