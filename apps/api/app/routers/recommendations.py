import json
import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.cache import get_async_redis
from app.database import get_db
from app.dependencies import get_pagination, require_candidate
from app.models import Offer, SavedRecommendation, User
from app.schemas import RecommendationOut, RecommendationRequest
from app.services.recommendation_jobs import make_cache_key
from app.tasks import generate_recommendations_task


router = APIRouter()


@router.post("/generate", response_model=dict[str, str | bool])
async def generate_recommendations(
    criteria: RecommendationRequest,
    current_user: Annotated[User, Depends(require_candidate)],
) -> dict[str, str | bool]:
    redis_client = get_async_redis()
    criteria_payload = criteria.model_dump()
    cache_key = make_cache_key(current_user.id, criteria_payload)
    cached = await redis_client.get(cache_key)

    job_id = str(uuid.uuid4())
    job_key = f"job:{job_id}"

    if cached:
        await redis_client.set(
            job_key,
            json.dumps(
                {
                    "status": "completed",
                    "candidate_id": str(current_user.id),
                    "criteria": criteria_payload,
                    "result": json.loads(cached),
                }
            ),
            ex=3600,
        )
        return {"job_id": job_id, "status": "completed", "cached": True}

    await redis_client.set(
        job_key,
        json.dumps(
            {
                "status": "pending",
                "candidate_id": str(current_user.id),
                "criteria": criteria_payload,
            }
        ),
        ex=3600,
    )

    generate_recommendations_task.delay(job_id, str(current_user.id), criteria_payload)
    return {"job_id": job_id, "status": "pending", "cached": False}


@router.get("/jobs/{job_id}")
async def get_recommendation_job_status(
    job_id: str,
    current_user: Annotated[User, Depends(require_candidate)],
) -> dict:
    redis_client = get_async_redis()
    payload = await redis_client.get(f"job:{job_id}")
    if not payload:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    data = json.loads(payload)
    if data.get("candidate_id") != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return data


@router.get("", response_model=dict[str, list[RecommendationOut]])
async def get_recommendations(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> dict[str, list[RecommendationOut]]:
    limit, offset = pagination
    result = await db.execute(
        select(SavedRecommendation)
        .options(joinedload(SavedRecommendation.offer))
        .where(SavedRecommendation.candidate_id == current_user.id)
        .order_by(SavedRecommendation.ai_score.desc())
        .limit(limit)
        .offset(offset)
    )
    recommendations = result.scalars().all()

    active_offers_result = await db.execute(select(Offer).where(Offer.active.is_(True)))
    active_offers = active_offers_result.scalars().all()

    existing_offer_ids = {
        recommendation.offer_id for recommendation in recommendations if recommendation.offer is not None
    }
    missing_offers = [offer for offer in active_offers if offer.id not in existing_offer_ids]

    if missing_offers:
        db.add_all(
            [
                SavedRecommendation(
                    candidate_id=current_user.id,
                    offer_id=offer.id,
                    ai_score=0,
                    ai_reasoning="Nouvelle offre ajoutee en attente du scoring IA.",
                )
                for offer in missing_offers
            ]
        )
        await db.commit()

        result = await db.execute(
            select(SavedRecommendation)
            .options(joinedload(SavedRecommendation.offer))
            .where(SavedRecommendation.candidate_id == current_user.id)
            .order_by(SavedRecommendation.ai_score.desc())
            .limit(limit)
            .offset(offset)
        )
        recommendations = result.scalars().all()

    return {
        "recommendations": [
            RecommendationOut.model_validate(recommendation)
            for recommendation in recommendations
        ]
    }
