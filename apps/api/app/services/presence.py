"""Shared, multi-connection candidate presence backed by Redis."""

from __future__ import annotations

import hashlib
import time
from datetime import datetime
from uuid import UUID

from redis.exceptions import RedisError

from app.cache import get_async_redis


PRESENCE_TTL_SECONDS = 75


def _key(user_id: UUID) -> str:
    return f"presence:candidate:{user_id}"


def _member(connection_id: str) -> str:
    return hashlib.sha256(connection_id.encode("utf-8")).hexdigest()


async def touch_presence(user_id: UUID, connection_id: str) -> None:
    """Refresh one tab/socket without affecting the user's other connections."""
    redis = get_async_redis()
    now = time.time()
    key = _key(user_id)
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, "-inf", now)
            pipe.zadd(key, {_member(connection_id): now + PRESENCE_TTL_SECONDS})
            pipe.expire(key, PRESENCE_TTL_SECONDS * 2)
            await pipe.execute()
    except RedisError:
        # Presence is advisory. Authentication and messaging remain fail-closed
        # in their own services if Redis is unavailable.
        return


async def remove_presence(user_id: UUID, connection_id: str) -> bool:
    """Remove one connection and return whether another connection is active."""
    redis = get_async_redis()
    key = _key(user_id)
    now = time.time()
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.zrem(key, _member(connection_id))
            pipe.zremrangebyscore(key, "-inf", now)
            pipe.zcard(key)
            results = await pipe.execute()
        return bool(results[-1])
    except RedisError:
        return False


async def is_online(user_id: UUID) -> bool:
    redis = get_async_redis()
    key = _key(user_id)
    now = time.time()
    try:
        async with redis.pipeline(transaction=True) as pipe:
            pipe.zremrangebyscore(key, "-inf", now)
            pipe.zcard(key)
            results = await pipe.execute()
        return bool(results[-1])
    except RedisError:
        return False


async def presence_map(user_ids: set[UUID]) -> dict[UUID, bool]:
    return {user_id: await is_online(user_id) for user_id in user_ids}


def safe_last_seen(value: datetime | None) -> datetime | None:
    """Central marker for the deliberately coarse public presence timestamp."""
    return value
