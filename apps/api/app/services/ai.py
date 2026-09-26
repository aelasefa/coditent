import asyncio
import json
from typing import Any

import google.generativeai as genai

from app.config import settings
from app.models import CandidateProfile, Offer
from app.observability import get_logger
from app.schemas import RecommendationRequest


genai.configure(api_key=settings.gemini_api_key)
_model = genai.GenerativeModel("gemini-3-flash-preview")
logger = get_logger("ai")

GENERATION_TIMEOUT_SECONDS = 120


def _clean_json_text(raw_text: str) -> str:
    cleaned = (raw_text or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[len("```json"):].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()
    return cleaned


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

Profil candidat:
- Titre professionnel: {profile.headline or 'Non spécifié'}
- Domaine d'études: {profile.field_of_study or 'Non spécifié'}
- Université: {profile.university or 'Non spécifiée'}
- Niveau d'études: {profile.study_level.value if profile.study_level else 'Non spécifié'}
- Ville: {profile.city or 'Non spécifiée'}
- Compétences clés: {profile.skills or 'Non spécifiées'}
- Années d'expérience: {profile.years_of_experience if profile.years_of_experience is not None else 'Non spécifiées'}
- Résumé: {(profile.bio or 'Non spécifié')[:300]}

Offre:
- Titre: {offer.title}
- Entreprise: {offer.company}
- Région: {offer.region}
- Domaine: {offer.field}
- Type: {offer.type.value if offer.type else 'Non spécifié'}
- Description: {(offer.description or '')[:800]}
- Exigences: {(offer.requirements or '')[:800]}

Retourne: {{"score": 0-100, "reasoning": "Une phrase en français."}}
"""
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                _model.generate_content,
                prompt,
                generation_config={
                    "temperature": 0.2,
                    "max_output_tokens": 600,
                    "response_mime_type": "application/json",
                },
            ),
            timeout=GENERATION_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        match_logger.error("[MATCH] AI request failed", reason="generation_error")
        logger.error("ai_request_failed", reason="generation_error", error=str(exc)[:300])
        return None

    raw_text = (getattr(response, "text", "") or "").strip()
    if not raw_text:
        match_logger.error("[MATCH] AI request failed", reason="empty_response")
        logger.error("ai_request_failed", reason="empty_response")
        return None

    def _try_parse(text: str) -> dict | None:
        try:
            # strict=False tolerates literal newlines/control chars the model
            # sometimes emits inside the reasoning string.
            parsed = json.loads(text, strict=False)
        except Exception:
            return None
        return parsed if isinstance(parsed, dict) else None

    parsed = _try_parse(_clean_json_text(raw_text))
    if parsed is None:
        # Model sometimes wraps the object in prose: extract the largest
        # {...} span and try once more before giving up (same as screening).
        import re as _re

        match = _re.search(r"\{.*\}", raw_text, _re.DOTALL)
        if match:
            parsed = _try_parse(match.group(0))
    if not isinstance(parsed, dict):
        match_logger.error("[MATCH] AI request failed", reason="invalid_json")
        logger.error(
            "ai_request_failed",
            reason="invalid_json",
            preview=raw_text[:200],
        )
        return None
    try:
        score_value = int(parsed.get("score"))
    except (TypeError, ValueError):
        match_logger.error("[MATCH] AI request failed", reason="unparseable_score")
        return None
    reasoning = parsed.get("reasoning")
    if not isinstance(reasoning, str) or not reasoning.strip():
        match_logger.error("[MATCH] AI request failed", reason="missing_reasoning")
        return None
    if not 0 <= score_value <= 100:
        match_logger.error("[MATCH] AI request failed", reason="score_out_of_range")
        return None
    match_logger.info("[MATCH] AI request completed")
    return {"score": score_value, "reasoning": reasoning.strip()[:1000]}


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

Profil candidat:
- Titre professionnel: {profile.headline or 'Non spécifié'}
- Domaine d'études: {profile.field_of_study or 'Non spécifié'}
- Université: {profile.university or 'Non spécifiée'}
- Niveau d'études: {profile.study_level.value if profile.study_level else 'Non spécifié'}
- Ville: {profile.city or 'Non spécifiée'}
- Compétences clés: {profile.skills or 'Non spécifiées'}
- Années d'expérience: {profile.years_of_experience if profile.years_of_experience is not None else 'Non spécifiées'}
- Résumé: {(profile.bio or 'Non spécifié')[:300]}

Critères de recherche:
- Domaine: {criteria.field}
- Région: {criteria.region}
- Type: {criteria.type}

Offres à classer:
{json.dumps(offers_data, ensure_ascii=False, indent=2)}

Retourne un tableau JSON de 10 éléments maximum, du plus pertinent au moins:
[{{"offer_id": "uuid", "score": 85, "reasoning": "Une phrase en français."}}]
"""

    try:
        logger.info("ai_request_started", offers=len(offers))
        response = await asyncio.to_thread(
            _model.generate_content,
            prompt,
            generation_config={"temperature": 0.2, "max_output_tokens": 1000},
        )
    except Exception as exc:
        logger.error("ai_request_failed", reason="generation_error", error=str(exc)[:500])
        return []

    raw_text = (getattr(response, "text", "") or "").strip()
    if not raw_text:
        logger.error("ai_request_failed", reason="empty_response")
        return []

    cleaned = raw_text.strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[len("```json") :].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()

    try:
        parsed = json.loads(cleaned)
    except Exception:
        logger.error("ai_request_failed", reason="invalid_json")
        return []

    if not isinstance(parsed, list):
        logger.error("ai_request_failed", reason="unexpected_payload")
        return []

    results: list[dict[str, Any]] = []
    for item in parsed[:10]:
        if not isinstance(item, dict):
            continue

        offer_id = item.get("offer_id")
        score = item.get("score")
        reasoning = item.get("reasoning")

        try:
            score_value = int(score)
        except (TypeError, ValueError):
            continue

        if not isinstance(offer_id, str) or not isinstance(reasoning, str):
            continue

        results.append(
            {
                "offer_id": offer_id,
                "score": score_value,
                "reasoning": reasoning,
            }
        )

    return results
