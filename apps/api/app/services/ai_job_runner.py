"""Execute durable AI jobs with leases, quotas, retries, and stale-result rejection."""
from __future__ import annotations

import asyncio
import json
from contextlib import suppress
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models import AIJob
from app.services.ai_controls import AIAdmissionError, ai_capacity
from app.services.ai_jobs import (
    AIJobLeaseLostError,
    claim_ai_job,
    complete_ai_job,
    current_source_fingerprint,
    fail_ai_job,
    heartbeat_ai_job,
    mark_ai_job_stale,
)


async def _perform_job(db: AsyncSession, job: AIJob) -> dict[str, Any]:
    try:
        payload = json.loads(job.payload)
    except (TypeError, ValueError) as exc:
        raise ValueError("AI_JOB_PAYLOAD_INVALID") from exc

    if job.kind == "application_screen" and job.resource_id:
        from app.services.screening import screen_application

        result = await screen_application(db, job.resource_id, commit=False)
        return {"score": result["score"]}

    if job.kind == "match_score" and job.actor_id and job.resource_id:
        from app.services.match_scoring import score_single_match

        return await score_single_match(
            db,
            job.actor_id,
            job.resource_id,
            commit=False,
        )

    if job.kind == "recommendation_rank" and job.actor_id:
        from app.services.recommendation_jobs import generate_recommendations_for_candidate

        rows = await generate_recommendations_for_candidate(
            db,
            job.actor_id,
            payload.get("criteria", {}),
            commit=False,
        )
        return {"recommendation_count": len(rows)}

    raise ValueError("AI_JOB_KIND_INVALID")


async def _fresh_source_fingerprint(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
) -> str | None:
    async with session_factory() as verify_db:
        job = (
            await verify_db.execute(select(AIJob).where(AIJob.id == job_id))
        ).scalar_one_or_none()
        if job is None:
            return None
        return await current_source_fingerprint(verify_db, job)


async def _lease_heartbeat(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
    worker_id: str,
    capacity_lease: Any,
    stopped: asyncio.Event,
    lease_lost: asyncio.Event,
) -> None:
    interval = max(5.0, min(30.0, settings.ai_job_lease_seconds / 3))
    while True:
        try:
            await asyncio.wait_for(stopped.wait(), timeout=interval)
            return
        except TimeoutError:
            pass
        try:
            async with session_factory() as heartbeat_db:
                job_ok = await heartbeat_ai_job(
                    heartbeat_db,
                    job_id,
                    worker_id=worker_id,
                )
            capacity_ok = await capacity_lease.renew()
        except Exception:
            lease_lost.set()
            return
        if not job_ok or not capacity_ok:
            lease_lost.set()
            return


def _safe_error_code(exc: Exception) -> str:
    if isinstance(exc, AIAdmissionError):
        return exc.code[:80]
    if isinstance(exc, TimeoutError):
        return "AI_PROVIDER_TIMEOUT"
    message = str(exc)
    if message.startswith("AI_") and len(message) <= 80:
        return message
    return f"AI_JOB_{type(exc).__name__.upper()}"[:80]


async def execute_ai_job(
    session_factory: async_sessionmaker[AsyncSession],
    job_id: UUID,
    *,
    worker_id: str,
) -> str:
    """Execute one broker delivery. Duplicate deliveries are harmless."""
    async with session_factory() as db:
        job = await claim_ai_job(db, job_id, worker_id=worker_id)
        if job is None:
            return "not_claimed"

        current_fingerprint = await current_source_fingerprint(db, job)
        if current_fingerprint != job.source_fingerprint:
            await mark_ai_job_stale(db, job.id, worker_id=worker_id)
            return "stale"
        if job.actor_id is None:
            return await fail_ai_job(
                db,
                job.id,
                worker_id=worker_id,
                error_code="AI_JOB_ACTOR_MISSING",
                retryable=False,
            )

        stopped = asyncio.Event()
        lease_lost = asyncio.Event()
        heartbeat_task: asyncio.Task[None] | None = None
        try:
            async with ai_capacity(
                job.kind,
                user_id=job.actor_id,
                company_id=job.company_id,
                lease_seconds=settings.ai_job_lease_seconds,
            ) as capacity_lease:
                heartbeat_task = asyncio.create_task(
                    _lease_heartbeat(
                        session_factory,
                        job.id,
                        worker_id,
                        capacity_lease,
                        stopped,
                        lease_lost,
                    )
                )
                result = await asyncio.wait_for(
                    _perform_job(db, job),
                    timeout=settings.ai_provider_timeout_seconds,
                )
                stopped.set()
                await heartbeat_task
                heartbeat_task = None
                if lease_lost.is_set():
                    raise AIJobLeaseLostError("AI job lease was lost during execution")

            await db.flush()
            fresh_fingerprint = await _fresh_source_fingerprint(session_factory, job.id)
            if fresh_fingerprint != job.source_fingerprint:
                await db.rollback()
                await mark_ai_job_stale(db, job.id, worker_id=worker_id)
                return "stale"
            await complete_ai_job(db, job.id, worker_id=worker_id, result=result)
            return "completed"
        except AIJobLeaseLostError:
            await db.rollback()
            return "lease_lost"
        except Exception as exc:
            await db.rollback()
            try:
                outcome = await fail_ai_job(
                    db,
                    job.id,
                    worker_id=worker_id,
                    error_code=_safe_error_code(exc),
                    retryable=True,
                )
                return outcome
            except AIJobLeaseLostError:
                return "lease_lost"
        finally:
            stopped.set()
            if heartbeat_task is not None:
                heartbeat_task.cancel()
                with suppress(asyncio.CancelledError):
                    await heartbeat_task
