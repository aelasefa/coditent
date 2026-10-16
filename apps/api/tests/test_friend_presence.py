from __future__ import annotations

import uuid

import pytest

import app.services.presence as presence


class FakePipeline:
    def __init__(self, redis):
        self.redis = redis
        self.operations = []

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_args):
        return None

    def zremrangebyscore(self, key, _minimum, maximum):
        self.operations.append(("expire", key, float(maximum)))
        return self

    def zadd(self, key, values):
        self.operations.append(("add", key, values))
        return self

    def expire(self, key, seconds):
        self.operations.append(("ttl", key, seconds))
        return self

    def zrem(self, key, member):
        self.operations.append(("remove", key, member))
        return self

    def zcard(self, key):
        self.operations.append(("count", key))
        return self

    async def execute(self):
        results = []
        for operation in self.operations:
            action, key, *arguments = operation
            values = self.redis.values.setdefault(key, {})
            if action == "expire":
                cutoff = arguments[0]
                for member in [member for member, score in values.items() if score <= cutoff]:
                    values.pop(member)
                results.append(1)
            elif action == "add":
                values.update(arguments[0])
                results.append(1)
            elif action == "remove":
                results.append(1 if values.pop(arguments[0], None) is not None else 0)
            elif action == "count":
                results.append(len(values))
            else:
                results.append(True)
        return results


class FakeRedis:
    def __init__(self):
        self.values = {}

    def pipeline(self, **_kwargs):
        return FakePipeline(self)


@pytest.mark.asyncio
async def test_presence_supports_multiple_connections_and_expiry(monkeypatch):
    redis = FakeRedis()
    now = 1_000.0
    monkeypatch.setattr(presence, "get_async_redis", lambda: redis)
    monkeypatch.setattr(presence.time, "time", lambda: now)
    user_id = uuid.uuid4()

    await presence.touch_presence(user_id, "tab-one")
    await presence.touch_presence(user_id, "tab-two")
    assert await presence.is_online(user_id) is True
    assert await presence.remove_presence(user_id, "tab-one") is True
    assert await presence.is_online(user_id) is True
    assert await presence.remove_presence(user_id, "tab-two") is False
    assert await presence.is_online(user_id) is False

    await presence.touch_presence(user_id, "expired-tab")
    now += presence.PRESENCE_TTL_SECONDS + 1
    assert await presence.is_online(user_id) is False
