"""Per-offer candidate match scoring with an explicit status lifecycle.

Lifecycle: pending -> processing -> completed | failed.

- GET /recommendations creates a pending row for each active offer that has
  no analysis yet (new jobs become eligible on Discover open).
- POST /recommendations/score/{offer_id} moves a pending/failed row to
  processing and queues this scorer (Celery when available, inline fallback).
- score_single_match() runs Gemini for exactly one candidate/offer pair and
  persists completed (score + reasoning) or failed (safe reason, no fake
  score). Applying to a job never touches this table.
"""
from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CandidateProfile, Offer, SavedRecommendation
from app.observability import get_logger

logger = get_logger("match")

TERMINAL_OK = "completed"
TERMINAL_FAIL = "failed"


def _safe_reason(exc: Exception) -> str:
    name = type(exc).__name__
    msg = str(exc)[:200].strip()
    # Never persist secrets/PII blobs — keep a short, safe reason.
    for secret_hint in ("key", "token", "bearer", "password", "secret"):
        if secret_hint in msg.lower():
            return f"{name}: AI provider error"
    return f"{name}: {msg}" if msg else f"{name}: AI scoring failed"


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
    """Run scoring for one pair through the full lifecycle. Never fakes a score."""
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

    try:
        from app.services.ai import score_single_offer

        outcome = await score_single_offer(profile, offer)
    except Exception as exc:  # never let AI exceptions bubble as pending
        await db.refresh(row)
        row.status = TERMINAL_FAIL
        row.error = _safe_reason(exc)
        row.updated_at = datetime.utcnow()
        await db.commit()
        logger.error(
            f"[MATCH] failed candidate={candidate_id} offer={offer_id} reason={row.error}"
        )
        raise ValueError(row.error) from exc

    await db.refresh(row)
    if outcome is None:
        row.status = TERMINAL_FAIL
        row.error = "AI scoring failed"
        row.updated_at = datetime.utcnow()
        await db.commit()
        logger.error(
            f"[MATCH] failed candidate={candidate_id} offer={offer_id} reason=ai_scoring_failed"
        )
        raise ValueError("AI scoring failed")

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
