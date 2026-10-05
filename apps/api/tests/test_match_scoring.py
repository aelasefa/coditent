"""Candidate job-match scoring tests. Offline: sqlite + mocked Gemini.

Run: python -m pytest tests/test_match_scoring.py -v
(from apps/api, with pytest, pytest-asyncio, sqlalchemy, aiosqlite installed)

Covers: new-offer eligibility, completed persistence, API shape, no-regen of
completed rows, local provider fallback, retry
recovery, apply-independence, candidate isolation, company boundaries.
"""
import asyncio
import sys
import types
import uuid
from datetime import datetime
from pathlib import Path

import pytest

_obs = types.ModuleType("app.observability")


class _Log:
    def info(self, *a, **k): ...
    def error(self, *a, **k): ...
    def warning(self, *a, **k): ...
    def exception(self, *a, **k): ...


_obs.get_logger = lambda name="t": _Log()
sys.modules["app.observability"] = _obs

_cfg = types.ModuleType("app.config")
_cfg.settings = types.SimpleNamespace(
    gemini_api_key="test",
    database_url="sqlite://",
    redis_url="redis://localhost:6379/0",
    recommendation_cache_ttl_seconds=900,
    ai_provider_timeout_seconds=30,
    gemini_model="gemini-3-flash-preview",
)
sys.modules["app.config"] = _cfg

# Stub app.database so importing app.models never touches Supabase/asyncpg.
# Reuse a shared stub when another test module already installed one, so both
# modules bind app.models to the same Base in a single pytest process.
from sqlalchemy.orm import DeclarativeBase  # noqa: E402


_existing_db = sys.modules.get("app.database")
if _existing_db is not None and hasattr(_existing_db, "Base"):
    _Base = _existing_db.Base
    _db = _existing_db
else:
    class _Base(DeclarativeBase):
        pass

    _db = types.ModuleType("app.database")
    _db.Base = _Base
    _db.engine = None
    _db.AsyncSessionLocal = None

from collections.abc import AsyncGenerator  # noqa: E402


async def _get_db() -> AsyncGenerator:
    raise RuntimeError("no live db in tests")


_db.get_db = _get_db
sys.modules["app.database"] = _db

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import select  # noqa: E402
from sqlalchemy.ext.asyncio import (  # noqa: E402
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.services.ai as ai_module  # noqa: E402
import app.services.match_scoring as match_scoring  # noqa: E402
import app.services.recommendation_jobs as rec_jobs  # noqa: E402
from app.models import (  # noqa: E402
    Application,
    CandidateProfile,
    Company,
    Offer,
    OfferType,
    SavedRecommendation,
    User,
    UserRole,
)
from app.schemas import RecommendationOut, RecommendationRequest  # noqa: E402


import pytest_asyncio  # noqa: E402


@pytest_asyncio.fixture()
async def db() -> AsyncGenerator[AsyncSession, None]:
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        poolclass=StaticPool,
    )
    async with engine.begin() as conn:
        await conn.run_sync(_Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)
    async with maker() as session:
        yield session
    await engine.dispose()


async def _candidate(db: AsyncSession, email: str = "cand@test.local") -> User:
    user = User(
        email=email,
        password_hash="x",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Cand",
    )
    db.add(user)
    await db.flush()
    db.add(
        CandidateProfile(
            user_id=user.id,
            city="Benguerir",
            field_of_study="Software Engineering",
            skills="React, Python",
        )
    )
    await db.commit()
    return user


async def _offer(
    db: AsyncSession,
    recruiter_id: uuid.UUID,
    title: str = "Software enginer",
    company_id: uuid.UUID | None = None,
    active: bool = True,
) -> Offer:
    offer = Offer(
        recruiter_id=recruiter_id,
        company_id=company_id,
        title=title,
        company="Oracle",
        region="On Site",
        field="Software Engineering",
        type=OfferType.JOB,
        description="Build features.",
        requirements="React basics.",
        active=active,
    )
    db.add(offer)
    await db.commit()
    return offer


def _ok_ai(score: int = 82, reasoning: str = "Bon profil.") -> object:
    async def _fake(profile, offer):
        return {"score": score, "reasoning": reasoning}

    return _fake


@pytest.mark.asyncio
async def test_new_active_offer_is_eligible_and_scores(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(82, "Solide."))
    try:
        out = await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    assert out == {"status": "completed", "score": 82}
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id,
                SavedRecommendation.offer_id == offer.id,
            )
        )
    ).scalar_one()
    assert row.status == "completed"
    assert row.ai_score == 82
    assert row.ai_reasoning == "Solide."
    assert row.candidate_id == user.id
    assert row.offer_id == offer.id
    assert row.created_at is not None and row.updated_at is not None


@pytest.mark.asyncio
async def test_inactive_offer_not_eligible(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id, active=False)
    assert await match_scoring.get_or_create_pending(db, user.id, offer.id) is None
    with pytest.raises(ValueError):
        await match_scoring.score_single_match(db, user.id, offer.id)


@pytest.mark.asyncio
async def test_initialization_and_all_offsets_cover_more_than_twenty_matches(
    db: AsyncSession,
) -> None:
    user = await _candidate(db, "many-matches@test.local")
    for index in range(27):
        await _offer(db, user.id, title=f"Role {index:02d}")

    created, active = await match_scoring.initialize_active_matches(db, user.id)
    assert (created, active) == (27, 27)
    assert await match_scoring.initialize_active_matches(db, user.id) == (0, 27)

    first, total = await match_scoring.list_active_matches(
        db, user.id, limit=20, offset=0
    )
    second, second_total = await match_scoring.list_active_matches(
        db, user.id, limit=20, offset=20
    )
    assert (len(first), len(second), total, second_total) == (20, 7, 27, 27)
    assert {row.offer_id for row in first}.isdisjoint(
        {row.offer_id for row in second}
    )

    new_offer = await _offer(db, user.id, title="Newly published role")
    # Listing is read-only; the new offer appears only after explicit init.
    before, before_total = await match_scoring.list_active_matches(
        db, user.id, limit=50, offset=0
    )
    assert before_total == len(before) == 27
    assert new_offer.id not in {row.offer_id for row in before}
    assert await match_scoring.initialize_active_matches(db, user.id) == (1, 28)
    after, after_total = await match_scoring.list_active_matches(
        db, user.id, limit=50, offset=0
    )
    assert after_total == len(after) == 28
    assert new_offer.id in {row.offer_id for row in after}


@pytest.mark.asyncio
async def test_concurrent_initializers_are_conflict_safe(tmp_path) -> None:
    db_path = tmp_path / "recommendation-concurrency.sqlite3"
    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_path}",
        connect_args={"timeout": 30},
    )
    async with engine.begin() as connection:
        await connection.run_sync(_Base.metadata.create_all)
    maker = async_sessionmaker(bind=engine, class_=AsyncSession, expire_on_commit=False)

    try:
        async with maker() as seed_db:
            user = await _candidate(seed_db, "concurrent-init@test.local")
            for index in range(25):
                await _offer(seed_db, user.id, title=f"Concurrent role {index:02d}")
            candidate_id = user.id

        async def initialize_once() -> tuple[int, int]:
            async with maker() as session:
                return await match_scoring.initialize_active_matches(
                    session, candidate_id
                )

        outcomes = await asyncio.gather(initialize_once(), initialize_once())
        assert sum(created for created, _active in outcomes) == 25
        assert {active for _created, active in outcomes} == {25}

        async with maker() as check_db:
            rows, total = await match_scoring.list_active_matches(
                check_db, candidate_id, limit=50, offset=0
            )
            assert total == len(rows) == 25
            assert len({row.offer_id for row in rows}) == 25
    finally:
        await engine.dispose()


@pytest.mark.asyncio
async def test_recommendation_api_returns_stored_score(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(71, "Convaincant."))
    try:
        await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    result = await db.execute(
        select(SavedRecommendation).where(
            SavedRecommendation.candidate_id == user.id,
            SavedRecommendation.offer_id == offer.id,
        )
    )
    out = RecommendationOut.model_validate(result.scalar_one())
    assert out.ai_score == 71
    assert out.status == "completed"
    assert out.offer.id == offer.id


@pytest.mark.asyncio
async def test_profile_change_invalidates_only_that_candidates_scores(db: AsyncSession) -> None:
    candidate = await _candidate(db, "profile-change@test.local")
    other_candidate = await _candidate(db, "other-profile@test.local")
    offer = await _offer(db, candidate.id)
    db.add_all(
        [
            SavedRecommendation(
                candidate_id=candidate.id,
                offer_id=offer.id,
                ai_score=84,
                ai_reasoning="Old profile score.",
                status="completed",
            ),
            SavedRecommendation(
                candidate_id=other_candidate.id,
                offer_id=offer.id,
                ai_score=73,
                ai_reasoning="Other candidate score.",
                status="completed",
            ),
        ]
    )
    await db.commit()

    await match_scoring.invalidate_candidate_matches(db, candidate.id)
    await db.commit()

    rows = (
        await db.execute(
            select(SavedRecommendation).where(SavedRecommendation.offer_id == offer.id)
        )
    ).scalars().all()
    mine = next(row for row in rows if row.candidate_id == candidate.id)
    other = next(row for row in rows if row.candidate_id == other_candidate.id)
    assert (mine.ai_score, mine.status, mine.error) == (0, "pending", None)
    assert mine.ai_reasoning == "Match analysis pending after profile update."
    assert (other.ai_score, other.status) == (73, "completed")


@pytest.mark.asyncio
async def test_completed_analysis_is_not_regenerated(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    db.add(
        SavedRecommendation(
            candidate_id=user.id,
            offer_id=offer.id,
            ai_score=77,
            ai_reasoning="Historique.",
            status="completed",
        )
    )
    await db.commit()

    async def _must_not_run(profile, offer):  # pragma: no cover
        raise AssertionError("AI must not be called for completed rows")

    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _must_not_run)
    try:
        out = await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    assert out == {"status": "completed", "score": 77}
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id
            )
        )
    ).scalar_one()
    assert row.ai_score == 77 and row.ai_reasoning == "Historique."


@pytest.mark.asyncio
async def test_ai_failure_uses_local_profile_fallback(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)

    async def _fail(profile, offer):
        return None

    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _fail)
    try:
        result = await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id
            )
        )
    ).scalar_one()
    assert result == {"status": "completed", "score": 50}
    assert row.status == "completed"
    assert row.ai_score == 50  # field + React skill
    assert "local estimate" in row.ai_reasoning.lower()
    assert row.error is None


@pytest.mark.asyncio
async def test_ai_exception_uses_fallback_without_leaking_secret(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)

    async def _boom(profile, offer):
        raise RuntimeError("provider key=sk-live-leaked exploded")

    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _boom)
    try:
        await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id
            )
        )
    ).scalar_one()
    assert row.status == "completed"
    assert row.error is None
    assert "sk-live-leaked" not in (row.ai_reasoning or "")


@pytest.mark.asyncio
async def test_retry_recovers_failed_analysis(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    db.add(
        SavedRecommendation(
            candidate_id=user.id,
            offer_id=offer.id,
            ai_score=0,
            ai_reasoning="Match analysis pending.",
            status="failed",
            error="AI scoring failed",
        )
    )
    await db.commit()
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(88, "Relance OK."))
    try:
        out = await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    assert out == {"status": "completed", "score": 88}
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id
            )
        )
    ).scalar_one()
    assert row.status == "completed" and row.error is None


@pytest.mark.asyncio
async def test_applying_does_not_break_analysis(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(90, "Top."))
    try:
        await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    # Candidate applies after scoring completed.
    db.add(Application(candidate_id=user.id, opportunity_id=offer.id, status="applied"))
    await db.commit()
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id,
                SavedRecommendation.offer_id == offer.id,
            )
        )
    ).scalar_one()
    app = (
        await db.execute(
            select(Application).where(Application.candidate_id == user.id)
        )
    ).scalar_one()
    assert row.status == "completed" and row.ai_score == 90
    assert app.status == "applied"


@pytest.mark.asyncio
async def test_candidate_isolation(db: AsyncSession) -> None:
    user_a = await _candidate(db, "a@test.local")
    user_b = await _candidate(db, "b@test.local")
    offer = await _offer(db, user_a.id)
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(80, "Pour A."))
    try:
        await match_scoring.score_single_match(db, user_a.id, offer.id)
    finally:
        monkey.undo()
    row_b = await match_scoring.get_or_create_pending(db, user_b.id, offer.id)
    assert row_b is not None and row_b.candidate_id == user_b.id
    assert row_b.ai_score == 0 and row_b.status == "pending"
    # A never sees B's row through a candidate-scoped read.
    leak = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user_a.id,
                SavedRecommendation.id == row_b.id,
            )
        )
    ).scalar_one_or_none()
    assert leak is None


@pytest.mark.asyncio
async def test_company_boundaries_preserved(db: AsyncSession) -> None:
    user = await _candidate(db)
    comp_a = Company(name="CompA")
    comp_b = Company(name="CompB")
    db.add_all([comp_a, comp_b])
    await db.commit()
    offer_a = await _offer(db, user.id, title="Role A", company_id=comp_a.id)
    offer_b = await _offer(db, user.id, title="Role B", company_id=comp_b.id)
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(60, "OK."))
    try:
        await match_scoring.score_single_match(db, user.id, offer_a.id)
    finally:
        monkey.undo()
    row_b = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id,
                SavedRecommendation.offer_id == offer_b.id,
            )
        )
    ).scalar_one_or_none()
    assert row_b is None  # scoring A never fabricates rows for company B
    assert offer_a.company_id != offer_b.company_id


@pytest.mark.asyncio
async def test_generate_run_does_not_wipe_active_scores(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    db.add(
        SavedRecommendation(
            candidate_id=user.id,
            offer_id=offer.id,
            ai_score=66,
            ai_reasoning="Actif.",
            status="completed",
        )
    )
    await db.commit()

    async def _no_match(profile, criteria, offers):
        return []

    monkey = pytest.MonkeyPatch()
    monkey.setattr(rec_jobs, "rank_offers", _no_match)
    try:
        existing = await rec_jobs.generate_recommendations_for_candidate(
            db,
            user.id,
            RecommendationRequest(
                field="NoSuchField", region="NoSuchRegion", type="JOB"
            ).model_dump(),
        )
    finally:
        monkey.undo()
    assert any(r["ai_score"] == 66 for r in existing)
    kept = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == user.id,
                SavedRecommendation.offer_id == offer.id,
            )
        )
    ).scalar_one_or_none()
    assert kept is not None and kept.ai_score == 66


@pytest.mark.asyncio
async def test_status_lifecycle_order(db: AsyncSession) -> None:
    user = await _candidate(db)
    offer = await _offer(db, user.id)
    row = await match_scoring.get_or_create_pending(db, user.id, offer.id)
    assert row is not None and row.status == "pending"
    monkey = pytest.MonkeyPatch()
    monkey.setattr(ai_module, "score_single_offer", _ok_ai(55, "Moyen."))
    try:
        await match_scoring.score_single_match(db, user.id, offer.id)
    finally:
        monkey.undo()
    assert row is not None
    await db.refresh(row)
    assert row.status == "completed"
    assert isinstance(row.created_at, datetime)
