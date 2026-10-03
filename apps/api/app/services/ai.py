from typing import Any

from app.models import CandidateProfile, Offer
from app.observability import get_logger
from app.schemas import RecommendationRequest
from app.services.ai_contracts import (
    parse_ranked_offers,
    parse_score_result,
    untrusted_prompt_data,
)
from app.services.gemini import generate_text

logger = get_logger("ai")

async def score_single_offer(
    profile: CandidateProfile,
    offer: Offer,
) -> dict[str, Any] | None:
    """Score one candidate/offer pair. Returns {score, reasoning} or None.

    None means the AI run failed or returned an unusable payload — the caller
    must record FAILED, never a fake score.
    """
    from app.observability import get_logger as _get_logger

    match_logger = _get_logger("match")
    match_logger.info("[MATCH] AI request started")
    prompt = f"""
Tu es un assistant de matching d'emploi pour le marché marocain.
Evalue l'adéquation entre ce profil candidat et cette offre.
Retourne UNIQUEMENT un objet JSON valide. Aucun texte en dehors de l'objet.
Retourne: {{"score": 0-100, "reasoning": "Une phrase en français."}}

{untrusted_prompt_data({
    "profile": {
        "headline": profile.headline,
        "field_of_study": profile.field_of_study,
        "university": profile.university,
        "study_level": profile.study_level.value if profile.study_level else None,
        "city": profile.city,
        "skills": profile.skills,
        "years_of_experience": profile.years_of_experience,
        "bio": profile.bio,
    },
    "offer": {
        "id": str(offer.id),
        "title": offer.title,
        "company": offer.company,
        "region": offer.region,
        "field": offer.field,
        "type": offer.type.value if offer.type else None,
        "description": offer.description,
        "requirements": offer.requirements,
    },
})}
"""
    try:
        raw_text, _ = await generate_text(
            prompt,
            temperature=0.2,
            max_output_tokens=600,
            response_mime_type="application/json",
        )
    except Exception as exc:
        match_logger.error("[MATCH] AI request failed", reason="generation_error")
        logger.error(
            "ai_request_failed",
            reason="generation_error",
            exception_type=type(exc).__name__,
        )
        return None

    try:
        parsed = parse_score_result(raw_text)
    except ValueError:
        match_logger.error("[MATCH] AI request failed", reason="invalid_schema")
        logger.error("ai_request_failed", reason="invalid_schema")
        return None
    match_logger.info("[MATCH] AI request completed")
    return parsed.model_dump()


async def rank_offers(
    profile: CandidateProfile,
    criteria: RecommendationRequest,
    offers: list[Offer],
) -> list[dict[str, Any]]:
    if not offers:
        return []

    offers_data = [
        {
            "offer_id": str(offer.id),
            "title": offer.title,
            "company": offer.company,
            "region": offer.region,
            "field": offer.field,
            "type": offer.type.value,
            "requirements": offer.requirements,
        }
        for offer in offers
    ]

    prompt = f"""
Tu es un assistant de matching d'emploi pour le marché marocain.
On te donne un profil candidat et une liste d'offres d'emploi.
Classe les offres de la plus pertinente à la moins pertinente.
Retourne UNIQUEMENT un tableau JSON valide. Aucun texte en dehors du tableau.
Retourne un tableau JSON de 10 éléments maximum, du plus pertinent au moins:
[{{"offer_id": "uuid", "score": 85, "reasoning": "Une phrase en français."}}]

{untrusted_prompt_data({
    "profile": {
        "headline": profile.headline,
        "field_of_study": profile.field_of_study,
        "university": profile.university,
        "study_level": profile.study_level.value if profile.study_level else None,
        "city": profile.city,
        "skills": profile.skills,
        "years_of_experience": profile.years_of_experience,
        "bio": profile.bio,
    },
    "criteria": criteria.model_dump(),
    "offers": offers_data,
})}
"""

    try:
        logger.info("ai_request_started", offers=len(offers))
        raw_text, _ = await generate_text(
            prompt,
            temperature=0.2,
            max_output_tokens=1000,
            response_mime_type="application/json",
        )
    except Exception as exc:
        logger.error(
            "ai_request_failed",
            reason="generation_error",
            exception_type=type(exc).__name__,
        )
        return []

    try:
        parsed = parse_ranked_offers(
            raw_text,
            allowed_offer_ids={offer.id for offer in offers},
        )
    except ValueError:
        logger.error("ai_request_failed", reason="invalid_schema")
        return []
    return [row.model_dump(mode="json") for row in parsed]
