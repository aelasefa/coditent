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

    assert headline == "Software Engineering • Python • FastAPI • React"
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

    assert headline == "Candidate • Python"


@pytest.mark.asyncio
async def test_bio_falls_back_when_provider_output_fails_quality_check(monkeypatch) -> None:
    monkeypatch.setattr(
        profile_ai,
        "generate_text",
        AsyncMock(return_value=("Too short", None)),
    )

    bio = await profile_ai.generate_profile_bio(
        {
            "skills": ["Python", "FastAPI", "React"],
            "field_of_study": "Software Engineering",
        }
    )

    assert "Software Engineering" in bio
    assert "Python, FastAPI, and React" in bio
    assert len(bio) >= 80
    assert bio.count(".") >= 2


@pytest.mark.asyncio
async def test_bio_falls_back_when_provider_stops_mid_sentence(monkeypatch) -> None:
    monkeypatch.setattr(
        profile_ai,
        "generate_text",
        AsyncMock(
            return_value=(
                "I am a software engineering candidate with a strong foundation in development. My field",
                None,
            )
        ),
    )

    bio = await profile_ai.generate_profile_bio(
        {
            "skills": ["Python", "FastAPI"],
            "field_of_study": "Software Engineering",
        }
    )

    assert bio.endswith("professionally.")
