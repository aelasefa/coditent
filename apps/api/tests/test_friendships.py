from __future__ import annotations

import os
import uuid
from datetime import datetime

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.database import Base
from app.models import Application, ChatMessage, Company, Friendship, Offer, User, UserRole
from app.routers import chat, friends
from app.schemas import ChatMessageCreate
from app.services.friendships import canonical_pair, get_relationship


def candidate(name: str, *, approved: bool = True, active: bool = True) -> User:
    slug = name.lower().replace(" ", "-")
    return User(
        email=f"{slug}-{uuid.uuid4().hex[:6]}@test.local",
        password_hash="test-hash",
        role=UserRole.CANDIDATE,
        is_approved=approved,
        is_active=active,
        full_name=name,
    )


@pytest_asyncio.fixture
async def db() -> AsyncSession:
    database_url = os.getenv("FRIENDSHIP_TEST_DATABASE_URL", "sqlite+aiosqlite:///:memory:")
    engine = create_async_engine(database_url)
    if database_url.startswith("sqlite"):
        async with engine.begin() as connection:
            await connection.run_sync(Base.metadata.create_all)
    maker = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


@pytest.fixture(autouse=True)
def no_external_realtime(monkeypatch):
    async def offline(*_args, **_kwargs):
        return False

    async def offline_map(user_ids):
        return {user_id: False for user_id in user_ids}

    async def no_broadcast(*_args, **_kwargs):
        return None

    monkeypatch.setattr(friends, "is_online", offline)
    monkeypatch.setattr(friends, "presence_map", offline_map)
    monkeypatch.setattr(friends, "_publish_relationship_revoked", no_broadcast)
    monkeypatch.setattr(chat, "is_online", offline)
    monkeypatch.setattr(chat, "_broadcast_friend_message", no_broadcast)


@pytest.mark.asyncio
async def test_search_is_candidate_only_safe_and_excludes_self_disabled_unverified(db: AsyncSession):
    viewer = candidate("Search Person")
    visible = candidate("Search Candidate")
    disabled = candidate("Search Disabled", active=False)
    unverified = candidate("Search Unverified", approved=False)
    company_user = User(
        email=f"search-company-{uuid.uuid4().hex[:6]}@test.local",
        password_hash="test-hash",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        is_active=True,
        full_name="Search Company",
        company_role="HR",
    )
    admin = User(
        email=f"search-admin-{uuid.uuid4().hex[:6]}@test.local",
        password_hash="test-hash",
        role=UserRole.PLATFORM_ADMIN,
        is_approved=True,
        is_active=True,
        full_name="Search Admin",
    )
    db.add_all([viewer, visible, disabled, unverified, company_user, admin])
    await db.commit()

    result = await friends.search_people(viewer, db, (20, 0), "search")

    assert [item.id for item in result.friends] == [visible.id]
    assert result.friends[0].masked_email.endswith("@test.local")
    assert visible.email not in result.friends[0].masked_email
    assert result.friends[0].relationship_state == "NONE"


@pytest.mark.asyncio
async def test_request_accept_remove_lifecycle_and_history_is_preserved(db: AsyncSession):
    alice, bob = candidate("Alice"), candidate("Bob")
    db.add_all([alice, bob])
    await db.commit()

    sent = await friends.send_friend_request(bob.id, alice, db)
    assert sent.status == "PENDING"
    assert (await friends.sent_requests(alice, db)).total == 1
    assert (await friends.incoming_requests(bob, db)).total == 1

    accepted = await friends.accept_friend_request(sent.id, bob, db)
    assert accepted.status == "ACCEPTED"
    created = await chat.send_message(ChatMessageCreate(receiver_id=bob.id, content="hello"), alice, db)
    assert created.content == "hello"

    await friends.remove_friend(bob.id, alice, db)
    with pytest.raises(HTTPException) as rejected:
        await chat.send_message(ChatMessageCreate(receiver_id=bob.id, content="blocked"), alice, db)
    assert rejected.value.status_code == 403
    context = await chat.get_conversation(bob.id, alice, db, before=None, limit=50)
    assert context.can_message is False
    assert [message.content for message in context.messages] == ["hello"]


@pytest.mark.asyncio
async def test_decline_cancel_and_actor_authorization(db: AsyncSession):
    alice, bob, mallory = candidate("Alice"), candidate("Bob"), candidate("Mallory")
    db.add_all([alice, bob, mallory])
    await db.commit()

    first = await friends.send_friend_request(bob.id, alice, db)
    with pytest.raises(HTTPException) as unauthorized_accept:
        await friends.accept_friend_request(first.id, mallory, db)
    assert unauthorized_accept.value.status_code == 403
    await friends.decline_friend_request(first.id, bob, db)
    assert await get_relationship(db, alice.id, bob.id) is None

    second = await friends.send_friend_request(bob.id, alice, db)
    with pytest.raises(HTTPException) as unauthorized_cancel:
        await friends.cancel_friend_request(second.id, bob, db)
    assert unauthorized_cancel.value.status_code == 403
    await friends.cancel_friend_request(second.id, alice, db)
    assert await get_relationship(db, alice.id, bob.id) is None


@pytest.mark.asyncio
async def test_self_duplicate_and_reverse_requests_are_consistent(db: AsyncSession):
    alice, bob = candidate("Alice"), candidate("Bob")
    db.add_all([alice, bob])
    await db.commit()

    with pytest.raises(HTTPException) as self_request:
        await friends.send_friend_request(alice.id, alice, db)
    assert self_request.value.status_code == 400

    first = await friends.send_friend_request(bob.id, alice, db)
    with pytest.raises(HTTPException) as duplicate:
        await friends.send_friend_request(bob.id, alice, db)
    assert duplicate.value.status_code == 409

    mutual = await friends.send_friend_request(alice.id, bob, db)
    assert mutual.id == first.id
    assert mutual.status == "ACCEPTED"
    low, high = canonical_pair(alice.id, bob.id)
    count = int(
        (
            await db.execute(
                select(func.count(Friendship.id)).where(
                    Friendship.pair_low_id == low,
                    Friendship.pair_high_id == high,
                )
            )
        ).scalar_one()
    )
    assert count == 1


@pytest.mark.asyncio
async def test_database_pair_constraint_rejects_reverse_duplicate(db: AsyncSession):
    alice, bob = candidate("Alice"), candidate("Bob")
    db.add_all([alice, bob])
    await db.commit()
    low, high = canonical_pair(alice.id, bob.id)
    db.add_all([
        Friendship(requester_id=alice.id, addressee_id=bob.id, pair_low_id=low, pair_high_id=high),
        Friendship(requester_id=bob.id, addressee_id=alice.id, pair_low_id=low, pair_high_id=high),
    ])
    with pytest.raises(IntegrityError):
        await db.commit()


@pytest.mark.asyncio
async def test_pending_and_blocked_candidates_cannot_message(db: AsyncSession):
    alice, bob = candidate("Alice"), candidate("Bob")
    db.add_all([alice, bob])
    await db.commit()
    await friends.send_friend_request(bob.id, alice, db)

    with pytest.raises(HTTPException) as pending:
        await chat.send_message(ChatMessageCreate(receiver_id=bob.id, content="no"), alice, db)
    assert pending.value.status_code == 403

    await friends.block_candidate(alice.id, bob, db)
    with pytest.raises(HTTPException) as blocked:
        await chat.send_message(ChatMessageCreate(receiver_id=bob.id, content="still no"), alice, db)
    assert blocked.value.status_code == 403
    with pytest.raises(HTTPException) as hidden:
        await friends.send_friend_request(bob.id, alice, db)
    assert hidden.value.status_code == 403


@pytest.mark.asyncio
async def test_combined_inbox_keeps_friend_and_recruitment_conversations_separate(db: AsyncSession):
    alice, bob = candidate("Alice"), candidate("Bob")
    company = Company(name=f"Inbox Co {uuid.uuid4().hex[:6]}")
    db.add(company)
    await db.flush()
    recruiter = User(
        email=f"inbox-hr-{uuid.uuid4().hex[:6]}@test.local",
        password_hash="test-hash",
        role=UserRole.COMPANY_USER,
        is_approved=True,
        is_active=True,
        full_name="Recruiter",
        company_id=company.id,
        company_role="HR",
    )
    db.add_all([alice, bob, recruiter])
    await db.flush()
    company.owner_id = recruiter.id
    offer = Offer(
        recruiter_id=recruiter.id,
        responsible_hr_id=recruiter.id,
        created_by=recruiter.id,
        company_id=company.id,
        title="Engineer",
        company=company.name,
        region="Casablanca",
        field="Software",
        type="JOB",
        description="Build reliable software.",
        requirements="Python",
    )
    db.add(offer)
    await db.flush()
    application = Application(
        candidate_id=alice.id,
        opportunity_id=offer.id,
        company_id=company.id,
        status="shortlisted",
    )
    low, high = canonical_pair(alice.id, bob.id)
    db.add_all([
        application,
        Friendship(requester_id=alice.id, addressee_id=bob.id, pair_low_id=low, pair_high_id=high, status="ACCEPTED", responded_at=datetime.utcnow()),
    ])
    await db.commit()

    inbox = await chat.combined_inbox(alice, db)
    assert [item.conversation_type for item in inbox.conversations] == ["FRIEND", "RECRUITMENT"]
    assert {item.badge for item in inbox.conversations} == {"Friend", "Recruiter"}
    assert len({item.conversation_id for item in inbox.conversations}) == 2
    recruitment = next(item for item in inbox.conversations if item.conversation_type == "RECRUITMENT")
    assert recruitment.href == f"/chat/recruitment/{application.id}"


@pytest.mark.asyncio
async def test_unfriend_never_deletes_direct_message_history(db: AsyncSession):
    alice, bob = candidate("Alice"), candidate("Bob")
    db.add_all([alice, bob])
    await db.flush()
    low, high = canonical_pair(alice.id, bob.id)
    relationship = Friendship(requester_id=alice.id, addressee_id=bob.id, pair_low_id=low, pair_high_id=high, status="ACCEPTED")
    message = ChatMessage(sender_id=alice.id, receiver_id=bob.id, content="retained")
    db.add_all([relationship, message])
    await db.commit()

    await friends.remove_friend(bob.id, alice, db)
    retained = (await db.execute(select(ChatMessage).where(ChatMessage.id == message.id))).scalar_one()
    assert retained.content == "retained"
