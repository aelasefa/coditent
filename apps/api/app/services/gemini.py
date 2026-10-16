"""Single bounded adapter for the supported Google Gen AI SDK."""
from __future__ import annotations

import asyncio
import random

import httpx
from google import genai
from google.genai import errors
from google.genai import types

from app.config import settings
from app.observability import get_logger
from app.services.ai_contracts import MAX_MODEL_RESPONSE_CHARS


logger = get_logger("gemini")
MAX_PROVIDER_ATTEMPTS = 3
RETRY_BASE_DELAY_SECONDS = 0.25
MAX_INLINE_RETRY_AFTER_SECONDS = 5.0


class GeminiResponseError(RuntimeError):
    pass


class GeminiEmptyResponseError(GeminiResponseError):
    pass


def get_gemini_client() -> genai.Client:
    # Celery runs each job in a fresh event loop. Reusing an async SDK client
    # across those loops leaves its HTTP transport bound to a closed loop.
    return genai.Client(api_key=settings.gemini_api_key)


def _provider_retry_after_seconds(exc: BaseException) -> float | None:
    details = getattr(exc, "details", None)
    if not isinstance(details, dict):
        return None
    error = details.get("error", details)
    if not isinstance(error, dict):
        return None
    error_details = error.get("details", [])
    if not isinstance(error_details, list):
        return None
    for item in error_details:
        if not isinstance(item, dict) or not str(item.get("@type", "")).endswith("RetryInfo"):
            continue
        value = item.get("retryDelay")
        if isinstance(value, str) and value.endswith("s"):
            try:
                return max(0.0, float(value[:-1]))
            except ValueError:
                return None
    return None


def _is_retryable(exc: BaseException) -> bool:
    if isinstance(exc, errors.ServerError):
        return True
    if isinstance(exc, errors.ClientError):
        retry_after = _provider_retry_after_seconds(exc)
        return (
            exc.code == 429
            and (retry_after is None or retry_after <= MAX_INLINE_RETRY_AFTER_SECONDS)
        )
    return isinstance(exc, (httpx.TransportError, GeminiEmptyResponseError))


def _is_failoverable(exc: BaseException) -> bool:
    return _is_retryable(exc) or (
        isinstance(exc, errors.ClientError) and exc.code == 429
    )


def _retry_delay_seconds(attempt: int) -> float:
    """Short exponential backoff with jitter; attempt is one-based."""
    delay = RETRY_BASE_DELAY_SECONDS * (2 ** (attempt - 1))
    return delay * random.uniform(0.8, 1.2)


async def _generate_with_retry(
    *,
    client: genai.Client,
    model: str,
    prompt: str,
    config: types.GenerateContentConfig,
    timeout: float,
) -> tuple[object, str]:
    for attempt in range(1, MAX_PROVIDER_ATTEMPTS + 1):
        try:
            response = await asyncio.wait_for(
                client.aio.models.generate_content(
                    model=model,
                    contents=prompt,
                    config=config,
                ),
                timeout=timeout,
            )
            raw = (getattr(response, "text", "") or "").strip()
            if not raw:
                raise GeminiEmptyResponseError("Gemini returned an empty response")
            return response, raw
        except Exception as exc:
            if attempt == MAX_PROVIDER_ATTEMPTS or not _is_retryable(exc):
                raise
            delay = max(
                _retry_delay_seconds(attempt),
                _provider_retry_after_seconds(exc) or 0.0,
            )
            logger.warning(
                "gemini_request_retry",
                model=model,
                attempt=attempt,
                max_attempts=MAX_PROVIDER_ATTEMPTS,
                exception_type=type(exc).__name__,
                provider_status=getattr(exc, "code", None),
                retry_delay_seconds=round(delay, 3),
            )
            await asyncio.sleep(delay)
    raise AssertionError("Gemini retry loop exited unexpectedly")


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
    client = get_gemini_client()
    try:
        models = [settings.gemini_model]
        fallback_model = settings.gemini_fallback_model.strip()
        if fallback_model and fallback_model != settings.gemini_model:
            models.append(fallback_model)
        for model_index, model in enumerate(models):
            try:
                response, raw = await _generate_with_retry(
                    client=client,
                    model=model,
                    prompt=prompt,
                    config=config,
                    timeout=timeout,
                )
                break
            except Exception as exc:
                if model_index == len(models) - 1 or not _is_failoverable(exc):
                    raise
                logger.warning(
                    "gemini_model_fallback",
                    failed_model=model,
                    fallback_model=models[model_index + 1],
                    exception_type=type(exc).__name__,
                    provider_status=getattr(exc, "code", None),
                )
    finally:
        close = getattr(client.aio, "aclose", None)
        if callable(close):
            await close()
    if len(raw) > MAX_MODEL_RESPONSE_CHARS:
        raise GeminiResponseError("Gemini response exceeds the configured output bound")
    finish_reason: object | None = None
    try:
        finish_reason = response.candidates[0].finish_reason
    except (AttributeError, IndexError, TypeError):
        pass
    return raw, finish_reason
