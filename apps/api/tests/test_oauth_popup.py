import asyncio
import uuid
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.models import CandidateProfile, User, UserRole
from app.routers.auth import _build_sso_response, _create_sso_candidate
from app.schemas import RegisterRequest
from app.services import oauth_service
from app.services.oauth_service import OAuthIdentity


class FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}

    async def set(self, key, value, ex=None, nx=False):
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def getdel(self, key):
        return self.values.pop(key, None)


class FakeDb:
    def __init__(self):
        self.added = []

    def add(self, value):
        self.added.append(value)

    async def flush(self):
        for value in self.added:
            if isinstance(value, User) and value.id is None:
                value.id = uuid.uuid4()

    async def commit(self):
        return None

    async def refresh(self, value):
        return None


def _html_request() -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/auth/sso/google/callback",
        "headers": [(b"accept", b"text/html")],
    })


def test_popup_origin_accepts_configured_local_alias_and_rejects_external(monkeypatch):
    monkeypatch.setattr(oauth_service.settings, "frontend_url", "http://localhost:3001")
    assert oauth_service.validate_popup_origin("http://127.0.0.1:3001") == "http://127.0.0.1:3001"
    with pytest.raises(HTTPException) as exc:
        oauth_service.validate_popup_origin("https://evil.example")
    assert exc.value.status_code == 400


def test_oauth_state_binds_origin_and_attempt(monkeypatch):
    monkeypatch.setattr(oauth_service.settings, "frontend_url", "http://localhost:3001")
    state = oauth_service.create_oauth_state("google", "http://127.0.0.1:3001", "attempt-123")
    assert oauth_service.verify_oauth_state(state, "google") == (
        "http://127.0.0.1:3001",
        "attempt-123",
    )
    with pytest.raises(HTTPException):
        oauth_service.verify_oauth_state(state, "linkedin")


def test_handoff_is_single_use(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)
    code = asyncio.run(oauth_service.create_oauth_handoff("jwt-secret", "user-1", False))
    first = asyncio.run(oauth_service.consume_oauth_handoff(code))
    assert first["token"] == "jwt-secret"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(oauth_service.consume_oauth_handoff(code))
    assert exc.value.status_code == 401


def test_html_callback_contains_only_handoff_not_access_token():
    response = _build_sso_response(
        _html_request(),
        "raw-access-token",
        SimpleNamespace(),
        "one-time-handoff-code",
        "http://127.0.0.1:3001",
        "attempt-123",
        "google",
    )
    location = response.headers["location"]
    parsed = urlparse(location)
    params = parse_qs(parsed.query)
    assert parsed.netloc == "127.0.0.1:3001"
    assert params["handoff"] == ["one-time-handoff-code"]
    assert "raw-access-token" not in location
    assert not parsed.fragment


def test_public_registration_role_is_candidate_only_and_optional():
    payload = {
        "email": "candidate@example.com",
        "password": "StrongPass123!",
        "full_name": "Candidate User",
    }
    assert RegisterRequest(**payload).role is None
    assert RegisterRequest(**payload, role="CANDIDATE").role == "CANDIDATE"
    with pytest.raises(ValidationError):
        RegisterRequest(**payload, role="RECRUITER")


@pytest.mark.parametrize(
    "password",
    [
        "Short1!a",
        "NOLOWERCASE123!",
        "nouppercase123!",
        "NoNumbersHere!",
        "NoSymbols1234",
    ],
)
def test_candidate_password_policy_rejects_each_missing_requirement(password):
    with pytest.raises(ValidationError):
        RegisterRequest(
            email="candidate@example.com",
            password=password,
            full_name="Candidate User",
        )


def test_new_sso_identity_is_always_created_as_candidate():
    db = FakeDb()
    identity = OAuthIdentity(
        email="new-candidate@example.com",
        full_name="New Candidate",
        oauth_id="provider-user-123",
        avatar_url=None,
        provider="google",
    )

    user = asyncio.run(_create_sso_candidate(db, identity))

    assert user.role == UserRole.CANDIDATE
    assert user.is_approved is True
    assert user.company_id is None
    assert user.company_role is None
    profiles = [value for value in db.added if isinstance(value, CandidateProfile)]
    assert len(profiles) == 1
    assert profiles[0].user_id == user.id
