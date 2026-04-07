import asyncio
import json
import re
from typing import Any

import google.generativeai as genai

from app.config import settings
from app.models import CandidateProfile, Offer
from app.schemas import RecommendationRequest


genai.configure(api_key=settings.gemini_api_key)
_model = genai.GenerativeModel("gemini-1.5-flash")

_FRENCH_HINT_PATTERN = re.compile(
    r"\b(le|la|les|de|des|pour|avec|et|dans|sur|une|un|du|au|aux|est|ce|cette|profil|offre|poste|correspond)\b",
    re.IGNORECASE,
)


def _is_probably_french(text: str) -> bool:
    if not text.strip():
        return False
    return bool(_FRENCH_HINT_PATTERN.search(text))


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
- Domaine d'études: {profile.field_of_study or 'Non spécifié'}
- Université: {profile.university or 'Non spécifiée'}
- Niveau d'études: {profile.study_level.value if profile.study_level else 'Non spécifié'}
- Ville: {profile.city or 'Non spécifiée'}

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
        response = await asyncio.to_thread(
            _model.generate_content,
            prompt,
            generation_config={"temperature": 0.2, "max_output_tokens": 1000},
        )
    except Exception:
        return []

    raw_text = (getattr(response, "text", "") or "").strip()
    if not raw_text:
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
        return []

    if not isinstance(parsed, list):
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

        score_value = max(0, min(100, score_value))
        cleaned_reasoning = reasoning.strip()
        if not cleaned_reasoning or not _is_probably_french(cleaned_reasoning):
            cleaned_reasoning = (
                "Cette offre correspond bien a votre profil et a vos criteres de recherche."
            )

        results.append(
            {
                "offer_id": offer_id,
                "score": score_value,
                "reasoning": cleaned_reasoning,
            }
        )

    return results
