import asyncio
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from starlette.requests import Request

from app.routers.auth import _build_sso_response
from app.services import oauth_service


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
