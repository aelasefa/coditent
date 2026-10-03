"""Shared fail-closed admission controls for every AI provider call."""
from __future__ import annotations

import time
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import AsyncIterator
from uuid import UUID

from app.cache import get_async_redis
from app.config import settings


class AIAdmissionError(RuntimeError):
    def __init__(self, code: str, *, retry_after: int = 60) -> None:
        super().__init__(code)
        self.code = code
        self.retry_after = retry_after


class AIControlUnavailable(AIAdmissionError):
    def __init__(self) -> None:
        super().__init__("AI_CONTROL_UNAVAILABLE", retry_after=30)


_ACQUIRE_SCRIPT = r"""
local now = tonumber(ARGV[1])
local lease_until = tonumber(ARGV[2])
local lease_id = ARGV[3]
local cost = tonumber(ARGV[4])
local global_budget = tonumber(ARGV[5])
local user_budget = tonumber(ARGV[6])
local company_budget = tonumber(ARGV[7])
local global_concurrency = tonumber(ARGV[8])
local user_concurrency = tonumber(ARGV[9])
local counter_ttl = tonumber(ARGV[10])
local has_company = tonumber(ARGV[11])

redis.call('ZREMRANGEBYSCORE', KEYS[4], '-inf', now)
redis.call('ZREMRANGEBYSCORE', KEYS[5], '-inf', now)

if tonumber(redis.call('GET', KEYS[1]) or '0') + cost > global_budget then
  return {'GLOBAL_BUDGET_EXCEEDED'}
end
if tonumber(redis.call('GET', KEYS[2]) or '0') + cost > user_budget then
  return {'USER_QUOTA_EXCEEDED'}
end
if has_company == 1 and tonumber(redis.call('GET', KEYS[3]) or '0') + cost > company_budget then
  return {'COMPANY_QUOTA_EXCEEDED'}
end
if tonumber(redis.call('ZCARD', KEYS[4])) >= global_concurrency then
  return {'GLOBAL_CONCURRENCY_EXCEEDED'}
end
if tonumber(redis.call('ZCARD', KEYS[5])) >= user_concurrency then
  return {'USER_CONCURRENCY_EXCEEDED'}
end

redis.call('INCRBY', KEYS[1], cost)
redis.call('EXPIRE', KEYS[1], counter_ttl)
redis.call('INCRBY', KEYS[2], cost)
redis.call('EXPIRE', KEYS[2], counter_ttl)
if has_company == 1 then
  redis.call('INCRBY', KEYS[3], cost)
  redis.call('EXPIRE', KEYS[3], counter_ttl)
end
redis.call('ZADD', KEYS[4], lease_until, lease_id)
redis.call('EXPIRE', KEYS[4], counter_ttl)
redis.call('ZADD', KEYS[5], lease_until, lease_id)
redis.call('EXPIRE', KEYS[5], counter_ttl)
return {'OK'}
"""

_RENEW_SCRIPT = r"""
if redis.call('ZSCORE', KEYS[1], ARGV[1]) == false then return 0 end
if redis.call('ZSCORE', KEYS[2], ARGV[1]) == false then return 0 end
redis.call('ZADD', KEYS[1], tonumber(ARGV[2]), ARGV[1])
redis.call('ZADD', KEYS[2], tonumber(ARGV[2]), ARGV[1])
return 1
"""

_RELEASE_SCRIPT = r"""
redis.call('ZREM', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
return 1
"""


def operation_cost(operation: str) -> int:
    return {
        "profile_headline": 1,
        "profile_bio": 2,
        "cv_extract": 3,
        "match_score": 2,
        "recommendation_rank": 5,
        "application_screen": 4,
        "assessment_grade": 4,
    }.get(operation, 1)


def _counter_ttl_seconds() -> int:
    now = datetime.now(UTC)
    tomorrow = (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return max(60, int((tomorrow - now).total_seconds()) + 60)


@dataclass(slots=True)
class AILease:
    lease_id: str
    user_id: UUID
    global_key: str
    user_key: str
    lease_seconds: int
    _released: bool = False

    async def renew(self) -> bool:
        if self._released:
            return False
        expires_ms = int((time.time() + self.lease_seconds) * 1_000)
        try:
            result = await get_async_redis().eval(
                _RENEW_SCRIPT,
                2,
                self.global_key,
                self.user_key,
                self.lease_id,
                expires_ms,
            )
        except Exception as exc:
            raise AIControlUnavailable() from exc
        return bool(int(result))

    async def release(self) -> None:
        if self._released:
            return
        self._released = True
        try:
            await get_async_redis().eval(
                _RELEASE_SCRIPT,
                2,
                self.global_key,
                self.user_key,
                self.lease_id,
            )
        except Exception:
            # An expiring ZSET lease is the safety net when Redis becomes
            # unavailable between admission and release.
            return


async def acquire_ai_capacity(
    operation: str,
    *,
    user_id: UUID,
    company_id: UUID | None = None,
    cost: int | None = None,
    lease_seconds: int | None = None,
) -> AILease:
    """Atomically consume quota/budget and reserve a concurrency slot."""
    charged_units = cost if cost is not None else operation_cost(operation)
    if charged_units < 1:
        raise ValueError("AI operation cost must be positive")
    now = datetime.now(UTC)
    day = now.strftime("%Y%m%d")
    namespace = "coditent:ai"
    lease_id = uuid.uuid4().hex
    lease_ttl = lease_seconds or int(getattr(settings, "ai_job_lease_seconds", 180))
    now_ms = int(time.time() * 1_000)
    lease_until_ms = now_ms + lease_ttl * 1_000
    global_concurrency_key = f"{namespace}:concurrency:global"
    user_concurrency_key = f"{namespace}:concurrency:user:{user_id}"
    keys = (
        f"{namespace}:budget:{day}",
        f"{namespace}:quota:user:{user_id}:{day}",
        f"{namespace}:quota:company:{company_id or 'none'}:{day}",
        global_concurrency_key,
        user_concurrency_key,
    )
    try:
        result = await get_async_redis().eval(
            _ACQUIRE_SCRIPT,
            len(keys),
            *keys,
            now_ms,
            lease_until_ms,
            lease_id,
            charged_units,
            int(getattr(settings, "ai_global_daily_budget_units", 5_000)),
            int(getattr(settings, "ai_user_daily_quota_units", 60)),
            int(getattr(settings, "ai_company_daily_quota_units", 500)),
            int(getattr(settings, "ai_global_concurrency", 8)),
            int(getattr(settings, "ai_user_concurrency", 2)),
            _counter_ttl_seconds(),
            1 if company_id else 0,
        )
    except Exception as exc:
        raise AIControlUnavailable() from exc

    code_value = result[0] if isinstance(result, (list, tuple)) and result else result
    if isinstance(code_value, bytes):
        code_value = code_value.decode("utf-8", "replace")
    code = str(code_value)
    if code != "OK":
        retry_after = _counter_ttl_seconds() if "QUOTA" in code or "BUDGET" in code else 15
        raise AIAdmissionError(code, retry_after=retry_after)
    return AILease(
        lease_id=lease_id,
        user_id=user_id,
        global_key=global_concurrency_key,
        user_key=user_concurrency_key,
        lease_seconds=lease_ttl,
    )


@asynccontextmanager
async def ai_capacity(
    operation: str,
    *,
    user_id: UUID,
    company_id: UUID | None = None,
    cost: int | None = None,
    lease_seconds: int | None = None,
) -> AsyncIterator[AILease]:
    lease = await acquire_ai_capacity(
        operation,
        user_id=user_id,
        company_id=company_id,
        cost=cost,
        lease_seconds=lease_seconds,
    )
    try:
        yield lease
    finally:
        await lease.release()
