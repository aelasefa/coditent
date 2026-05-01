from __future__ import annotations

import redis
import redis.asyncio as redis_async

from app.config import settings

_async_client: redis_async.Redis | None = None
_sync_client: redis.Redis | None = None


def get_async_redis() -> redis_async.Redis:
    global _async_client
    if _async_client is None:
        _async_client = redis_async.from_url(settings.redis_url, decode_responses=True)
    return _async_client


def get_sync_redis() -> redis.Redis:
    global _sync_client
    if _sync_client is None:
        _sync_client = redis.Redis.from_url(settings.redis_url, decode_responses=True)
    return _sync_client
