from __future__ import annotations

import asyncio
from weakref import WeakKeyDictionary

import redis
import redis.asyncio as redis_async

from app.config import settings

_async_clients: WeakKeyDictionary[asyncio.AbstractEventLoop, redis_async.Redis] = WeakKeyDictionary()
_sync_client: redis.Redis | None = None


def get_async_redis() -> redis_async.Redis:
    # redis.asyncio connections are bound to the event loop that opened them.
    # A process can legitimately host more than one loop (test runners and
    # some management commands); reusing a connection from a closed loop
    # raises "Future attached to a different loop" and can break auth checks.
    loop = asyncio.get_running_loop()
    client = _async_clients.get(loop)
    if client is None:
        timeout = getattr(settings, "readiness_check_timeout_seconds", 2.0)
        client = redis_async.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=timeout,
            socket_timeout=timeout,
        )
        _async_clients[loop] = client
    return client


def get_sync_redis() -> redis.Redis:
    global _sync_client
    if _sync_client is None:
        timeout = getattr(settings, "readiness_check_timeout_seconds", 2.0)
        _sync_client = redis.Redis.from_url(
            settings.redis_url,
            decode_responses=True,
            socket_connect_timeout=timeout,
            socket_timeout=timeout,
        )
    return _sync_client
