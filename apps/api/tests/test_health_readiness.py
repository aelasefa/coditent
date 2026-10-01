from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock

import httpx
import pytest
from fastapi import FastAPI

from app import health


def _request(path: str) -> httpx.Response:
    async def run() -> httpx.Response:
        app = FastAPI()
        app.include_router(health.router)
        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(
            transport=transport, base_url="http://test"
        ) as client:
            return await client.get(path)

    return asyncio.run(run())


@pytest.fixture(autouse=True)
def bounded_probe_timeout(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(health, "_readiness_timeout_seconds", lambda: 0.1)


def _mock_probes(
    monkeypatch: pytest.MonkeyPatch,
    *,
    database: bool = True,
    redis: bool = True,
    worker: bool = True,
) -> None:
    monkeypatch.setattr(health, "_probe_database", AsyncMock(return_value=database))
    monkeypatch.setattr(health, "_probe_redis", AsyncMock(return_value=redis))
    monkeypatch.setattr(health, "_probe_worker", AsyncMock(return_value=worker))


def test_health_is_pure_liveness(monkeypatch: pytest.MonkeyPatch) -> None:
    database = AsyncMock(side_effect=AssertionError("must not probe database"))
    redis = AsyncMock(side_effect=AssertionError("must not probe redis"))
    worker = AsyncMock(side_effect=AssertionError("must not probe worker"))
    monkeypatch.setattr(health, "_probe_database", database)
    monkeypatch.setattr(health, "_probe_redis", redis)
    monkeypatch.setattr(health, "_probe_worker", worker)

    response = _request("/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    database.assert_not_awaited()
    redis.assert_not_awaited()
    worker.assert_not_awaited()


def test_ready_reports_all_components(monkeypatch: pytest.MonkeyPatch) -> None:
    _mock_probes(monkeypatch)

    response = _request("/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ready",
        "components": {"database": "ok", "redis": "ok", "worker": "ok"},
    }


def test_ready_returns_safe_503_when_database_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    secret_detail = "postgresql://private-user:private-password@example.invalid/db"
    monkeypatch.setattr(
        health,
        "_probe_database",
        AsyncMock(side_effect=RuntimeError(secret_detail)),
    )
    monkeypatch.setattr(health, "_probe_redis", AsyncMock(return_value=True))
    monkeypatch.setattr(health, "_probe_worker", AsyncMock(return_value=True))

    response = _request("/ready")

    assert response.status_code == 503
    assert response.json() == {
        "status": "unavailable",
        "components": {
            "database": "unavailable",
            "redis": "ok",
            "worker": "ok",
        },
    }
    assert secret_detail not in response.text


@pytest.mark.parametrize(
    ("redis_available", "worker_available", "expected"),
    [
        (False, False, {"redis": "unavailable", "worker": "unavailable"}),
        (True, False, {"redis": "ok", "worker": "unavailable"}),
    ],
)
def test_ready_rejects_redis_or_stale_worker(
    monkeypatch: pytest.MonkeyPatch,
    redis_available: bool,
    worker_available: bool,
    expected: dict[str, str],
) -> None:
    _mock_probes(
        monkeypatch,
        redis=redis_available,
        worker=worker_available,
    )

    response = _request("/ready")

    assert response.status_code == 503
    components = response.json()["components"]
    assert components["database"] == "ok"
    assert components["redis"] == expected["redis"]
    assert components["worker"] == expected["worker"]


def test_ready_probe_timeout_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    async def slow_database() -> bool:
        await asyncio.sleep(0.2)
        return True

    monkeypatch.setattr(health, "_readiness_timeout_seconds", lambda: 0.01)
    monkeypatch.setattr(health, "_probe_database", slow_database)
    monkeypatch.setattr(health, "_probe_redis", AsyncMock(return_value=True))
    monkeypatch.setattr(health, "_probe_worker", AsyncMock(return_value=True))

    response = _request("/ready")

    assert response.status_code == 503
    assert response.json()["components"]["database"] == "unavailable"


def test_worker_heartbeat_uses_ttl_and_freshness_marker() -> None:
    class FakeRedis:
        def __init__(self) -> None:
            self.value: object = None
            self.calls: list[tuple[str, str, int]] = []

        def set(self, name: str, value: str, *, ex: int) -> object:
            self.value = value
            self.calls.append((name, value, ex))
            return True

        def get(self, name: str) -> object:
            assert name == health.WORKER_HEARTBEAT_KEY
            return self.value

    redis = FakeRedis()
    assert health.worker_heartbeat_is_fresh_sync(redis) is False

    health.record_worker_heartbeat(redis, ttl_seconds=30)

    assert redis.calls == [(health.WORKER_HEARTBEAT_KEY, "alive", 30)]
    assert health.worker_heartbeat_is_fresh_sync(redis) is True
