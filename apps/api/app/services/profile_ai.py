"""Bounded AI helpers for candidate-authored profile text."""
from __future__ import annotations

import asyncio
import re
from typing import Any

import httpx
from google.genai import errors

from app.observability import get_logger
from app.services.ai_contracts import untrusted_prompt_data
from app.services.gemini import GeminiResponseError, generate_text


logger = get_logger("profile_ai")


def _plain_text(raw: str, *, max_chars: int) -> str:
    cleaned = raw.strip().strip("`").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip('"\' ')
    if not cleaned or len(cleaned) > max_chars:
        raise ValueError("AI profile text is outside the configured output bound")
    return cleaned


def _fallback_headline(data: dict[str, Any]) -> str:
    skills = [
        str(value).strip()
        for value in data.get("skills", [])
        if str(value).strip()
    ]
    field = str(data.get("field_of_study") or "").strip()
    parts = [field or "Candidate", *skills[:3]]
    unique_parts = list(dict.fromkeys(part for part in parts if part))
    return " • ".join(unique_parts)[:120].rstrip(" ,•")


def _fallback_bio(data: dict[str, Any]) -> str:
    skills = [
        str(value).strip()
        for value in data.get("skills", [])
        if str(value).strip()
    ]
    field = str(data.get("field_of_study") or "").strip()
    focus = (
        f"I am building my career in {field}"
        if field
        else "I am a motivated candidate"
    )
    selected_skills = skills[:3]
    if len(selected_skills) > 1:
        skill_text = f"{', '.join(selected_skills[:-1])}, and {selected_skills[-1]}"
    else:
        skill_text = selected_skills[0]
    return (
        f"{focus}, with skills in {skill_text}. "
        "I am seeking opportunities to apply my knowledge, contribute to meaningful projects, "
        "and continue growing professionally."
    )[:500]


async def generate_profile_headline(data: dict[str, Any]) -> str:
    prompt = f"""Write one professional headline for a Moroccan job seeker.
Use only the supplied facts. Do not invent credentials or experience.
Return only the headline, 60-100 characters, with no quotes or markdown.

{untrusted_prompt_data(data, max_chars=4_000)}"""
    try:
        raw, _ = await generate_text(
            prompt,
            temperature=0.7,
            max_output_tokens=192,
        )
        headline = _plain_text(raw, max_chars=120)
        if len(headline) < 20:
            raise GeminiResponseError("AI headline is too short")
        return headline
    except (
        errors.APIError,
        httpx.TransportError,
        asyncio.TimeoutError,
        GeminiResponseError,
    ) as exc:
        logger.warning(
            "profile_headline_local_fallback",
            exception_type=type(exc).__name__,
            provider_status=getattr(exc, "code", None),
        )
        return _fallback_headline(data)


async def generate_profile_bio(data: dict[str, Any]) -> str:
    prompt = f"""Write a concise professional bio for a Moroccan job seeker.
Use first person, 2-3 complete sentences, and only supplied facts. Do not
invent qualifications, achievements, employers, or experience. Return only
the bio text with no quotes or markdown. Target 250-450 characters.

{untrusted_prompt_data(data, max_chars=8_000)}"""
    try:
        raw, _ = await generate_text(
            prompt,
            temperature=0.7,
            max_output_tokens=512,
        )
        bio = _plain_text(raw, max_chars=500)
        if (
            len(bio) < 80
            or len(bio.split()) < 8
            or not re.search(r'''[.!?]["')\]]?$''', bio)
        ):
            raise GeminiResponseError("AI bio does not meet the quality bound")
        return bio
    except (
        errors.APIError,
        httpx.TransportError,
        asyncio.TimeoutError,
        GeminiResponseError,
    ) as exc:
        logger.warning(
            "profile_bio_local_fallback",
            exception_type=type(exc).__name__,
            provider_status=getattr(exc, "code", None),
        )
        return _fallback_bio(data)
