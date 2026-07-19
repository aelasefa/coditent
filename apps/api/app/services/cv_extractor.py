import asyncio
import json
import logging
import mimetypes
import os
import tempfile
from typing import Any

import google.generativeai as genai

from app.config import settings

# Configure the Gemini API (already configured in other modules, but ensure safe init)
genai.configure(api_key=settings.gemini_api_key)
_model = genai.GenerativeModel("gemini-1.5-flash")
logger = logging.getLogger("cv_extractor")

# Expected keys for the profile extraction
EXPECTED_KEYS = {
    "headline",
    "bio",
    "skills",
    "field_of_study",
    "university",
    "study_level",
    "years_of_experience",
    "city",
    "phone",
    "linkedin_url",
    "portfolio_url",
}

async def extract_profile_from_cv(file_content: bytes, filename: str) -> dict[str, Any]:
    """Extract candidate profile fields from a CV file using Gemini.

    Args:
        file_content: Raw CV file bytes.
        filename: Original filename (used to infer MIME type).

    Returns:
        A dict with the keys defined in ``EXPECTED_KEYS``. Missing values are ``None``.
    """
    # Write bytes to a temporary file so Gemini can ingest it.
    suffix = os.path.splitext(filename)[1] or ""
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(file_content)
        tmp_path = tmp.name

    try:
        # Upload the file to Gemini's file service.
        uploaded_file = genai.upload_file(tmp_path)
        # Build a concise prompt asking Gemini to extract the fields.
        prompt = (
            "You are an assistant that extracts a concise candidate profile from a CV.\n"
            "Extract the following fields and return a JSON object with EXACT these keys:\n"
            "- headline\n"
            "- bio\n"
            "- skills\n"
            "- field_of_study\n"
            "- university\n"
            "- study_level\n"
            "- years_of_experience\n"
            "- city\n"
            "- phone\n"
            "- linkedin_url\n"
            "- portfolio_url\n"
            "Return ONLY the JSON object, no extra text. Use null for any missing value.\n"
            "The CV is provided as a file attachment."
        )
        # Send the prompt together with the uploaded file as separate parts.
        response = await asyncio.to_thread(
            _model.generate_content,
            [prompt, uploaded_file],
            generation_config={"temperature": 0.0, "max_output_tokens": 2000},
        )
    except Exception as exc:
        logger.error("cv_extractor_error", exc_info=exc)
        raise
    finally:
        # Clean up the temporary file.
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    # Extract raw text from the response.
    raw = getattr(response, "text", "").strip()
    if not raw:
        logger.error("cv_extractor_empty_response")
        return {k: None for k in EXPECTED_KEYS}

    # Strip possible markdown fences.
    if raw.startswith("```json"):
        raw = raw[len("```json") :].strip()
    elif raw.startswith("```"):
        raw = raw[3:].strip()
    if raw.endswith("```"):
        raw = raw[: -3].strip()

    try:
        parsed = json.loads(raw)
    except Exception as exc:
        logger.error("cv_extractor_invalid_json", exc_info=exc, raw=raw[:200])
        # Return empty dict on failure.
        return {k: None for k in EXPECTED_KEYS}

    # Ensure all expected keys are present; coerce type where reasonable.
    result: dict[str, Any] = {}
    for key in EXPECTED_KEYS:
        value = parsed.get(key)
        # Basic normalization: convert empty strings to None and enforce int for years_of_experience.
        if isinstance(value, str) and value.strip() == "":
            value = None
        if key == "years_of_experience" and value is not None:
            try:
                value = int(value)
            except Exception:
                value = None
        result[key] = value
    return result
