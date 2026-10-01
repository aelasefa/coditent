from __future__ import annotations

import asyncio
import json
import time
import uuid

from celery import Celery
from celery.signals import heartbeat_sent, worker_ready

from app.cache import get_sync_redis
from app.config import settings
from app.database import AsyncSessionLocal, engine
from app.health import record_worker_heartbeat
from app.observability import get_logger
from app.services.recommendation_jobs import generate_recommendations_for_candidate, make_cache_key

celery_app = Celery("coditent", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
)

logger = get_logger("ai")
_last_worker_heartbeat_warning_at = 0.0


@worker_ready.connect(weak=False)
@heartbeat_sent.connect(weak=False)
def _refresh_worker_heartbeat(**_: object) -> None:
    global _last_worker_heartbeat_warning_at
    try:
        record_worker_heartbeat()
    except Exception as exc:
        now = time.monotonic()
        if now - _last_worker_heartbeat_warning_at >= 60:
            logger.warning(
                "worker_heartbeat_publish_failed",
                exception_type=type(exc).__name__,
            )
            _last_worker_heartbeat_warning_at = now


def _job_key(job_id: str) -> str:
    return f"job:{job_id}"


@celery_app.task(name="recommendations.generate")
def generate_recommendations_task(job_id: str, candidate_id: str, criteria: dict) -> None:
    redis_client = get_sync_redis()
    job_key = _job_key(job_id)
    redis_client.set(
        job_key,
        json.dumps({"status": "running", "candidate_id": candidate_id, "criteria": criteria}),
        ex=3600,
    )
    logger.info("ai_job_started", job_id=job_id, candidate_id=candidate_id)

    try:
        candidate_uuid = uuid.UUID(candidate_id)
        # Celery fork pool leaves an event loop from the parent; create a fresh one.
        # The async engine pool may hold connections bound to a previous loop,
        # so dispose it first or every job after the first per worker fails.
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            loop.run_until_complete(engine.dispose())
            result = loop.run_until_complete(_run_job(candidate_uuid, criteria))
        finally:
            loop.close()
            asyncio.set_event_loop(None)
        cache_key = make_cache_key(candidate_uuid, criteria)
        redis_client.set(cache_key, json.dumps(result, default=str), ex=settings.recommendation_cache_ttl_seconds)
        redis_client.set(
            job_key,
            json.dumps(
                {
                    "status": "completed",
                    "candidate_id": candidate_id,
                    "criteria": criteria,
                    "result": result,
                },
                default=str,
            ),
            ex=3600,
        )
        logger.info("ai_job_completed", job_id=job_id, candidate_id=candidate_id)
    except Exception as exc:
        redis_client.set(
            job_key,
            json.dumps(
                {
                    "status": "failed",
                    "candidate_id": candidate_id,
                    "criteria": criteria,
                    "error_code": "RECOMMENDATION_GENERATION_FAILED",
                }
            ),
            ex=3600,
        )
        logger.error("ai_job_failed", job_id=job_id, exception_type=type(exc).__name__)


async def _run_job(candidate_id: uuid.UUID, criteria: dict) -> list[dict]:
    async with AsyncSessionLocal() as db:
        return await generate_recommendations_for_candidate(db, candidate_id, criteria)


@celery_app.task(name="recommendations.score_single")
def score_match_task(candidate_id: str, offer_id: str) -> None:
    """Per-offer candidate match scorer. Persists completed/failed on the row."""
    from app.services.match_scoring import score_single_match

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(engine.dispose())

        async def _run() -> None:
            async with AsyncSessionLocal() as db:
                try:
                    await score_single_match(
                        db, uuid.UUID(candidate_id), uuid.UUID(offer_id)
                    )
                except Exception as exc:
                    logger.error(
                        "match_job_failed",
                        candidate_id=candidate_id,
                        offer_id=offer_id,
                        exception_type=type(exc).__name__,
                    )

        loop.run_until_complete(_run())
    finally:
        loop.close()
        asyncio.set_event_loop(None)


@celery_app.task(name="applications.screen")
def screen_application_task(application_id: str) -> None:
    """Recruiter AI screening. Records completed/failed on the row itself."""
    from app.services.screening import screen_application
    from sqlalchemy import select as _select

    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    try:
        loop.run_until_complete(engine.dispose())

        async def _run() -> None:
            from app.models import Application as _Application

            async with AsyncSessionLocal() as db:
                result = await db.execute(_select(_Application).where(_Application.id == uuid.UUID(application_id)))
                app = result.scalar_one_or_none()
                if app is None:
                    return
                if app.ai_status == "processing":
                    return
                app.ai_status = "processing"
                await db.commit()
                try:
                    await screen_application(db, uuid.UUID(application_id))
                except Exception as exc:
                    logger.error(
                        "screening_job_failed",
                        application_id=application_id,
                        exception_type=type(exc).__name__,
                    )
                    app.ai_status = "failed"
                    app.ai_score = None
                    app.ai_report = None
                    await db.commit()

        loop.run_until_complete(_run())
    finally:
        loop.close()
        asyncio.set_event_loop(None)
