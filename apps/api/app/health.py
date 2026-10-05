from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from typing import Literal, Protocol

from fastapi import APIRouter
from fastapi.responses import JSONResponse


router = APIRouter()

WORKER_HEARTBEAT_KEY = "coditent:health:worker"
DISPATCHER_HEARTBEAT_KEY = "coditent:health:ai-dispatcher"

ComponentStatus = Literal["ok", "unavailable"]


class _SyncRedisClient(Protocol):
    def set(self, name: str, value: str, *, ex: int) -> object: ...

    def get(self, name: str) -> object: ...


def _readiness_timeout_seconds() -> float:
    # Import lazily so this module and its endpoint contract can be tested
    # without constructing production database or Redis clients.
    from app.config import settings

    return settings.readiness_check_timeout_seconds


async def _probe_database() -> bool:
    from sqlalchemy import text

    from app.database import engine

    async with engine.connect() as connection:
        await connection.execute(text("SELECT 1"))
    return True


async def _probe_redis() -> bool:
    from app.cache import get_async_redis

    return bool(await get_async_redis().ping())


async def _probe_worker() -> bool:
    from app.cache import get_async_redis

    # The key has a TTL and is refreshed by Celery's own heartbeat signal. A
    # dead or disconnected worker therefore becomes unavailable automatically.
    return await get_async_redis().get(WORKER_HEARTBEAT_KEY) is not None


async def _probe_dispatcher() -> bool:
    from app.cache import get_async_redis

    return await get_async_redis().get(DISPATCHER_HEARTBEAT_KEY) is not None


async def _bounded_status(probe: Callable[[], Awaitable[bool]]) -> ComponentStatus:
    try:
        available = await asyncio.wait_for(
            probe(), timeout=_readiness_timeout_seconds()
        )
    except Exception:
        # Readiness is intentionally diagnostic but not a source of connection
        # strings, credentials, provider responses, or exception details.
        return "unavailable"
    return "ok" if available else "unavailable"


async def readiness_payload() -> tuple[int, dict[str, object]]:
    database, redis, worker, dispatcher = await asyncio.gather(
        _bounded_status(_probe_database),
        _bounded_status(_probe_redis),
        _bounded_status(_probe_worker),
        _bounded_status(_probe_dispatcher),
    )
    components: dict[str, ComponentStatus] = {
        "database": database,
        "redis": redis,
        "worker": worker,
        "ai_dispatcher": dispatcher,
    }
    ready = all(value == "ok" for value in components.values())
    return (
        200 if ready else 503,
        {
            "status": "ready" if ready else "unavailable",
            "components": components,
        },
    )


def record_worker_heartbeat(
    client: _SyncRedisClient | None = None,
    ttl_seconds: int | None = None,
) -> None:
    """Refresh the bounded worker-freshness marker from the Celery process."""
    if client is None:
        from app.cache import get_sync_redis

        client = get_sync_redis()
    if ttl_seconds is None:
        from app.config import settings

        ttl_seconds = settings.worker_heartbeat_ttl_seconds

    client.set(
        WORKER_HEARTBEAT_KEY,
        "alive",
        ex=ttl_seconds,
    )


def worker_heartbeat_is_fresh_sync(client: _SyncRedisClient | None = None) -> bool:
    """Docker worker healthcheck helper; never expose connection exceptions."""
    try:
        if client is None:
            from app.cache import get_sync_redis

            client = get_sync_redis()
        return client.get(WORKER_HEARTBEAT_KEY) is not None
    except Exception:
        return False


def dispatcher_heartbeat_is_fresh_sync(client: _SyncRedisClient | None = None) -> bool:
    try:
        if client is None:
            from app.cache import get_sync_redis

            client = get_sync_redis()
        return client.get(DISPATCHER_HEARTBEAT_KEY) is not None
    except Exception:
        return False


@router.get("/health")
async def health() -> dict[str, str]:
    """Process liveness only; dependencies deliberately are not consulted."""
    return {"status": "ok"}


@router.get("/ready", response_class=JSONResponse)
async def ready() -> JSONResponse:
    """Dependency readiness with bounded, non-sensitive component status."""
    status_code, payload = await readiness_payload()
    return JSONResponse(status_code=status_code, content=payload)
