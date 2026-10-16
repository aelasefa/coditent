import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.cache import get_async_redis
from app.database import get_db
from app.dependencies import get_pagination, require_candidate_account
from app.models import AIJob, Company, Offer, SavedRecommendation, User
from app.observability import get_logger
from app.schemas import (
    RecommendationInitialization,
    RecommendationOut,
    RecommendationPage,
    RecommendationRequest,
)
from app.services.match_scoring import initialize_active_matches, list_active_matches
from app.services.ai_jobs import (
    AIQueueFullError,
    enqueue_ai_job,
    match_source_fingerprint,
    recommendation_source_fingerprint,
)

logger = get_logger("match")

router = APIRouter()


@router.post("/generate", response_model=dict[str, str | bool])
async def generate_recommendations(
    criteria: RecommendationRequest,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, str | bool]:
    criteria_payload = criteria.model_dump()
    source_fingerprint = await recommendation_source_fingerprint(
        db, current_user.id, criteria_payload
    )
    if source_fingerprint is None:
        raise HTTPException(status_code=409, detail="Candidate profile is required")
    try:
        job = await enqueue_ai_job(
            db,
            kind="recommendation_rank",
            actor_id=current_user.id,
            company_id=None,
            resource_id=current_user.id,
            payload={"criteria": criteria_payload},
            source_fingerprint=source_fingerprint,
            reset_failed=True,
        )
    except AIQueueFullError as exc:
        raise HTTPException(status_code=503, detail="Recommendation queue is full; retry later") from exc
    await db.commit()
    return {
        "job_id": str(job.id),
        "status": job.status,
        "cached": job.status == "completed",
    }


@router.post("/score/{offer_id}", response_model=dict)
async def score_recommendation(
    offer_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Trigger (or retry) AI match scoring for one offer.

    Idempotent: a completed analysis is returned as-is and never regenerated.
    A pending/failed analysis moves to processing and is queued. Applying to
    the job does not affect this flow.
    """
    from app.services.match_scoring import get_or_create_pending

    logger.info(f"[MATCH] requested candidate={current_user.id} offer={offer_id}")
    row = await get_or_create_pending(db, current_user.id, offer_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    if row.candidate_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if row.status == "completed":
        return {"offer_id": str(offer_id), "status": "completed", "score": row.ai_score}
    if row.status == "processing":
        return {"offer_id": str(offer_id), "status": "processing"}

    source_fingerprint = await match_source_fingerprint(db, current_user.id, offer_id)
    offer = (await db.execute(select(Offer).where(Offer.id == offer_id))).scalar_one()
    if source_fingerprint is None:
        raise HTTPException(status_code=409, detail="Profile is required before scoring")
    try:
        job = await enqueue_ai_job(
            db,
            kind="match_score",
            actor_id=current_user.id,
            company_id=offer.company_id,
            resource_id=offer_id,
            payload={"candidate_id": str(current_user.id), "offer_id": str(offer_id)},
            source_fingerprint=source_fingerprint,
            reset_failed=True,
        )
    except AIQueueFullError as exc:
        raise HTTPException(status_code=503, detail="Scoring queue is full; retry later") from exc
    row.status = "pending"
    row.error = None
    await db.commit()
    logger.info(f"[MATCH] queued candidate={current_user.id} offer={offer_id}")
    return {"offer_id": str(offer_id), "status": job.status, "job_id": str(job.id)}


async def _attach_offer_logos(
    db: AsyncSession, recommendations: list[SavedRecommendation]
) -> None:
    """Denormalize company logos onto loaded offers (batch, no N+1).

    Sets a transient ``company_logo_url`` attribute read by ``OfferOut``
    via ``from_attributes``. Nothing is persisted.
    """
    company_ids = {
        rec.offer.company_id
        for rec in recommendations
        if rec.offer is not None and rec.offer.company_id is not None
    }
    if not company_ids:
        return
    result = await db.execute(
        select(Company.id, Company.logo_url).where(Company.id.in_(company_ids))
    )
    logos = {str(cid): logo for cid, logo in result.all()}
    for rec in recommendations:
        if rec.offer is not None and rec.offer.company_id is not None:
            rec.offer.company_logo_url = logos.get(str(rec.offer.company_id))


@router.get("/by-offer/{offer_id}", response_model=RecommendationOut)
async def get_recommendation_by_offer(
    offer_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecommendationOut:
    """Fetch this candidate's own analysis for one offer (tenant-safe)."""
    result = await db.execute(
        select(SavedRecommendation)
        .options(joinedload(SavedRecommendation.offer))
        .where(
            SavedRecommendation.candidate_id == current_user.id,
            SavedRecommendation.offer_id == offer_id,
        )
    )
    row = result.scalars().first()
    if row is None or row.offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Analysis not found")
    await _attach_offer_logos(db, [row])
    return RecommendationOut.model_validate(row)


@router.get("/config-status", response_model=dict)
async def match_config_status(
    current_user: Annotated[User, Depends(require_candidate_account)],
) -> dict:
    """Runtime availability of the match pipeline. Never exposes secret values."""
    from app.config import settings

    redis_ok = False
    try:
        client = get_async_redis()
        await client.ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {
        "gemini_configured": bool(settings.gemini_api_key),
        "redis_reachable": redis_ok,
        "database_configured": bool(settings.database_url),
    }


@router.get("/jobs/{job_id}")
async def get_recommendation_job_status(
    job_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    job = (await db.execute(select(AIJob).where(AIJob.id == job_id))).scalar_one_or_none()
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    if job.actor_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    response: dict[str, object] = {
        "job_id": str(job.id),
        "status": job.status,
        "attempts": job.attempts,
        "max_attempts": job.max_attempts,
        "error_code": job.last_error_code,
        "retry_at": job.available_at.isoformat() if job.status == "pending" else None,
    }
    if job.status == "completed" and job.result:
        import json

        response["result"] = json.loads(job.result)
    return response


@router.post("/initialize", response_model=RecommendationInitialization)
async def initialize_recommendations(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecommendationInitialization:
    """Idempotently expose every active offer to this candidate's discovery feed."""
    created, active_offers = await initialize_active_matches(db, current_user.id)
    return RecommendationInitialization(created=created, active_offers=active_offers)


@router.get("", response_model=RecommendationPage)
async def get_recommendations(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> RecommendationPage:
    """Return a read-only stable page; initialization is an explicit POST."""
    limit, offset = pagination
    recommendations, total = await list_active_matches(
        db,
        current_user.id,
        limit=limit,
        offset=offset,
    )
    await _attach_offer_logos(db, list(recommendations))
    return RecommendationPage(
        recommendations=[
            RecommendationOut.model_validate(recommendation)
            for recommendation in recommendations
        ],
        total=total,
        limit=limit,
        offset=offset,
        has_more=offset + len(recommendations) < total,
    )
