"""Single bounded adapter for the supported Google Gen AI SDK."""
from __future__ import annotations

import asyncio
from functools import lru_cache

from google import genai
from google.genai import types

from app.config import settings
from app.services.ai_contracts import MAX_MODEL_RESPONSE_CHARS


class GeminiResponseError(RuntimeError):
    pass


@lru_cache(maxsize=1)
def get_gemini_client() -> genai.Client:
    return genai.Client(api_key=settings.gemini_api_key)


async def generate_text(
    prompt: str,
    *,
    temperature: float,
    max_output_tokens: int,
    response_mime_type: str | None = None,
    timeout_seconds: float | None = None,
) -> tuple[str, object | None]:
    if not prompt or len(prompt) > 30_000:
        raise ValueError("Gemini prompt exceeds the configured input bound")
    config = types.GenerateContentConfig(
        temperature=temperature,
        max_output_tokens=max_output_tokens,
        response_mime_type=response_mime_type,
    )
    timeout = timeout_seconds or settings.ai_provider_timeout_seconds
    response = await asyncio.wait_for(
        get_gemini_client().aio.models.generate_content(
            model=settings.gemini_model,
            contents=prompt,
            config=config,
        ),
        timeout=timeout,
    )
    raw = (getattr(response, "text", "") or "").strip()
    if not raw:
        raise GeminiResponseError("Gemini returned an empty response")
    if len(raw) > MAX_MODEL_RESPONSE_CHARS:
        raise GeminiResponseError("Gemini response exceeds the configured output bound")
    finish_reason: object | None = None
    try:
        finish_reason = response.candidates[0].finish_reason
    except (AttributeError, IndexError, TypeError):
        pass
    return raw, finish_reason
