import asyncio
import json
import uuid
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request

from app.models import CandidateProfile, User, UserRole
from app.routers.auth import (
    _build_sso_response,
    _create_sso_candidate,
    exchange_oauth_handoff,
)
from app.schemas import OAuthHandoffExchangeRequest, RegisterRequest
from app.services import authentication, oauth_service
from app.services.authentication import complete_authentication
from app.services.oauth_service import OAuthIdentity
from app.services.two_factor import encrypt_totp_secret


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

    async def get(self, key):
        return self.values.get(key)


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


class ExistingUserDb:
    def __init__(self, user: User):
        self.user = user

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


def _html_request() -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/auth/sso/google/callback",
        "headers": [(b"accept", b"text/html")],
    })


def _json_request() -> Request:
    return Request({
        "type": "http",
        "method": "GET",
        "path": "/auth/sso/google/callback",
        "headers": [(b"accept", b"application/json")],
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


def test_oauth_attempt_is_browser_bound_single_use_and_uses_pkce(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)
    monkeypatch.setattr(oauth_service.settings, "frontend_url", "http://localhost:3001")

    attempt = asyncio.run(
        oauth_service.create_oauth_attempt(
            "google", "http://localhost:3001", "attempt-123", None
        )
    )
    provider = oauth_service.OAuthProvider(
        name="google",
        client_id="client-id",
        client_secret="client-secret",
        authorization_url="https://accounts.example/authorize",
        token_url="https://accounts.example/token",
        userinfo_url="https://accounts.example/userinfo",
        scopes=("openid", "email"),
        issuer="https://accounts.example",
    )
    authorization_url = oauth_service.build_oauth_authorize_url(
        provider,
        "https://app.example/callback",
        attempt.state,
        code_verifier=attempt.code_verifier,
        nonce=attempt.nonce,
    )
    params = parse_qs(urlparse(authorization_url).query)
    assert params["code_challenge_method"] == ["S256"]
    assert params["code_challenge"]
    assert params["nonce"] == [attempt.nonce]

    with pytest.raises(HTTPException, match="invalid_sso_state"):
        asyncio.run(
            oauth_service.consume_oauth_attempt(attempt.state, "google", "wrong-browser")
        )
    consumed = asyncio.run(
        oauth_service.consume_oauth_attempt(
            attempt.state, "google", attempt.browser_id
        )
    )
    assert consumed.code_verifier == attempt.code_verifier
    with pytest.raises(HTTPException, match="invalid_sso_state"):
        asyncio.run(
            oauth_service.consume_oauth_attempt(
                attempt.state, "google", attempt.browser_id
            )
        )


def test_oauth_identity_requires_verified_email_stable_subject_and_known_issuer():
    provider = oauth_service.OAuthProvider(
        name="google",
        client_id="client-id",
        client_secret="client-secret",
        authorization_url="https://accounts.google.com/authorize",
        token_url="https://accounts.google.com/token",
        userinfo_url="https://accounts.google.com/userinfo",
        scopes=("openid", "email"),
        issuer="https://accounts.google.com",
    )
    base = {
        "email": "candidate@example.com",
        "email_verified": True,
        "sub": "stable-provider-subject",
        "iss": "https://accounts.google.com",
    }
    identity = oauth_service._parse_identity_payload(provider, base)
    assert identity.oauth_id == "stable-provider-subject"
    assert identity.email_verified is True

    for invalid in (
        {**base, "email_verified": False},
        {**base, "sub": ""},
        {**base, "iss": "https://evil.example"},
    ):
        with pytest.raises(HTTPException):
            oauth_service._parse_identity_payload(provider, invalid)


def test_handoff_is_single_use(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)
    code = asyncio.run(oauth_service.create_oauth_handoff("jwt-secret", "user-1", False))
    first = asyncio.run(oauth_service.consume_oauth_handoff(code))
    assert first["token"] == "jwt-secret"
    with pytest.raises(HTTPException) as exc:
        asyncio.run(oauth_service.consume_oauth_handoff(code))
    assert exc.value.status_code == 401


def test_handoff_preserves_mfa_requirement(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)
    code = asyncio.run(
        oauth_service.create_oauth_handoff(
            "mfa-challenge",
            "user-1",
            False,
            requires_2fa=True,
        )
    )
    payload = asyncio.run(oauth_service.consume_oauth_handoff(code))
    assert payload["token"] == "mfa-challenge"
    assert payload["requires_2fa"] is True


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


def test_json_oauth_callback_returns_mfa_challenge_without_access_cookie():
    user = User(
        id=uuid.uuid4(),
        email="mfa-oauth@example.com",
        password_hash="unused",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="MFA OAuth",
        is_2fa_enabled=True,
    )
    response = _build_sso_response(
        _json_request(),
        "purpose-bound-mfa-token",
        user,
        "",
        "http://127.0.0.1:3001",
        "attempt-123",
        "google",
        requires_2fa=True,
        is_new_registration=False,
    )
    body = json.loads(response.body)
    assert body == {
        "require_2fa": True,
        "mfa_token": "purpose-bound-mfa-token",
        "is_new_registration": False,
    }
    assert "set-cookie" not in response.headers


def test_oauth_handoff_exchange_cannot_bypass_existing_local_mfa(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(authentication, "get_async_redis", lambda: redis)
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)
    user = User(
        id=uuid.uuid4(),
        email="existing-mfa@example.com",
        password_hash="unused",
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Existing MFA",
        is_2fa_enabled=True,
        totp_secret_encrypted=encrypt_totp_secret("JBSWY3DPEHPK3PXP"),
        auth_version=0,
    )

    completion = asyncio.run(complete_authentication(user))
    assert completion.requires_2fa is True
    code = asyncio.run(
        oauth_service.create_oauth_handoff(
            completion.token,
            str(user.id),
            False,
            requires_2fa=True,
        )
    )
    response = asyncio.run(
        exchange_oauth_handoff(
            OAuthHandoffExchangeRequest(code=code),
            ExistingUserDb(user),
        )
    )
    body = json.loads(response.body)
    assert body["require_2fa"] is True
    assert body["mfa_token"] == completion.token
    assert "token" not in body
    assert "set-cookie" not in response.headers


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
