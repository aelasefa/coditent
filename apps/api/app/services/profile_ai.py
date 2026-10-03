"""Bounded AI helpers for candidate-authored profile text."""
from __future__ import annotations

import re
from typing import Any

from app.services.ai_contracts import untrusted_prompt_data
from app.services.gemini import generate_text


def _plain_text(raw: str, *, max_chars: int) -> str:
    cleaned = raw.strip().strip("`").strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    cleaned = cleaned.strip('"\' ')
    if not cleaned or len(cleaned) > max_chars:
        raise ValueError("AI profile text is outside the configured output bound")
    return cleaned


async def generate_profile_headline(data: dict[str, Any]) -> str:
    prompt = f"""Write one professional headline for a Moroccan job seeker.
Use only the supplied facts. Do not invent credentials or experience.
Return only the headline, 60-100 characters, with no quotes or markdown.

{untrusted_prompt_data(data, max_chars=4_000)}"""
    raw, _ = await generate_text(
        prompt,
        temperature=0.7,
        max_output_tokens=96,
    )
    headline = _plain_text(raw, max_chars=120)
    if len(headline) < 20:
        raise ValueError("AI headline is too short")
    return headline


async def generate_profile_bio(data: dict[str, Any]) -> str:
    prompt = f"""Write a concise professional bio for a Moroccan job seeker.
Use first person, 2-3 complete sentences, and only supplied facts. Do not
invent qualifications, achievements, employers, or experience. Return only
the bio text with no quotes or markdown. Target 250-450 characters.

{untrusted_prompt_data(data, max_chars=8_000)}"""
    raw, _ = await generate_text(
        prompt,
        temperature=0.7,
        max_output_tokens=256,
    )
    bio = _plain_text(raw, max_chars=500)
    if len(bio) < 80 or bio.count(".") < 1:
        raise ValueError("AI bio does not meet the quality bound")
    return bio
