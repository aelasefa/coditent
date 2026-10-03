from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AccountDeletionRequest, CandidateProfile, ChatMessage, Notification, User, UserRole
from app.routers import auth
from app.schemas import AccountDataExportRequest, AccountDeletionCreate
from app.services.passwords import hash_password
from app.services.privacy import run_account_deletion_cycle


@pytest_asyncio.fixture
async def db():
    engine = create_async_engine("sqlite+aiosqlite:///:memory:", poolclass=StaticPool)
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)
    factory = async_sessionmaker(engine, expire_on_commit=False)
    async with factory() as session:
        yield session
    await engine.dispose()


async def _account(db):
    password = "Correct-Horse-9!"
    user = User(email=f"privacy-{uuid.uuid4().hex}@test.local", password_hash=hash_password(password), role=UserRole.CANDIDATE, is_approved=True, is_active=True, full_name="Privacy Candidate")
    peer = User(email=f"peer-{uuid.uuid4().hex}@test.local", password_hash="x", role=UserRole.CANDIDATE, is_approved=True, is_active=True, full_name="Peer")
    db.add_all([user, peer])
    await db.flush()
    db.add(CandidateProfile(user_id=user.id, city="Rabat", phone="+212600000000", bio="Personal biography", onboarding_completed=True))
    db.add(Notification(user_id=user.id, category="system", title="Notice", body="Account notice", dedupe_key=f"notice-{user.id}"))
    db.add(ChatMessage(sender_id=user.id, receiver_id=peer.id, content="Personal message"))
    await db.commit()
    return user, peer, password


@pytest.mark.asyncio
async def test_authenticated_export_is_downloaded_without_persisting_a_copy(db):
    user, _peer, password = await _account(db)
    response = await auth.export_account_data(AccountDataExportRequest(current_password=password), user, db)
    assert response.media_type == "application/json"
    assert "attachment" in response.headers["content-disposition"]
    payload = json.loads(response.body)
    assert payload["format"] == "coditent-account-export-v1"
    assert payload["account"]["email"] == user.email
    assert payload["profile"]["city"] == "Rabat"
    assert payload["messages"][0]["content"] == "Personal message"
    assert "password_hash" not in payload["account"]


@pytest.mark.asyncio
async def test_deletion_is_cancelable_during_grace_period(db):
    user, _peer, password = await _account(db)
    scheduled = await auth.schedule_account_deletion(
        AccountDeletionCreate(current_password=password, confirmation="DELETE"), user, db
    )
    assert scheduled.status == "scheduled"
    assert scheduled.execute_after > datetime.utcnow() + timedelta(days=6)
    canceled = await auth.cancel_account_deletion(
        AccountDataExportRequest(current_password=password), user, db
    )
    assert canceled.status == "canceled" and canceled.canceled_at is not None


@pytest.mark.asyncio
async def test_due_deletion_anonymizes_identity_and_user_content(db):
    user, _peer, password = await _account(db)
    user_id = user.id
    scheduled = await auth.schedule_account_deletion(
        AccountDeletionCreate(current_password=password, confirmation="DELETE"), user, db
    )
    request = await db.get(AccountDeletionRequest, scheduled.id)
    request.execute_after = datetime.utcnow() - timedelta(seconds=1)
    request.next_attempt_at = request.execute_after
    await db.commit()
    assert await run_account_deletion_cycle(db, "privacy-test") == 1
    deleted_user = await db.get(User, user_id)
    assert deleted_user is not None
    assert deleted_user.is_active is False
    assert deleted_user.full_name == "Deleted user"
    assert deleted_user.email.endswith("@example.invalid")
    profile = (await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == user_id))).scalar_one()
    assert profile.city is None and profile.phone is None and profile.bio is None
    message = (await db.execute(select(ChatMessage).where(ChatMessage.sender_id == user_id))).scalar_one()
    assert message.content == "[deleted by account owner]"
    assert await db.scalar(select(Notification.id).where(Notification.user_id == user_id)) is None
