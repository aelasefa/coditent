from unittest.mock import AsyncMock

import pytest
from google.genai import errors

from app.services import profile_ai


@pytest.mark.asyncio
async def test_headline_uses_supplied_facts_when_provider_is_unavailable(
    monkeypatch,
) -> None:
    monkeypatch.setattr(
        profile_ai,
        "generate_text",
        AsyncMock(side_effect=errors.ServerError(503, {"message": "unavailable"})),
    )

    headline = await profile_ai.generate_profile_headline(
        {
            "skills": ["Python", "FastAPI", "React"],
            "field_of_study": "Software Engineering",
        }
    )

    assert headline == "Software Engineering Candidate | Python, FastAPI, React"
    assert len(headline) <= 120


@pytest.mark.asyncio
async def test_headline_falls_back_when_provider_output_is_too_short(monkeypatch) -> None:
    monkeypatch.setattr(
        profile_ai,
        "generate_text",
        AsyncMock(return_value=("Too short", None)),
    )

    headline = await profile_ai.generate_profile_headline(
        {"skills": ["Python"], "field_of_study": None}
    )

    assert headline == "Python Candidate | Python"
