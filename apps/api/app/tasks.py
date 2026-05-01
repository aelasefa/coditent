from __future__ import annotations

import asyncio
import json
import uuid

from celery import Celery

from app.cache import get_sync_redis
from app.config import settings
from app.database import AsyncSessionLocal
from app.observability import get_logger
from app.services.recommendation_jobs import generate_recommendations_for_candidate, make_cache_key

celery_app = Celery("coditent", broker=settings.redis_url, backend=settings.redis_url)
celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
)

logger = get_logger("ai")


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
        result = asyncio.run(_run_job(candidate_uuid, criteria))
        cache_key = make_cache_key(candidate_uuid, criteria)
        redis_client.set(cache_key, json.dumps(result), ex=settings.recommendation_cache_ttl_seconds)
        redis_client.set(
            job_key,
            json.dumps(
                {
                    "status": "completed",
                    "candidate_id": candidate_id,
                    "criteria": criteria,
                    "result": result,
                }
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
                    "error": str(exc),
                }
            ),
            ex=3600,
        )
        logger.error("ai_job_failed", job_id=job_id, error=str(exc))


async def _run_job(candidate_id: uuid.UUID, criteria: dict) -> list[dict]:
    async with AsyncSessionLocal() as db:
        return await generate_recommendations_for_candidate(db, candidate_id, criteria)
