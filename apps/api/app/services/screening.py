"""Recruiter-side AI screening for job applications.

Pipeline: application created -> screening queued -> profile + CV text +
offer requirements collected -> Gemini scores -> ai_score/ai_report persisted
with ai_status completed. Any failure path records ai_status failed so the
recruiter UI shows retry instead of infinite pending. Never invents scores:
unparseable model output is a failure, not a zero.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any
from uuid import UUID

import google.generativeai as genai
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import settings
from app.models import Application, CandidateProfile, Offer, User
from app.observability import get_logger
from app.services.cv_parser import extract_text
from app.services.cv_storage import CVStorageError, download_cv

genai.configure(api_key=settings.gemini_api_key)
_model = genai.GenerativeModel("gemini-3-flash-preview")
logger = get_logger("screening")

GENERATION_TIMEOUT_SECONDS = 120


def _profile_snapshot(profile: CandidateProfile | None, user: User | None) -> str:
    if profile is None:
        return "No candidate profile on file."
    return (
        f"Name: {user.full_name if user else 'Unknown'}\n"
        f"Headline: {profile.headline or 'Not specified'}\n"
        f"Field: {profile.field_of_study or 'Not specified'}\n"
        f"Education: {profile.university or 'Not specified'} ({profile.study_level.value if profile.study_level else 'Not specified'})\n"
        f"Location: {profile.city or 'Not specified'}\n"
        f"Experience: {profile.years_of_experience if profile.years_of_experience is not None else 'Not specified'} years\n"
        f"Skills: {profile.skills or 'Not specified'}\n"
        f"Summary: {(profile.bio or 'Not specified')[:600]}"
    )


def _cv_text(cv_url: str | None) -> str:
    if not cv_url:
        return ""
    try:
        data = download_cv(cv_url)
        filename = cv_url.rsplit("/", 1)[-1]
        return extract_text(filename, data)[:4000]
    except Exception as exc:
        logger.warning("screening_cv_unavailable", reason=type(exc).__name__)
        return ""


def _parse_result(raw: str) -> dict[str, Any] | None:
    import re

    cleaned = (raw or "").strip()
    if cleaned.startswith("```json"):
        cleaned = cleaned[len("```json") :].strip()
    elif cleaned.startswith("```"):
        cleaned = cleaned[3:].strip()
    if cleaned.endswith("```"):
        cleaned = cleaned[:-3].strip()
    try:
        parsed = json.loads(cleaned)
    except Exception:
        parsed = None
    if not isinstance(parsed, dict):
        # Model sometimes wraps the object in prose: extract the largest
        # {...} span and try once more before giving up.
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            return None
        try:
            parsed = json.loads(match.group(0))
        except Exception:
            return None
        if not isinstance(parsed, dict):
            return None
    try:
        score = int(parsed.get("score"))
    except (TypeError, ValueError):
        return None
    if not 0 <= score <= 100:
        return None
    summary = parsed.get("summary")
    strengths = parsed.get("strengths")
    gaps = parsed.get("gaps")
    if not isinstance(summary, str) or not summary.strip():
        return None
    if not isinstance(strengths, list) or not isinstance(gaps, list):
        return None
    return {
        "score": score,
        "summary": summary.strip()[:800],
        "strengths": [str(s)[:200] for s in strengths[:6]],
        "gaps": [str(g)[:200] for g in gaps[:6]],
    }


async def screen_application(db: AsyncSession, application_id: UUID) -> dict[str, Any]:
    """Run screening for one application. Raises on failure (caller records failed)."""
    result = await db.execute(select(Application).where(Application.id == application_id))
    app = result.scalar_one_or_none()
    if app is None:
        raise ValueError("Application not found")

    profile_result = await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == app.candidate_id))
    profile = profile_result.scalar_one_or_none()
    user_result = await db.execute(select(User).where(User.id == app.candidate_id))
    user = user_result.scalar_one_or_none()
    offer_result = await db.execute(select(Offer).where(Offer.id == app.opportunity_id))
    offer = offer_result.scalar_one_or_none()
    if offer is None:
        raise ValueError("Offer not found")
    if profile is None and not app.cv_url:
        raise ValueError("No candidate profile or CV to screen")

    cv_text = _cv_text(app.cv_url)
    prompt = f"""You are a recruiting screener. Score how well this candidate fits the job.
Return ONLY one valid JSON object, no other text. Keep the whole object compact:
{{"score": 0-100, "summary": "1-2 sentences, max 300 characters", "strengths": ["..."], "gaps": ["..."]}}
Base the score strictly on the evidence below. Do not invent qualifications.

CANDIDATE:
{_profile_snapshot(profile, user)}
{f"CV EXCERPT:{chr(10)}{cv_text}" if cv_text else "No CV text available."}

JOB: {offer.title} at {offer.company} ({offer.region}, {offer.field}, {offer.type.value if offer.type else "?"})
DESCRIPTION: {(offer.description or "")[:1500]}
REQUIREMENTS: {(offer.requirements or "")[:1500]}"""

    logger.info("screening_started", application_id=str(application_id))
    try:
        response = await asyncio.wait_for(
            asyncio.to_thread(
                _model.generate_content,
                prompt,
                generation_config={"temperature": 0.2, "max_output_tokens": 2000},
            ),
            timeout=GENERATION_TIMEOUT_SECONDS,
        )
    except Exception as exc:
        logger.error("screening_failed", reason="generation_error", error=str(exc)[:300])
        raise ValueError("AI provider error") from exc

    parsed = _parse_result(getattr(response, "text", "") or "")
    if parsed is None:
        logger.error("screening_failed", reason="unparseable_response")
        raise ValueError("AI returned an unusable result")

    app.ai_score = parsed["score"]
    app.ai_report = json.dumps(
        {"summary": parsed["summary"], "strengths": parsed["strengths"], "gaps": parsed["gaps"]},
        ensure_ascii=False,
    )
    app.ai_status = "completed"
    await db.commit()
    logger.info("screening_completed", application_id=str(application_id), score=parsed["score"])
    return parsed
