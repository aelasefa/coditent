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


def _fallback_rank_offers(
    profile: CandidateProfile,
    offers: list[Offer],
) -> list[dict[str, str | int]]:
    field_hint = (profile.field_of_study or "").strip().lower()
    city_hint = (profile.city or "").strip().lower()
    skills_hint = {
        skill.strip().lower()
        for skill in (profile.skills or "").split(",")
        if skill.strip()
    }

    ranked_rows: list[dict[str, str | int]] = []
    for offer in offers:
        score = 50

        offer_field = (offer.field or "").lower()
        offer_region = (offer.region or "").lower()

        if field_hint and field_hint in offer_field:
            score += 25
        if city_hint and city_hint in offer_region:
            score += 20

        requirements_text = f"{offer.requirements or ''} {offer.description or ''}".lower()
        skill_hits = sum(
            1
            for skill in skills_hint
            if len(skill) > 2 and skill in requirements_text
        )
        if skill_hits:
            score += min(skill_hits * 6, 18)

        ranked_rows.append(
            {
                "offer_id": str(offer.id),
                "score": min(score, 100),
                "reasoning": "Classement de secours applique car le scoring IA est indisponible.",
            }
        )

    ranked_rows.sort(key=lambda row: int(row["score"]), reverse=True)
    return ranked_rows[:10]


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
    if not ai_results:
        ai_results = _fallback_rank_offers(profile, offers)

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
        )
        recommendations = result.scalars().all()

    return {
        "recommendations": [
            RecommendationOut.model_validate(recommendation)
            for recommendation in recommendations
        ]
    }
