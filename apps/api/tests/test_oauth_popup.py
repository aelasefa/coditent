import asyncio
import json
import uuid
from datetime import timedelta
from types import SimpleNamespace
from urllib.parse import parse_qs, urlparse

import pytest
from fastapi import HTTPException
from pydantic import ValidationError
from starlette.requests import Request
from starlette.responses import Response

from app.models import CandidateProfile, User, UserRole
from app.routers.auth import (
    _build_sso_response,
    _create_sso_candidate,
    _legacy_oauth_link_matches,
    _resolve_oauth_user,
    exchange_oauth_handoff,
)
from app.schemas import OAuthHandoffExchangeRequest, OAuthIdentityActionRequest, RegisterRequest
from app.services import auth_cookies, authentication, oauth_service
from app.services.authentication import complete_authentication, factor_fingerprint
from app.services.oauth_service import OAuthIdentity
from app.services.two_factor import encrypt_totp_secret
from app.utils.jwt import create_trusted_device_token


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


class OAuthEmailCollisionDb:
    def __init__(self, user: User):
        self.user = user
        self.calls = 0

    async def execute(self, _query):
        self.calls += 1
        if self.calls == 1:
            return SimpleNamespace(first=lambda: None)
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


def test_oauth_browser_cookie_uses_configured_public_path(monkeypatch):
    monkeypatch.setattr(
        auth_cookies.settings,
        "oauth_browser_cookie_path",
        "/api-proxy/auth/sso",
    )

    response = Response()
    auth_cookies.set_oauth_browser_cookie(response, "browser-id")
    cookies = response.headers.getlist("set-cookie")
    configured_cookie = next(
        cookie
        for cookie in cookies
        if "browser-id" in cookie and "Path=/api-proxy/auth/sso" in cookie
    )
    assert "SameSite=none" in configured_cookie
    assert any(
        "Path=/auth/sso" in cookie and "Max-Age=0" in cookie
        for cookie in cookies
    )

    response = Response()
    auth_cookies.clear_oauth_browser_cookie(response)
    cookies = response.headers.getlist("set-cookie")
    assert any("Path=/api-proxy/auth/sso" in cookie for cookie in cookies)
    assert any("Path=/auth/sso" in cookie for cookie in cookies)
    assert all("SameSite=none" in cookie for cookie in cookies)


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
    with pytest.raises(HTTPException, match="invalid_sso_state"):
        asyncio.run(
            oauth_service.consume_oauth_attempt(attempt.state, "google", None)
        )
    consumed = asyncio.run(
        oauth_service.consume_oauth_attempt(
            attempt.state,
            "google",
            None,
            allow_missing_browser_cookie=True,
        )
    )
    assert consumed.code_verifier == attempt.code_verifier
    with pytest.raises(HTTPException, match="invalid_sso_state"):
        asyncio.run(
            oauth_service.consume_oauth_attempt(
                attempt.state, "google", attempt.browser_id
            )
        )


def test_oauth_link_attempt_preserves_server_side_user_and_session_binding(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)
    monkeypatch.setattr(oauth_service.settings, "frontend_url", "http://localhost:3001")
    attempt = asyncio.run(
        oauth_service.create_oauth_attempt(
            "google",
            "http://localhost:3001",
            "link-attempt",
            None,
            purpose="oauth_link",
            link_user_id="user-123",
            session_id="session-456",
        )
    )
    consumed = asyncio.run(
        oauth_service.consume_oauth_attempt(attempt.state, "google", attempt.browser_id)
    )
    assert consumed.purpose == "oauth_link"
    assert consumed.link_user_id == "user-123"
    assert consumed.session_id == "session-456"
    with pytest.raises(HTTPException, match="invalid_sso_state"):
        asyncio.run(oauth_service.consume_oauth_attempt(attempt.state, "google", attempt.browser_id))


def test_google_id_token_requires_matching_nonce(monkeypatch):
    provider = oauth_service.OAuthProvider(
        name="google",
        client_id="client-id",
        client_secret="secret",
        authorization_url="https://accounts.google.com/auth",
        token_url="https://oauth2.googleapis.com/token",
        userinfo_url="https://www.googleapis.com/oauth2/v3/userinfo",
        scopes=("openid", "email"),
        issuer="https://accounts.google.com",
    )
    monkeypatch.setattr(
        oauth_service.google_id_token,
        "verify_oauth2_token",
        lambda *_args, **_kwargs: {
            "iss": "https://accounts.google.com",
            "sub": "stable-subject",
            "email": "user@example.com",
            "email_verified": True,
            "nonce": "correct-nonce",
        },
    )
    identity = asyncio.run(
        oauth_service.verify_google_id_token(provider, "signed-token", expected_nonce="correct-nonce")
    )
    assert identity.oauth_id == "stable-subject"
    with pytest.raises(HTTPException, match="sso_nonce_invalid"):
        asyncio.run(
            oauth_service.verify_google_id_token(provider, "signed-token", expected_nonce="wrong-nonce")
        )


def test_normal_google_login_never_implicitly_links_email_collision():
    user = User(
        id=uuid.uuid4(),
        email="existing@example.com",
        password_hash="real-password-hash",
        password_login_enabled=True,
        role=UserRole.CANDIDATE,
        is_approved=True,
        full_name="Existing User",
    )
    identity = OAuthIdentity(
        email=user.email,
        full_name=user.full_name,
        oauth_id="new-google-subject",
        avatar_url=None,
        provider="google",
        issuer="https://accounts.google.com",
        email_verified=True,
    )
    with pytest.raises(HTTPException, match="sso_link_confirmation_required"):
        asyncio.run(_resolve_oauth_user(OAuthEmailCollisionDb(user), _html_request(), identity))


def test_identity_action_payload_forbids_untrusted_fields():
    with pytest.raises(ValidationError):
        OAuthIdentityActionRequest(
            current_password="password",
            target_user_id=str(uuid.uuid4()),
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

    legacy_user = User(
        email=identity.email,
        full_name="Legacy Candidate",
        password_hash="unused",
        role=UserRole.CANDIDATE,
        oauth_provider="Google",
        oauth_id=identity.oauth_id,
    )
    assert _legacy_oauth_link_matches(legacy_user, identity) is True
    legacy_user.oauth_id = "different-provider-subject"
    assert _legacy_oauth_link_matches(legacy_user, identity) is False

    for invalid in (
        {**base, "email_verified": False},
        {**base, "sub": ""},
        {**base, "iss": "https://evil.example"},
    ):
        with pytest.raises(HTTPException):
            oauth_service._parse_identity_payload(provider, invalid)


def test_linkedin_authorization_binds_nonce_without_unsupported_pkce():
    provider = oauth_service.OAuthProvider(
        name="linkedin", client_id="client-id", client_secret="secret",
        authorization_url="https://www.linkedin.com/oauth/v2/authorization",
        token_url="https://www.linkedin.com/oauth/v2/accessToken",
        userinfo_url="https://api.linkedin.com/v2/userinfo",
        scopes=("openid", "profile", "email"), issuer="https://www.linkedin.com",
    )
    url = oauth_service.build_oauth_authorize_url(
        provider, "https://coditent.app/api-proxy/auth/sso/linkedin/callback",
        "signed-state", code_verifier="verifier", nonce="attempt-nonce",
    )
    params = parse_qs(urlparse(url).query)
    assert params["nonce"] == ["attempt-nonce"]
    assert params["state"] == ["signed-state"]
    assert "code_challenge" not in params


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


def test_oauth_handoff_accepts_matching_saved_trusted_device(monkeypatch):
    redis = FakeRedis()
    monkeypatch.setattr(authentication, "get_async_redis", lambda: redis)
    monkeypatch.setattr(oauth_service, "get_async_redis", lambda: redis)

    async def not_revoked(_token_id):
        return False

    monkeypatch.setattr(authentication, "_durable_trusted_device_revoked", not_revoked)
    monkeypatch.setattr(authentication, "_durable_session_revoked", not_revoked)
    user = User(
        id=uuid.uuid4(),
        email="trusted-oauth@example.com",
        password_hash="unused",
        role=UserRole.CANDIDATE,
        is_approved=True,
        is_active=True,
        full_name="Trusted OAuth",
        is_2fa_enabled=True,
        totp_secret_encrypted=encrypt_totp_secret("JBSWY3DPEHPK3PXP"),
        auth_version=0,
    )
    trusted_device = create_trusted_device_token(
        str(user.id),
        factor=factor_fingerprint(user),
        auth_version=0,
        expires_delta=timedelta(days=30),
    )
    completion = asyncio.run(complete_authentication(user))
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
            OAuthHandoffExchangeRequest(
                code=code,
                trusted_device_token=trusted_device,
            ),
            ExistingUserDb(user),
        )
    )

    body = json.loads(response.body)
    assert body["token"]
    assert "require_2fa" not in body
    assert "access_token=" in response.headers["set-cookie"]


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
    assert user.password_login_enabled is False
    profiles = [value for value in db.added if isinstance(value, CandidateProfile)]
    assert len(profiles) == 1
    assert profiles[0].user_id == user.id
