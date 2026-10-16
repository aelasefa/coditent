from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app import cache
from app.dependencies import get_current_user
from app.services import device_security
from app.utils.jwt import create_access_token


class FakeRedis:
    def __init__(self):
        self.devices = set()
        self.values = {}

    async def sadd(self, key, value):
        before = len(self.devices)
        self.devices.add((key, value))
        return int(len(self.devices) > before)

    async def expire(self, key, seconds):
        return True

    async def get(self, key):
        return self.values.get(key)


@pytest.mark.asyncio
async def test_new_device_email_is_escaped_and_sent_without_blocking(monkeypatch):
    fake_redis = FakeRedis()
    sent = []
    monkeypatch.setattr(device_security, "get_async_redis", lambda: fake_redis)
    monkeypatch.setattr(device_security, "send_email", lambda **kwargs: sent.append(kwargs))

    async def run_in_thread(func, **kwargs):
        return func(**kwargs)

    monkeypatch.setattr(device_security.asyncio, "to_thread", run_in_thread)
    user = SimpleNamespace(id=uuid4(), full_name="<script>name</script>", email="u@example.test")

    assert await device_security.check_and_notify_new_device(user, "<img src=x>", "192.0.2.8")
    assert len(sent) == 1
    assert "&lt;script&gt;name&lt;/script&gt;" in sent[0]["html"]
    assert "&lt;img src=x&gt;" in sent[0]["html"]
    assert "User-Agent:" in sent[0]["html"]
    assert not await device_security.check_and_notify_new_device(user, "<img src=x>", "192.0.2.8")
    assert len(sent) == 1


def test_device_fingerprint_uses_ipv4_and_ipv6_subnets():
    ua = "Example Browser"
    assert device_security.get_device_fingerprint(ua, "192.0.2.8") == device_security.get_device_fingerprint(ua, "192.0.2.99")
    assert device_security.get_device_fingerprint(ua, "2001:db8::1") == device_security.get_device_fingerprint(ua, "2001:db8::2")


class FakeDB:
    def __init__(self, user):
        self.user = user

    async def execute(self, _query):
        return SimpleNamespace(scalar_one_or_none=lambda: self.user)


@pytest.mark.asyncio
async def test_revoked_token_is_rejected_and_redis_error_fails_closed(monkeypatch):
    user_id = uuid4()
    user = SimpleNamespace(id=user_id)
    fake_redis = FakeRedis()
    fake_redis.values[f"user:{user_id}:revoked_before"] = "100.0"
    monkeypatch.setattr(cache, "get_async_redis", lambda: fake_redis)
    credentials = HTTPAuthorizationCredentials(
        scheme="Bearer",
        credentials=create_access_token({"sub": str(user_id), "iat": 100}),
    )

    with pytest.raises(HTTPException) as revoked:
        await get_current_user(FakeDB(user), credentials, None)
    assert revoked.value.status_code == 401

    async def unavailable(_key):
        raise ConnectionError("Redis unavailable")

    fake_redis.get = unavailable
    with pytest.raises(HTTPException) as unavailable_error:
        await get_current_user(FakeDB(user), credentials, None)
    assert unavailable_error.value.status_code == 503


@pytest.mark.asyncio
async def test_token_newer_than_revocation_marker_remains_valid(monkeypatch):
    user_id = uuid4()
    user = SimpleNamespace(id=user_id)
    token = create_access_token({"sub": str(user_id)})
    from app.utils.jwt import verify_token

    token_iat = float(verify_token(token)["iat"])
    fake_redis = FakeRedis()
    fake_redis.values[f"user:{user_id}:revoked_before"] = str(token_iat - 0.001)
    monkeypatch.setattr(cache, "get_async_redis", lambda: fake_redis)
    credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)

    assert await get_current_user(FakeDB(user), credentials, None) is user
