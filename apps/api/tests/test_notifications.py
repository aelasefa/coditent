from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import Notification, User, UserRole
from app.routers import notifications
from app.schemas import NotificationPreferenceUpdate
from app.services.notifications import create_notification


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _users(db):
    first = User(
        email=f"notify-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        is_active=True,
        full_name="First Candidate",
    )
    second = User(
        email=f"notify-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        is_active=True,
        full_name="Second Candidate",
    )
    db.add_all([first, second])
    await db.commit()
    return first, second


@pytest.mark.asyncio
async def test_notification_dedupe_and_owner_scoped_read(db):
    owner, other = await _users(db)
    created = await create_notification(
        db,
        user_id=owner.id,
        category="application",
        title="Application updated",
        body="Your application moved to Shortlisted.",
        action_url="/dashboard/applications",
        resource_type="application",
        resource_id=uuid.uuid4(),
        dedupe_key="application-stage:one:2",
    )
    duplicate = await create_notification(
        db,
        user_id=owner.id,
        category="application",
        title="Application updated",
        body="Duplicate retry",
        dedupe_key="application-stage:one:2",
    )
    await db.commit()
    assert created is not None and duplicate is None
    assert len(list((await db.execute(select(Notification))).scalars())) == 1

    page = await notifications.list_notifications(owner, db, 1, 25, False)
    assert page.total == 1 and page.unread == 1
    with pytest.raises(HTTPException) as hidden:
        await notifications.mark_notification_read(created.id, other, db)
    assert hidden.value.status_code == 404
    read = await notifications.mark_notification_read(created.id, owner, db)
    assert read.read_at is not None


@pytest.mark.asyncio
async def test_disabled_preference_prevents_new_event(db):
    owner, _other = await _users(db)
    preferences = await notifications.update_notification_preferences(
        NotificationPreferenceUpdate(
            application_updates=False,
            assessment_updates=True,
            interview_updates=True,
            message_updates=True,
        ),
        owner,
        db,
    )
    assert preferences.application_updates is False
    skipped = await create_notification(
        db,
        user_id=owner.id,
        category="application",
        title="Application updated",
        body="This event is disabled.",
        dedupe_key="disabled-event",
    )
    system = await create_notification(
        db,
        user_id=owner.id,
        category="system",
        title="Security notice",
        body="System notices remain enabled.",
        dedupe_key="system-event",
    )
    await db.commit()
    assert skipped is None and system is not None


@pytest.mark.asyncio
async def test_notification_rejects_external_action_url(db):
    owner, _other = await _users(db)
    with pytest.raises(ValueError, match="internal path"):
        await create_notification(
            db,
            user_id=owner.id,
            category="message",
            title="Unsafe link",
            body="External redirects are not accepted.",
            action_url="https://attacker.test/phish",
            dedupe_key="unsafe-link",
        )
