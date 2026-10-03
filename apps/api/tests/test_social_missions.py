from __future__ import annotations

import uuid

import pytest
import pytest_asyncio
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.models import CandidateProfile, Friendship, User, UserRole
from app.routers import friends, missions
from app.schemas import MissionAttemptCreate, MissionAttemptReview, PracticeMissionCreate


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
    candidate = User(
        email=f"candidate-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Candidate",
    )
    peer = User(
        email=f"peer-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Peer",
    )
    admin = User(
        email=f"admin-{uuid.uuid4().hex}@test.local",
        password_hash="x",
        role=UserRole.PLATFORM_ADMIN,
        is_approved=True,
        full_name="Admin",
    )
    db.add_all([candidate, peer, admin])
    await db.commit()
    return candidate, peer, admin


@pytest.mark.asyncio
async def test_friend_add_list_presence_and_remove_are_symmetric(db):
    candidate, peer, _admin = await _users(db)
    added = await friends.add_friend(peer.id, candidate, db)
    assert added.id == peer.id
    pairs = list((await db.execute(Friendship.__table__.select())).mappings())
    assert {(row["user_id"], row["friend_id"]) for row in pairs} == {
        (candidate.id, peer.id),
        (peer.id, candidate.id),
    }
    page = await friends.list_friends(candidate, db, (20, 0), "name")
    assert page.total == 1 and page.friends[0].id == peer.id
    await friends.presence_heartbeat(peer, db)
    page = await friends.list_friends(candidate, db, (20, 0), "recent")
    assert page.friends[0].online is True
    await friends.remove_friend(peer.id, candidate, db)
    assert (await friends.list_friends(candidate, db, (20, 0), "name")).total == 0


@pytest.mark.asyncio
async def test_mission_attempt_review_updates_only_validated_profile_fields(db):
    candidate, _peer, admin = await _users(db)
    mission = await missions.create_mission(
        PracticeMissionCreate(
            field="Backend engineering",
            level="intermediate",
            title="Concurrency evidence",
            description="Explain and demonstrate a concurrency-safe workflow.",
            evidence_prompt="Provide design evidence and describe the race you prevented.",
            skills=["Concurrency", "API design"],
        ),
        admin,
        db,
    )
    attempt = await missions.create_attempt(
        mission.id,
        MissionAttemptCreate(
            evidence="I used a row lock and a unique constraint, then tested concurrent writes."
        ),
        candidate,
        db,
    )
    with pytest.raises(HTTPException) as duplicate:
        await missions.create_attempt(
            mission.id,
            MissionAttemptCreate(evidence="A second unresolved submission should not be accepted."),
            candidate,
            db,
        )
    assert duplicate.value.status_code == 409

    reviewed = await missions.review_attempt(
        attempt.id,
        MissionAttemptReview(
            expected_version=attempt.version,
            status="validated",
            score=91,
            validated_skills=["Concurrency"],
            feedback="Evidence demonstrates the claimed concurrency control.",
        ),
        admin,
        db,
    )
    assert reviewed.status == "validated" and reviewed.score == 91
    profile = (
        await db.execute(
            CandidateProfile.__table__.select().where(CandidateProfile.user_id == candidate.id)
        )
    ).mappings().one()
    assert profile["overall_score"] == 91
    assert "Concurrency" in profile["validated_skills"]
    progress = await missions.get_my_progress(candidate, db)
    assert progress.completed == 1
    assert progress.validated_skills == ["Concurrency"]


@pytest.mark.asyncio
async def test_reviewer_cannot_invent_skills_outside_mission(db):
    candidate, _peer, admin = await _users(db)
    mission = await missions.create_mission(
        PracticeMissionCreate(
            field="Frontend",
            level="beginner",
            title="Accessible form",
            description="Describe how you built an accessible form.",
            evidence_prompt="Provide semantic and keyboard evidence.",
            skills=["Accessibility"],
        ),
        admin,
        db,
    )
    attempt = await missions.create_attempt(
        mission.id,
        MissionAttemptCreate(evidence="I paired every field with a label and tested keyboard navigation."),
        candidate,
        db,
    )
    with pytest.raises(HTTPException) as caught:
        await missions.review_attempt(
            attempt.id,
            MissionAttemptReview(
                expected_version=attempt.version,
                status="validated",
                score=80,
                validated_skills=["Security"],
                feedback="Invalid skill claim should be rejected.",
            ),
            admin,
            db,
        )
    assert caught.value.status_code == 422
