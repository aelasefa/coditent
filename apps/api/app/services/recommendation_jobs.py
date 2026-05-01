from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from app.models import CandidateProfile, Offer, OfferType, SavedRecommendation
from app.schemas import RecommendationOut, RecommendationRequest
from app.services.ai import rank_offers


def make_cache_key(candidate_id: uuid.UUID, criteria: dict[str, Any]) -> str:
    normalized = json.dumps(criteria, sort_keys=True, separators=(",", ":"))
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"recommendations:{candidate_id}:{digest}"


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


async def generate_recommendations_for_candidate(
    db: AsyncSession,
    candidate_id: uuid.UUID,
    criteria: dict[str, Any],
) -> list[dict[str, Any]]:
    criteria_obj = RecommendationRequest(**criteria)

    profile_result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
    )
    profile = profile_result.scalar_one_or_none()
    if profile is None:
        raise ValueError("Candidate profile not found")

    offers_result = await db.execute(
        select(Offer)
        .where(Offer.active.is_(True))
        .where(Offer.type == OfferType(criteria_obj.type))
        .where(Offer.field.ilike(f"%{criteria_obj.field}%"))
        .where(Offer.region.ilike(f"%{criteria_obj.region}%"))
        .limit(30)
    )
    offers = offers_result.scalars().all()

    if not offers:
        await db.execute(delete(SavedRecommendation).where(SavedRecommendation.candidate_id == candidate_id))
        await db.commit()
        return []

    ai_results = await rank_offers(profile, criteria_obj, offers)
    if not ai_results:
        ai_results = _fallback_rank_offers(profile, offers)

    await db.execute(delete(SavedRecommendation).where(SavedRecommendation.candidate_id == candidate_id))

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
                candidate_id=candidate_id,
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
        .where(SavedRecommendation.candidate_id == candidate_id)
        .order_by(SavedRecommendation.ai_score.desc())
    )
    recommendations = recommendations_result.scalars().all()

    return [RecommendationOut.model_validate(item).model_dump() for item in recommendations]
