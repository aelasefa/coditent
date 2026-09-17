import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from app.models import CandidateProfile
from app.routers import candidates
from app.schemas import OnboardingStepUpdate


def _profile(step: int = 1) -> CandidateProfile:
    return CandidateProfile(
        user_id=None,
        onboarding_step=step,
        onboarding_completed=False,
        search_timeline=None,
        desired_opportunity_type=None,
        desired_fields=None,
        desired_location=None,
        preferred_work_mode=None,
        career_stage=None,
    )


def _db() -> SimpleNamespace:
    return SimpleNamespace(commit=AsyncMock(), refresh=AsyncMock())


def test_step_is_saved_and_progresses(monkeypatch):
    profile = _profile()
    monkeypatch.setattr(candidates, "_get_profile", AsyncMock(return_value=profile))

    state = asyncio.run(candidates.update_onboarding_step(
        OnboardingStepUpdate(step=1, value="ASAP"),
        SimpleNamespace(id="candidate"),
        _db(),
    ))

    assert state.search_timeline == "ASAP"
    assert state.onboarding_step == 2


def test_step_rejects_direct_skip(monkeypatch):
    profile = _profile()
    monkeypatch.setattr(candidates, "_get_profile", AsyncMock(return_value=profile))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(candidates.update_onboarding_step(
            OnboardingStepUpdate(step=3, value=["engineering"]),
            SimpleNamespace(id="candidate"),
            _db(),
        ))

    assert exc.value.status_code == 409


def test_fields_require_known_nonempty_values(monkeypatch):
    profile = _profile(step=3)
    monkeypatch.setattr(candidates, "_get_profile", AsyncMock(return_value=profile))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(candidates.update_onboarding_step(
            OnboardingStepUpdate(step=3, value=["unknown"]),
            SimpleNamespace(id="candidate"),
            _db(),
        ))

    assert exc.value.status_code == 422


def test_completion_requires_every_answer(monkeypatch):
    profile = _profile(step=7)
    monkeypatch.setattr(candidates, "_get_profile", AsyncMock(return_value=profile))

    with pytest.raises(HTTPException) as exc:
        asyncio.run(candidates.complete_onboarding(SimpleNamespace(id="candidate"), _db()))

    assert exc.value.status_code == 409


def test_completion_marks_timestamp(monkeypatch):
    profile = _profile(step=7)
    profile.search_timeline = "ASAP"
    profile.desired_opportunity_type = "BOTH"
    profile.desired_fields = '["engineering", "data"]'
    profile.desired_location = "Rabat"
    profile.preferred_work_mode = "HYBRID"
    profile.career_stage = "RECENT_GRADUATE"
    monkeypatch.setattr(candidates, "_get_profile", AsyncMock(return_value=profile))

    state = asyncio.run(candidates.complete_onboarding(SimpleNamespace(id="candidate"), _db()))

    assert state.onboarding_completed is True
    assert state.onboarding_completed_at is not None
    assert state.desired_fields == ["engineering", "data"]
