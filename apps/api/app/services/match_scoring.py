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

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CandidateProfile, Offer, SavedRecommendation
from app.observability import get_logger

logger = get_logger("match")

TERMINAL_OK = "completed"
TERMINAL_FAIL = "failed"


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
    existing = (
        await db.execute(
            select(SavedRecommendation).where(
                SavedRecommendation.candidate_id == candidate_id,
                SavedRecommendation.offer_id == offer_id,
            )
        )
    ).scalar_one_or_none()
    if existing is not None:
        if existing.candidate_id != candidate_id:
            return None
        return existing
    row = SavedRecommendation(
        candidate_id=candidate_id,
        offer_id=offer_id,
        ai_score=0,
        ai_reasoning="Match analysis pending.",
        status="pending",
    )
    db.add(row)
    await db.commit()
    await db.refresh(row)
    logger.info(f"[MATCH] requested candidate={candidate_id} offer={offer_id}")
    return row


async def score_single_match(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    offer_id: uuid.UUID,
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
        await db.commit()
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
        await db.commit()
        logger.error(
            f"[MATCH] failed candidate={candidate_id} offer={offer_id} reason=missing_profile"
        )
        raise ValueError("Candidate profile not found")

    row.status = "processing"
    row.error = None
    row.updated_at = datetime.utcnow()
    await db.commit()
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
    await db.commit()
    logger.info(
        f"[MATCH] persisted score={row.ai_score} candidate={candidate_id} offer={offer_id}"
    )
    logger.info(f"[MATCH] completed candidate={candidate_id} offer={offer_id}")
    return {"status": TERMINAL_OK, "score": row.ai_score}
