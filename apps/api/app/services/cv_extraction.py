"""Gemini structured extraction from CV text. Never logs CV contents or keys.

Root-cause note (2026-09): `gemini-3-flash-preview` spends a large hidden
thinking trace that counts against `max_output_tokens`. With a small budget
(1200) the visible JSON was cut off mid-string (finish MAX_TOKENS), which
surfaced as "invalid response". Fix: large budget (8192) + explicit STOP
check + one reduced-input retry. `response_schema` was tried and made
truncation worse on this model, so output is constrained by prompt
instruction plus defensive server-side parsing instead.
"""
from __future__ import annotations

import asyncio
import json
import re
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from app.services.cv_parser import clamp_years, map_study_level, normalize_skills, normalize_url

MAX_OUTPUT_TOKENS = 8192
TEXT_LIMIT = 12000
TEXT_LIMIT_RETRY = 6000


class AIExtractionError(RuntimeError):
    def __init__(self, message: str, code: str = "CV_AI_ERROR"):
        super().__init__(message)
        self.code = code


class CVExtractedData(BaseModel):
    model_config = ConfigDict(extra="ignore")

    skills: list[str] = Field(default_factory=list)
    years_of_experience: int | None = None
    field_of_study: str | None = None
    university: str | None = None
    study_level: str | None = None
    city: str | None = None
    phone: str | None = None
    linkedin_url: str | None = None
    portfolio_url: str | None = None


EXTRACTION_PROMPT = """Extract structured candidate info from the CV text below.
Return ONLY a single JSON object. No markdown, no code fences, no commentary before or after.
Only include info actually present in the CV. Missing -> null. Never invent.

Keys (exact): skills, years_of_experience, field_of_study, university, study_level, city, phone, linkedin_url, portfolio_url.

Rules:
- skills: array of short individual skill strings, max 20. Empty array if none.
- years_of_experience: integer 0-40, total non-overlapping professional years. Insufficient info -> null.
- study_level: one of BAC, LICENCE, MASTER, DOCTORAT. Map bachelor/licence->LICENCE, master/ingenieur->MASTER, phd->DOCTORAT, bac->BAC. Uncertain -> null.
- linkedin_url/portfolio_url: full http(s) URLs or null.
- city/phone/field_of_study/university: short strings or null.

CV:
{text}
"""


def _get_logger():
    from app.observability import get_logger

    return get_logger("cv_extraction")


def _get_model():
    import google.generativeai as genai

    from app.config import settings

    genai.configure(api_key=settings.gemini_api_key)
    return genai.GenerativeModel("gemini-3-flash-preview")


def parse_ai_response(raw: str) -> dict[str, Any]:
    """Parse model output into a dict. Raises AIExtractionError (schema code)."""
    t = (raw or "").strip()
    if not t:
        raise AIExtractionError(
            "Extraction returned an empty response, please retry", code="CV_EXTRACTION_SCHEMA_ERROR"
        )
    # Strip markdown fences (```json ... ``` or ``` ... ```).
    if t.startswith("```"):
        first_nl = t.find("\n")
        t = t[first_nl + 1 :] if first_nl != -1 else t[3:]
        if t.rstrip().endswith("```"):
            t = t.rstrip()[: -len("```")]
        t = t.strip()
    try:
        payload = json.loads(t)
    except json.JSONDecodeError:
        # Fallback: prologue/epilogue around the object -> first { to last }.
        start, end = t.find("{"), t.rfind("}")
        if start == -1 or end <= start:
            raise AIExtractionError(
                "Extraction returned an invalid response, please retry",
                code="CV_EXTRACTION_SCHEMA_ERROR",
            ) from None
        try:
            payload = json.loads(t[start : end + 1])
        except json.JSONDecodeError as exc:
            raise AIExtractionError(
                "Extraction returned an invalid response, please retry",
                code="CV_EXTRACTION_SCHEMA_ERROR",
            ) from exc
    if not isinstance(payload, dict):
        raise AIExtractionError(
            "Extraction returned an invalid response, please retry",
            code="CV_EXTRACTION_SCHEMA_ERROR",
        )
    return payload


# Canonical flat contract. Aliases + nested groups below are folded into it,
# so AI/backend/API/frontend share one structure (never two competing ones).
_ALIASES: dict[str, str] = {
    "skills": "skills",
    "keyskills": "skills",
    "key_skills": "skills",
    "skill": "skills",
    "technicalskills": "skills",
    "technical_skills": "skills",
    "yearsofexperience": "years_of_experience",
    "years_of_experience": "years_of_experience",
    "yearsexperience": "years_of_experience",
    "years": "years_of_experience",
    "experienceyears": "years_of_experience",
    "totalexperience": "years_of_experience",
    "fieldofstudy": "field_of_study",
    "field_of_study": "field_of_study",
    "field": "field_of_study",
    "major": "field_of_study",
    "university": "university",
    "school": "university",
    "college": "university",
    "studylevel": "study_level",
    "study_level": "study_level",
    "degree": "study_level",
    "degreelevel": "study_level",
    "educationlevel": "study_level",
    "city": "city",
    "location": "city",
    "phone": "phone",
    "telephone": "phone",
    "mobile": "phone",
    "linkedinurl": "linkedin_url",
    "linkedin_url": "linkedin_url",
    "linkedin": "linkedin_url",
    "portfoliourl": "portfolio_url",
    "portfolio_url": "portfolio_url",
    "portfolio": "portfolio_url",
    "website": "portfolio_url",
}
# Nested groups the model sometimes returns; subkeys fold into the flat keys.
_NESTED: dict[str, dict[str, str]] = {
    "experience": {"years": "years_of_experience", "yearsofexperience": "years_of_experience"},
    "education": {
        "fieldofstudy": "field_of_study",
        "field": "field_of_study",
        "university": "university",
        "school": "university",
        "studylevel": "study_level",
        "degree": "study_level",
    },
    "contact": {
        "city": "city",
        "phone": "phone",
        "linkedinurl": "linkedin_url",
        "linkedin": "linkedin_url",
        "portfoliourl": "portfolio_url",
        "portfolio": "portfolio_url",
    },
}


def _canon_key(raw_key: str) -> str | None:
    norm = re.sub(r"[^a-z0-9]", "", raw_key.lower())
    return _ALIASES.get(norm)


def _flatten(payload: dict[str, Any]) -> dict[str, Any]:
    flat: dict[str, Any] = {}
    for key, value in payload.items():
        if isinstance(value, dict) and _canon_key(key) is None and key.lower() in _NESTED:
            sub = _NESTED[key.lower()]
            for sk, sv in value.items():
                snorm = re.sub(r"[^a-z0-9]", "", str(sk).lower())
                if snorm in sub and sub[snorm] not in flat:
                    flat[sub[snorm]] = sv
            continue
        canon = _canon_key(str(key))
        if canon and canon not in flat:
            flat[canon] = value
    return flat


def normalize_extracted(payload: dict[str, Any]) -> CVExtractedData:
    flat = _flatten(payload) if isinstance(payload, dict) else {}

    raw_skills = flat.get("skills")
    if isinstance(raw_skills, str):
        raw_skills = [raw_skills]
    skills = normalize_skills(raw_skills if isinstance(raw_skills, list) else [])

    raw_study = flat.get("study_level")
    study = map_study_level(raw_study if isinstance(raw_study, str) else None)

    raw_years = flat.get("years_of_experience")
    years: int | None = None
    if isinstance(raw_years, bool):
        years = None
    elif isinstance(raw_years, (int, float)):
        years = clamp_years(int(raw_years))
    elif isinstance(raw_years, str):
        try:
            years = clamp_years(int(float(raw_years.strip())))
        except ValueError:
            years = None

    def _str(key: str, limit: int) -> str | None:
        v = flat.get(key)
        if not isinstance(v, str):
            return None
        s = v.strip()
        if not s or len(s) > limit:
            return None
        return s

    for url_key in ("linkedin_url", "portfolio_url"):
        v = flat.get(url_key)
        if isinstance(v, str):
            m = re.search(r"https?://[^\s\"'<>]+", v)
            flat[url_key] = m.group(0).rstrip(".,;)") if m else v

    return CVExtractedData(
        skills=skills,
        years_of_experience=years,
        field_of_study=_str("field_of_study", 120),
        university=_str("university", 160),
        study_level=study,
        city=_str("city", 100),
        phone=_str("phone", 30),
        linkedin_url=normalize_url(flat.get("linkedin_url") if isinstance(flat.get("linkedin_url"), str) else None),
        portfolio_url=normalize_url(flat.get("portfolio_url") if isinstance(flat.get("portfolio_url"), str) else None),
    )


def _is_stop(response: Any) -> bool:
    try:
        fr = response.candidates[0].finish_reason
        return getattr(fr, "name", str(fr)) == "STOP"
    except (IndexError, AttributeError):
        return True


async def _call_model(text: str, timeout_s: float) -> tuple[str, bool]:
    model = _get_model()
    response = await asyncio.wait_for(
        asyncio.to_thread(
            model.generate_content,
            EXTRACTION_PROMPT.format(text=text),
            generation_config={"temperature": 0.1, "max_output_tokens": MAX_OUTPUT_TOKENS},
        ),
        timeout=timeout_s,
    )
    raw = (getattr(response, "text", "") or "").strip()
    return raw, _is_stop(response)


async def extract_profile_from_text(
    text: str, timeout_s: float = 30.0
) -> tuple[CVExtractedData, list[str], dict[str, int]]:
    """Run Gemini extraction. Read-only; raises AIExtractionError (retry-safe)."""
    logger = _get_logger()
    warnings: list[str] = []
    if not text or len(text.strip()) < 20:
        raise AIExtractionError("No extractable text in CV", code="CV_NO_TEXT")

    attempts = [(text[:TEXT_LIMIT], "full"), (text[:TEXT_LIMIT_RETRY], "reduced")]
    raw = ""
    stopped = False
    try:
        for chunk, _label in attempts:
            raw, stopped = await _call_model(chunk, timeout_s)
            if stopped and raw:
                break
            logger.error("cv_extraction_incomplete", retry=True)
    except asyncio.TimeoutError as exc:
        logger.error("cv_extraction_failed", reason="timeout")
        raise AIExtractionError("Extraction timed out, please retry", code="CV_AI_TIMEOUT") from exc
    except AIExtractionError:
        raise
    except Exception as exc:
        logger.error("cv_extraction_failed", reason="generation_error")
        raise AIExtractionError("Extraction service unavailable, please retry", code="CV_AI_ERROR") from exc

    logger.info(
        "cv_extraction_response",
        response_chars=len(raw),
        complete=stopped,
    )
    if not stopped or not raw:
        raise AIExtractionError(
            "Extraction came back incomplete, please retry", code="CV_AI_ERROR"
        )

    payload = parse_ai_response(raw)
    data = normalize_extracted(payload)
    if not data.skills:
        warnings.append("No skills found in CV")
    if data.years_of_experience is None:
        warnings.append("Experience not clear, left unchanged")
    if isinstance(payload, dict) and payload.get("study_level") and data.study_level is None:
        warnings.append("Study level uncertain, left unselected")
    return data, warnings, {"ai_response_chars": len(raw)}
