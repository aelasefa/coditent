from __future__ import annotations

import json
import uuid
from datetime import datetime, timedelta

import pytest
import pytest_asyncio
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import AccountDeletionRequest, CandidateProfile, ChatMessage, CVAsset, EmailDelivery, Notification, User, UserRole
from app.routers import auth
from app.schemas import AccountDataExportRequest, AccountDataImportRequest, AccountDeletionCreate, ProfileUpdate
from app.services.passwords import hash_password
from app.services.privacy import run_account_deletion_cycle, serialize_account_export


def test_only_the_confirmed_account_privacy_routes_are_exposed():
    from app.main import app

    paths = app.openapi()["paths"]
    assert "/auth/account/data-export" in paths
    assert "/auth/account/data-import" in paths
    assert "/auth/account/deletion" in paths
    assert "/auth/gdpr/export" not in paths
    assert "/auth/gdpr/delete" not in paths


def test_deletion_requires_the_exact_confirmation_phrase():
    with pytest.raises(ValidationError):
        AccountDeletionCreate(current_password="Correct-Horse-9!", confirmation="delete")


def test_account_export_serializes_json_csv_and_xml_safely():
    payload = {"format": "coditent-account-export-v1", "profile": {"headline": "=unsafe", "bio": "A & B"}}
    csv_content, csv_type = serialize_account_export(payload, "csv")
    xml_content, xml_type = serialize_account_export(payload, "xml")
    json_content, json_type = serialize_account_export(payload, "json")
    assert "'=unsafe" in csv_content and csv_type.startswith("text/csv")
    assert "A &amp; B" in xml_content and xml_type == "application/xml"
    assert json.loads(json_content)["profile"]["bio"] == "A & B" and json_type == "application/json"


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
async def test_export_sends_confirmation_through_durable_outbox(db, monkeypatch):
    user, _peer, password = await _account(db)
    delivered: list[tuple[str, str]] = []

    def fake_send(to_email: str, subject: str, *_args, **_kwargs):
        delivered.append((to_email, subject))
        return {"id": "provider-message"}

    monkeypatch.setattr("app.services.email_outbox.send_email", fake_send)
    await auth.export_account_data(AccountDataExportRequest(current_password=password, format="csv"), user, db)
    delivery = await db.scalar(
        select(EmailDelivery).where(EmailDelivery.resource_id == user.id).order_by(EmailDelivery.created_at.desc())
    )
    assert delivery is not None and delivery.status == "sent"
    assert delivered == [(user.email, "CODITENT data export confirmation")]


@pytest.mark.asyncio
async def test_deletion_is_cancelable_during_grace_period(db, monkeypatch):
    user, _peer, password = await _account(db)
    delivered: list[str] = []

    def fake_send(_to_email: str, subject: str, *_args, **_kwargs):
        delivered.append(subject)
        return {"id": f"provider-message-{len(delivered)}"}

    monkeypatch.setattr("app.services.email_outbox.send_email", fake_send)
    scheduled = await auth.schedule_account_deletion(
        AccountDeletionCreate(current_password=password, confirmation="DELETE"), user, db
    )
    assert scheduled.status == "scheduled"
    assert scheduled.execute_after > datetime.utcnow() + timedelta(days=6)
    canceled = await auth.cancel_account_deletion(
        AccountDataExportRequest(current_password=password), user, db
    )
    assert canceled.status == "canceled" and canceled.canceled_at is not None

    deliveries = list(
        (
            await db.execute(
                select(EmailDelivery)
                .where(EmailDelivery.resource_id == user.id)
                .order_by(EmailDelivery.created_at)
            )
        ).scalars()
    )
    assert [delivery.status for delivery in deliveries] == ["sent", "sent"]
    assert all(delivery.kind == "account_data_confirmation" for delivery in deliveries)
    assert delivered == [
        "CODITENT data deletion request confirmation",
        "CODITENT data deletion cancellation confirmation",
    ]


@pytest.mark.asyncio
async def test_validated_profile_import_updates_multiple_fields_atomically(db, monkeypatch):
    user, _peer, password = await _account(db)
    delivered: list[tuple[str, str]] = []

    def fake_send(to_email: str, subject: str, *_args, **_kwargs):
        delivered.append((to_email, subject))
        return {"id": "provider-message"}

    monkeypatch.setattr("app.services.email_outbox.send_email", fake_send)
    result = await auth.import_account_data(
        AccountDataImportRequest(
            current_password=password,
            profile=ProfileUpdate(city="Casablanca", headline="Backend engineer", years_of_experience=3),
        ),
        user,
        db,
    )
    profile = await db.scalar(select(CandidateProfile).where(CandidateProfile.user_id == user.id))
    assert result.updated_fields == ["city", "headline", "years_of_experience"]
    assert profile.city == "Casablanca" and profile.headline == "Backend engineer"
    delivery = await db.scalar(
        select(EmailDelivery).where(EmailDelivery.resource_id == user.id).order_by(EmailDelivery.created_at.desc())
    )
    assert delivery is not None and delivery.kind == "account_data_confirmation" and delivery.status == "sent"
    assert delivered == [(user.email, "CODITENT data import confirmation")]


@pytest.mark.asyncio
async def test_due_deletion_removes_private_files_then_anonymizes_identity_and_content(db, monkeypatch):
    user, _peer, password = await _account(db)
    user_id = user.id
    user.avatar_storage_path = f"{user.id}/avatar.png"
    cv_path = f"{user.id}/resume.pdf"
    db.add(
        CVAsset(
            owner_id=user.id,
            version=1,
            storage_path=cv_path,
            original_filename="resume.pdf",
            content_type="application/pdf",
            size_bytes=123,
        )
    )
    await db.commit()
    deleted_objects: list[tuple[str, str]] = []
    monkeypatch.setattr("app.services.privacy.delete_cv", lambda path: deleted_objects.append(("cv", path)))
    monkeypatch.setattr("app.services.privacy.delete_avatar", lambda path: deleted_objects.append(("avatar", path)))
    scheduled = await auth.schedule_account_deletion(
        AccountDeletionCreate(current_password=password, confirmation="DELETE"), user, db
    )
    request = await db.get(AccountDeletionRequest, scheduled.id)
    request.execute_after = datetime.utcnow() - timedelta(seconds=1)
    request.next_attempt_at = request.execute_after
    await db.commit()
    assert await run_account_deletion_cycle(db, "privacy-test") == 1
    assert deleted_objects == [("cv", cv_path), ("avatar", f"{user_id}/avatar.png")]
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
    completion = await db.scalar(
        select(EmailDelivery).where(EmailDelivery.resource_id == request.id)
    )
    assert completion is not None
    assert completion.kind == "account_data_confirmation"
    assert completion.status == "pending"


@pytest.mark.asyncio
async def test_storage_failure_retries_without_anonymizing_the_account(db, monkeypatch):
    user, _peer, password = await _account(db)
    original_email = user.email
    db.add(
        CVAsset(
            owner_id=user.id,
            version=1,
            storage_path=f"{user.id}/resume.pdf",
            original_filename="resume.pdf",
            content_type="application/pdf",
            size_bytes=123,
        )
    )
    await db.commit()

    def unavailable_storage(_path: str):
        raise RuntimeError("storage unavailable")

    monkeypatch.setattr("app.services.privacy.delete_cv", unavailable_storage)
    scheduled = await auth.schedule_account_deletion(
        AccountDeletionCreate(current_password=password, confirmation="DELETE"), user, db
    )
    request = await db.get(AccountDeletionRequest, scheduled.id)
    request.execute_after = datetime.utcnow() - timedelta(seconds=1)
    request.next_attempt_at = request.execute_after
    await db.commit()

    assert await run_account_deletion_cycle(db, "privacy-retry-test") == 0
    await db.refresh(request)
    await db.refresh(user)
    assert request.status == "retry"
    assert request.last_error_type == "RuntimeError"
    assert request.next_attempt_at > datetime.utcnow()
    assert user.is_active is True
    assert user.email == original_email
