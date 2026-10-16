"""Per-offer candidate match scoring with an explicit status lifecycle.

Lifecycle: pending -> processing -> completed | failed.

- GET /recommendations creates a pending row for each active offer that has
  no analysis yet (new jobs become eligible on Discover open).
- POST /recommendations/score/{offer_id} moves a pending/failed row to
  processing and queues this scorer (Celery when available, inline fallback).
- score_single_match() runs Gemini for exactly one candidate/offer pair and
  persists completed (score + reasoning). If the AI provider is unavailable,
  a deterministic profile/offer comparison is persisted instead so temporary
  provider quota failures do not make recommendations unusable.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import func, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import CandidateProfile, Offer, SavedRecommendation
from app.observability import get_logger

logger = get_logger("match")

TERMINAL_OK = "completed"
TERMINAL_FAIL = "failed"


def _recommendation_insert(db: AsyncSession):
    """Return an INSERT supporting ON CONFLICT for the active DB dialect."""
    if db.get_bind().dialect.name == "sqlite":
        return sqlite_insert(SavedRecommendation)
    return postgresql_insert(SavedRecommendation)


async def initialize_active_matches(
    db: AsyncSession,
    candidate_id: uuid.UUID,
) -> tuple[int, int]:
    """Create missing pending rows for every active offer, idempotently.

    The unique candidate/offer constraint is the concurrency boundary. Two
    initializers can race safely: each row is inserted at most once and neither
    request needs to infer existence from a paginated result set.
    """
    offer_ids = list(
        (
            await db.execute(
                select(Offer.id).where(Offer.active.is_(True)).order_by(Offer.id)
            )
        ).scalars()
    )
    if not offer_ids:
        return 0, 0

    now = datetime.utcnow()
    values = [
        {
            "id": uuid.uuid4(),
            "candidate_id": candidate_id,
            "offer_id": offer_id,
            "ai_score": 0,
            "ai_reasoning": "Match analysis pending.",
            "status": "pending",
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        for offer_id in offer_ids
    ]
    statement = (
        _recommendation_insert(db)
        .values(values)
        .on_conflict_do_nothing(index_elements=["candidate_id", "offer_id"])
        .returning(SavedRecommendation.id)
    )
    inserted = list((await db.execute(statement)).scalars())
    await db.commit()
    return len(inserted), len(offer_ids)


async def list_active_matches(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    *,
    limit: int,
    offset: int,
) -> tuple[list[SavedRecommendation], int]:
    """Read one stable page of active recommendations without side effects."""
    filters = (
        SavedRecommendation.candidate_id == candidate_id,
        Offer.active.is_(True),
    )
    total = int(
        (
            await db.execute(
                select(func.count(SavedRecommendation.id))
                .join(Offer, Offer.id == SavedRecommendation.offer_id)
                .where(*filters)
            )
        ).scalar_one()
    )
    result = await db.execute(
        select(SavedRecommendation)
        .join(Offer, Offer.id == SavedRecommendation.offer_id)
        .options(joinedload(SavedRecommendation.offer))
        .where(*filters)
        .order_by(
            SavedRecommendation.ai_score.desc(),
            Offer.posted_at.desc(),
            SavedRecommendation.id.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    return list(result.scalars().all()), total


async def upsert_recommendation_scores(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    rows: list[dict[str, Any]],
) -> None:
    """Persist validated scoring results with a conflict-safe batch upsert."""
    if not rows:
        return
    now = datetime.utcnow()
    values = [
        {
            "id": uuid.uuid4(),
            "candidate_id": candidate_id,
            "offer_id": row["offer_id"],
            "ai_score": row["score"],
            "ai_reasoning": row["reasoning"],
            "status": TERMINAL_OK,
            "error": None,
            "created_at": now,
            "updated_at": now,
        }
        for row in rows
    ]
    statement = _recommendation_insert(db).values(values)
    statement = statement.on_conflict_do_update(
        index_elements=["candidate_id", "offer_id"],
        set_={
            "ai_score": statement.excluded.ai_score,
            "ai_reasoning": statement.excluded.ai_reasoning,
            "status": statement.excluded.status,
            "error": None,
            "updated_at": statement.excluded.updated_at,
        },
    )
    await db.execute(statement)


async def invalidate_candidate_matches(
    db: AsyncSession,
    candidate_id: uuid.UUID,
) -> None:
    """Make this candidate's stored scores eligible for recalculation."""
    await db.execute(
        update(SavedRecommendation)
        .where(SavedRecommendation.candidate_id == candidate_id)
        .values(
            ai_score=0,
            ai_reasoning="Match analysis pending after profile update.",
            status="pending",
            error=None,
            updated_at=datetime.utcnow(),
        )
    )


def _safe_reason(exc: Exception) -> str:
    # Provider exception messages can echo prompts, credentials, and request
    # bodies. The exception class is enough for internal failure grouping.
    return f"{type(exc).__name__}: AI provider error"


def _normalized_terms(value: object) -> set[str]:
    """Return useful lowercase profile terms without external/API work."""
    if not value:
        return set()
    text = str(value).lower().replace(";", ",")
    return {part.strip() for part in text.split(",") if len(part.strip()) >= 2}


def _local_fallback_score(profile: CandidateProfile, offer: Offer) -> dict[str, Any]:
    """Produce a transparent, deterministic estimate when Gemini is unavailable."""
    searchable = " ".join(
        str(value or "").lower()
        for value in (offer.title, offer.field, offer.description, offer.requirements)
    )
    score = 0
    signals: list[str] = []

    field = str(profile.field_of_study or "").strip().lower()
    if field and (field in searchable or any(word in searchable for word in field.split())):
        score += 35
        signals.append("your study field")

    location = str(profile.city or "").strip().lower()
    offer_location = str(offer.region or "").strip().lower()
    if location and offer_location and (location in offer_location or offer_location in location):
        score += 20
        signals.append("your location")

    matched_skills = sorted(skill for skill in _normalized_terms(profile.skills) if skill in searchable)
    if matched_skills:
        score += min(45, len(matched_skills) * 15)
        signals.append("matching skills: " + ", ".join(matched_skills[:3]))

    score = min(100, score)
    if signals:
        detail = "Matches found for " + "; ".join(signals) + "."
    else:
        detail = "No clear profile-to-requirement matches were found."
    return {
        "score": score,
        "reasoning": (
            f"{detail} This is a local estimate because AI analysis is temporarily unavailable."
        ),
    }


async def get_or_create_pending(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    offer_id: uuid.UUID,
) -> SavedRecommendation | None:
    """Return the candidate's row for an active offer, creating pending if absent.

    Returns None when the offer does not exist or is inactive (not eligible).
    Enforces candidate ownership: only rows with this candidate_id are read.
    """
    offer = (
        await db.execute(select(Offer).where(Offer.id == offer_id))
    ).scalar_one_or_none()
    if offer is None or not offer.active:
        return None
    now = datetime.utcnow()
    statement = (
        _recommendation_insert(db)
        .values(
            id=uuid.uuid4(),
            candidate_id=candidate_id,
            offer_id=offer_id,
            ai_score=0,
            ai_reasoning="Match analysis pending.",
            status="pending",
            error=None,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["candidate_id", "offer_id"])
    )
    await db.execute(statement)
    await db.commit()
    row = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == candidate_id,
                SavedRecommendation.offer_id == offer_id,
            )
        )
    ).scalar_one()
    logger.info(f"[MATCH] requested candidate={candidate_id} offer={offer_id}")
    return row


async def score_single_match(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    offer_id: uuid.UUID,
    *,
    commit: bool = True,
) -> dict[str, Any]:
    """Run scoring for one pair, with a deterministic provider-outage fallback."""
    logger.info(f"[MATCH] requested candidate={candidate_id} offer={offer_id}")
    row_result = await db.execute(
        select(SavedRecommendation).where(
            SavedRecommendation.candidate_id == candidate_id,
            SavedRecommendation.offer_id == offer_id,
        )
    )
    row = row_result.scalar_one_or_none()
    if row is None:
        if not commit:
            raise ValueError("Pending recommendation row not found")
        row = await get_or_create_pending(db, candidate_id, offer_id)
        if row is None:
            raise ValueError("Offer not found or inactive")
    elif row.status == TERMINAL_OK:
        # Existing completed analysis is authoritative — do not regenerate.
        logger.info(
            f"[MATCH] completed candidate={candidate_id} offer={offer_id} cached"
        )
        return {"status": TERMINAL_OK, "score": row.ai_score}

    offer = (
        await db.execute(select(Offer).where(Offer.id == offer_id))
    ).scalar_one_or_none()
    if offer is None or not offer.active:
        row.status = TERMINAL_FAIL
        row.error = "Offer not found or inactive"
        row.updated_at = datetime.utcnow()
        if commit:
            await db.commit()
        else:
            await db.flush()
        logger.error(
            f"[MATCH] failed candidate={candidate_id} offer={offer_id} reason=inactive_offer"
        )
        raise ValueError("Offer not found or inactive")

    profile = (
        await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        row.status = TERMINAL_FAIL
        row.error = "Candidate profile not found"
        row.updated_at = datetime.utcnow()
        if commit:
            await db.commit()
        else:
            await db.flush()
        logger.error(
            f"[MATCH] failed candidate={candidate_id} offer={offer_id} reason=missing_profile"
        )
        raise ValueError("Candidate profile not found")

    row.status = "processing"
    row.error = None
    row.updated_at = datetime.utcnow()
    if commit:
        await db.commit()
    else:
        await db.flush()
    logger.info(f"[MATCH] processing candidate={candidate_id} offer={offer_id}")

    provider_error: Exception | None = None
    try:
        from app.services.ai import score_single_offer

        outcome = await score_single_offer(profile, offer)
    except Exception as exc:
        provider_error = exc
        outcome = None

    await db.refresh(row)
    if outcome is None:
        outcome = _local_fallback_score(profile, offer)
        safe_reason = _safe_reason(provider_error) if provider_error else "AI scoring unavailable"
        logger.warning(
            f"[MATCH] fallback candidate={candidate_id} offer={offer_id} reason={safe_reason}"
        )

    row.ai_score = int(outcome["score"])
    row.ai_reasoning = str(outcome["reasoning"])
    row.status = TERMINAL_OK
    row.error = None
    row.updated_at = datetime.utcnow()
    if commit:
        await db.commit()
    else:
        await db.flush()
    logger.info(
        f"[MATCH] persisted score={row.ai_score} candidate={candidate_id} offer={offer_id}"
    )
    logger.info(f"[MATCH] completed candidate={candidate_id} offer={offer_id}")
    return {"status": TERMINAL_OK, "score": row.ai_score}
