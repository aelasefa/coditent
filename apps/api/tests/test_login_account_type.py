"""HTTP regression tests: wrong login tabs never issue cookies or MFA challenges."""
import uuid
from datetime import timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.database import get_db
from app.limiter import limiter
from app.models import User, UserRole
from app.routers import auth, two_factor
from app.services import authentication
from app.utils.jwt import create_trusted_device_token, verify_mfa_token


class FakeRedis:
    def __init__(self):
        self.values = {}

    async def set(self, key, value, ex=None, nx=False):
        self.values[key] = value
        return True

    async def get(self, key):
        return self.values.get(key)

    async def getdel(self, key):
        return self.values.pop(key, None)


@pytest.fixture
def login_client(monkeypatch):
    user = User(
        id=uuid.uuid4(), email="login@example.com", full_name="Login User",
        password_hash="stub", role=UserRole.CANDIDATE, is_active=True,
        is_approved=True, is_2fa_enabled=False, auth_version=0,
    )

    class FakeDB:
        commits = 0

        async def execute(self, statement):
            return self

        def scalar_one_or_none(self):
            return user

        async def commit(self):
            self.commits += 1

    db = FakeDB()
    redis = FakeRedis()
    monkeypatch.setattr(authentication, "get_async_redis", lambda: redis)
    monkeypatch.setattr(auth, "verify_password_and_rehash", lambda password, stored: (password == "correct", None))
    monkeypatch.setattr(two_factor, "consume_second_factor", lambda account, code: "totp" if code == "123456" else None)
    monkeypatch.setattr(limiter, "enabled", False)
    app = FastAPI()
    app.state.limiter = limiter
    app.include_router(auth.router, prefix="/auth")
    app.include_router(two_factor.router, prefix="/auth/2fa")

    async def fake_db():
        yield db

    app.dependency_overrides[get_db] = fake_db
    with TestClient(app) as client:
        yield client, user, redis, db


def payload(account_type):
    return {"email": "login@example.com", "password": "correct", "account_type": account_type}


@pytest.mark.parametrize("role,tab", [
    (UserRole.CANDIDATE, "recruiter"),
    (UserRole.RECRUITER, "candidate"),
    (UserRole.COMPANY_USER, "candidate"),
    (UserRole.ADMIN, "candidate"),
    (UserRole.PLATFORM_ADMIN, "recruiter"),
])
@pytest.mark.parametrize("mfa", [False, True])
def test_wrong_tab_does_not_authenticate(login_client, role, tab, mfa):
    client, user, redis, db = login_client
    user.role = role
    user.is_2fa_enabled = mfa
    response = client.post("/auth/login", json={**payload(tab), "trusted_device_token": "unused"})
    assert response.status_code == 403
    assert "This account" in response.json()["detail"]
    assert "set-cookie" not in response.headers
    assert "token" not in response.json()
    assert "mfa_token" not in response.json()
    assert not redis.values
    assert db.commits == 0


@pytest.mark.parametrize("role,tab", [
    (UserRole.CANDIDATE, "candidate"),
    (UserRole.RECRUITER, "recruiter"),
    (UserRole.COMPANY_USER, "recruiter"),
])
@pytest.mark.parametrize("mfa", [False, True])
def test_correct_tab_can_complete_login_and_mfa(login_client, role, tab, mfa):
    client, user, redis, db = login_client
    user.role = role
    user.is_2fa_enabled = mfa
    if role == UserRole.COMPANY_USER:
        user.company_id = uuid.uuid4()
        user.company_role = "OWNER"
    response = client.post("/auth/login", json=payload(tab))
    assert response.status_code == 200
    if mfa:
        assert "set-cookie" not in response.headers
        challenge = response.json()["mfa_token"]
        assert verify_mfa_token(challenge)["account_type"] == tab
        response = client.post("/auth/2fa/verify", json={"mfa_token": challenge, "code": "123456"})
        assert response.status_code == 200
        assert not redis.values
    assert response.json()["user"]["role"] == role.value
    assert "token" in response.json()
    assert "set-cookie" in response.headers


def test_mfa_rechecks_bound_account_type(login_client):
    client, user, redis, db = login_client
    user.is_2fa_enabled = True
    response = client.post("/auth/login", json=payload("candidate"))
    challenge = response.json()["mfa_token"]
    user.role = UserRole.RECRUITER
    response = client.post("/auth/2fa/verify", json={"mfa_token": challenge, "code": "123456"})
    assert response.status_code == 401
    assert "set-cookie" not in response.headers
    assert db.commits == 0


def test_invalid_password_does_not_disclose_account_type(login_client):
    client, user, redis, db = login_client
    response = client.post("/auth/login", json={**payload("recruiter"), "password": "wrong"})
    assert response.status_code == 401
    assert response.json()["detail"] == "Invalid credentials"
    assert "set-cookie" not in response.headers


def test_valid_trusted_device_cannot_bypass_the_selected_tab(login_client):
    client, user, redis, db = login_client
    user.is_2fa_enabled = True
    trusted = create_trusted_device_token(
        str(user.id), factor=authentication.factor_fingerprint(user),
        auth_version=0, expires_delta=timedelta(days=30),
    )
    response = client.post("/auth/login", json={**payload("recruiter"), "trusted_device_token": trusted})
    assert response.status_code == 403
    assert "set-cookie" not in response.headers
    assert not redis.values
    response = client.post("/auth/login", json={**payload("candidate"), "trusted_device_token": trusted})
    assert response.status_code == 200
    assert "token" in response.json()
    assert "mfa_token" not in response.json()


def test_invalid_account_type_is_rejected(login_client):
    client, user, redis, db = login_client
    response = client.post("/auth/login", json=payload("admin"))
    assert response.status_code == 422
    assert "set-cookie" not in response.headers


def test_existing_shared_api_clients_remain_compatible(login_client):
    client, user, redis, db = login_client
    response = client.post("/auth/login", json={"email": "login@example.com", "password": "correct"})
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "CANDIDATE"
