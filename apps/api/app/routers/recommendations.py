import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.database import get_db
from app.dependencies import require_candidate
from app.models import CandidateProfile, Offer, OfferType, SavedRecommendation, User
from app.schemas import RecommendationOut, RecommendationRequest
from app.services.ai import rank_offers


router = APIRouter()


@router.post("/generate", response_model=dict[str, list[RecommendationOut]])
async def generate_recommendations(
    criteria: RecommendationRequest,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[RecommendationOut]]:
    profile_result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Candidate profile not found",
        )

    offers_result = await db.execute(
        select(Offer)
        .where(Offer.active.is_(True))
        .where(Offer.type == OfferType(criteria.type))
        .where(Offer.field.ilike(f"%{criteria.field}%"))
        .where(Offer.region.ilike(f"%{criteria.region}%"))
        .limit(30)
    )
    offers = offers_result.scalars().all()

    if not offers:
        await db.execute(
            delete(SavedRecommendation).where(SavedRecommendation.candidate_id == current_user.id)
        )
        await db.commit()
        return {"recommendations": []}

    ai_results = await rank_offers(profile, criteria, offers)

    await db.execute(
        delete(SavedRecommendation).where(SavedRecommendation.candidate_id == current_user.id)
    )

    offer_map = {str(offer.id): offer for offer in offers}
    new_rows: list[SavedRecommendation] = []
    for row in ai_results:
        offer_id = row.get("offer_id")
        if offer_id not in offer_map:
            continue

        try:
            parsed_offer_id = uuid.UUID(offer_id)
        except (TypeError, ValueError):
            continue

        new_rows.append(
            SavedRecommendation(
                candidate_id=current_user.id,
                offer_id=parsed_offer_id,
                ai_score=int(row.get("score", 0)),
                ai_reasoning=str(row.get("reasoning", "")),
            )
        )

    if new_rows:
        db.add_all(new_rows)

    await db.commit()

    recommendations_result = await db.execute(
        select(SavedRecommendation)
        .options(joinedload(SavedRecommendation.offer))
        .where(SavedRecommendation.candidate_id == current_user.id)
        .order_by(SavedRecommendation.ai_score.desc())
    )
    recommendations = recommendations_result.scalars().all()

    return {
        "recommendations": [
            RecommendationOut.model_validate(recommendation)
            for recommendation in recommendations
        ]
    }


@router.get("", response_model=dict[str, list[RecommendationOut]])
async def get_recommendations(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[RecommendationOut]]:
    result = await db.execute(
        select(SavedRecommendation)
        .options(joinedload(SavedRecommendation.offer))
        .where(SavedRecommendation.candidate_id == current_user.id)
        .order_by(SavedRecommendation.ai_score.desc())
    )
    recommendations = result.scalars().all()

    return {
        "recommendations": [
            RecommendationOut.model_validate(recommendation)
            for recommendation in recommendations
        ]
    }
