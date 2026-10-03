"""Durable AI outbox, leases, retries, and source-version fingerprints."""
from __future__ import annotations

import hashlib
import json
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.dialects.postgresql import insert as postgresql_insert
from sqlalchemy.dialects.sqlite import insert as sqlite_insert
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.config import settings
from app.models import AIJob, Application, Assessment, CVAsset, CandidateProfile, Offer
from app.services.offer_eligibility import eligible_offer_predicates


ACTIVE_JOB_STATUSES = ("pending", "queued", "processing")
FINAL_JOB_STATUSES = ("completed", "failed", "stale")
MAX_JOB_PAYLOAD_CHARS = 16_000
MAX_JOB_RESULT_CHARS = 128_000


class AIQueueFullError(RuntimeError):
    pass


class AIJobLeaseLostError(RuntimeError):
    pass


def _json_default(value: Any) -> str:
    if isinstance(value, UUID):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    enum_value = getattr(value, "value", None)
    if isinstance(enum_value, (str, int, float, bool)):
        return str(enum_value)
    return str(value)


def canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
        default=_json_default,
    )


def content_fingerprint(value: Any) -> str:
    return hashlib.sha256(canonical_json(value).encode("utf-8")).hexdigest()


def make_dedupe_key(kind: str, resource_id: UUID | None, fingerprint: str) -> str:
    return f"{kind}:{resource_id or 'none'}:{fingerprint}"


def _insert_for(db: AsyncSession):
    if db.get_bind().dialect.name == "sqlite":
        return sqlite_insert(AIJob)
    return postgresql_insert(AIJob)


async def enqueue_ai_job(
    db: AsyncSession,
    *,
    kind: str,
    actor_id: UUID,
    company_id: UUID | None,
    resource_id: UUID | None,
    payload: dict[str, Any],
    source_fingerprint: str,
    reset_failed: bool = False,
) -> AIJob:
    """Insert an outbox row in the caller's transaction.

    The unique dedupe key is the concurrency boundary.  The caller commits the
    domain mutation and the job together; no broker operation occurs here.
    """
    if not kind or len(kind) > 50:
        raise ValueError("Invalid AI job kind")
    if len(source_fingerprint) != 64:
        raise ValueError("Invalid AI source fingerprint")
    encoded_payload = canonical_json(payload)
    if len(encoded_payload) > MAX_JOB_PAYLOAD_CHARS:
        raise ValueError("AI job payload is too large")
    dedupe_key = make_dedupe_key(kind, resource_id, source_fingerprint)
    existing = (
        await db.execute(select(AIJob).where(AIJob.dedupe_key == dedupe_key))
    ).scalar_one_or_none()
    if existing is not None:
        if reset_failed and existing.status in {"failed", "stale"}:
            existing.status = "pending"
            existing.attempts = 0
            existing.available_at = datetime.utcnow()
            existing.lease_until = None
            existing.lease_owner = None
            existing.last_error_code = None
            existing.result = None
            existing.completed_at = None
            existing.updated_at = datetime.utcnow()
            await db.flush()
        return existing

    active_count = int(
        (
            await db.execute(
                select(func.count(AIJob.id)).where(AIJob.status.in_(ACTIVE_JOB_STATUSES))
            )
        ).scalar_one()
    )
    if active_count >= int(getattr(settings, "ai_queue_max_pending", 1_000)):
        raise AIQueueFullError("AI_QUEUE_CAPACITY_EXCEEDED")

    now = datetime.utcnow()
    job_id = uuid.uuid4()
    statement = (
        _insert_for(db)
        .values(
            id=job_id,
            kind=kind,
            dedupe_key=dedupe_key,
            status="pending",
            actor_id=actor_id,
            company_id=company_id,
            resource_id=resource_id,
            payload=encoded_payload,
            source_fingerprint=source_fingerprint,
            attempts=0,
            max_attempts=int(getattr(settings, "ai_job_max_attempts", 3)),
            available_at=now,
            lease_until=None,
            lease_owner=None,
            last_error_code=None,
            result=None,
            created_at=now,
            updated_at=now,
            completed_at=None,
        )
        .on_conflict_do_nothing(index_elements=["dedupe_key"])
        .returning(AIJob.id)
    )
    inserted_id = (await db.execute(statement)).scalar_one_or_none()
    resolved_id = inserted_id or (
        await db.execute(select(AIJob.id).where(AIJob.dedupe_key == dedupe_key))
    ).scalar_one()
    job = (await db.execute(select(AIJob).where(AIJob.id == resolved_id))).scalar_one()
    await db.flush()
    return job


async def dispatch_due_jobs(
    db: AsyncSession,
    *,
    dispatcher_id: str,
    limit: int = 25,
) -> list[UUID]:
    """Reserve recoverable outbox rows for broker publication.

    `queued` and `processing` leases that expired are eligible again, which
    recovers API/worker crashes. Attempts are counted only when a worker claims
    a row, not when a broker message is published.
    """
    now = datetime.utcnow()
    lease_until = now + timedelta(
        seconds=int(getattr(settings, "ai_dispatch_lease_seconds", 60))
    )
    await db.execute(
        update(AIJob)
        .where(
            AIJob.status == "processing",
            AIJob.lease_until.is_not(None),
            AIJob.lease_until <= now,
            AIJob.attempts >= AIJob.max_attempts,
        )
        .values(
            status="failed",
            lease_until=None,
            lease_owner=None,
            last_error_code="AI_JOB_LEASE_EXHAUSTED",
            completed_at=now,
            updated_at=now,
        )
    )
    due_condition = or_(
        and_(AIJob.status == "pending", AIJob.available_at <= now),
        and_(
            AIJob.status.in_(("queued", "processing")),
            AIJob.lease_until.is_not(None),
            AIJob.lease_until <= now,
            AIJob.attempts < AIJob.max_attempts,
        ),
    )
    candidate_ids = list(
        (
            await db.execute(
                select(AIJob.id)
                .where(due_condition)
                .order_by(AIJob.available_at, AIJob.created_at, AIJob.id)
                .limit(max(1, min(limit, 100)))
            )
        ).scalars()
    )
    reserved: list[UUID] = []
    for job_id in candidate_ids:
        claimed = (
            await db.execute(
                update(AIJob)
                .where(AIJob.id == job_id, due_condition)
                .values(
                    status="queued",
                    lease_until=lease_until,
                    lease_owner=dispatcher_id,
                    updated_at=now,
                )
                .returning(AIJob.id)
            )
        ).scalar_one_or_none()
        if claimed is not None:
            reserved.append(claimed)
    await db.commit()
    return reserved


async def return_dispatch_failure(
    db: AsyncSession,
    job_id: UUID,
    *,
    dispatcher_id: str,
) -> None:
    now = datetime.utcnow()
    await db.execute(
        update(AIJob)
        .where(
            AIJob.id == job_id,
            AIJob.status == "queued",
            AIJob.lease_owner == dispatcher_id,
        )
        .values(
            status="pending",
            available_at=now + timedelta(seconds=5),
            lease_until=None,
            lease_owner=None,
            last_error_code="AI_BROKER_UNAVAILABLE",
            updated_at=now,
        )
    )
    await db.commit()


async def run_dispatch_cycle(
    session_factory: async_sessionmaker[AsyncSession],
    sender: Callable[[str], Any],
    *,
    dispatcher_id: str,
    limit: int = 25,
) -> int:
    async with session_factory() as db:
        job_ids = await dispatch_due_jobs(db, dispatcher_id=dispatcher_id, limit=limit)
    for job_id in job_ids:
        try:
            result = sender(str(job_id))
            if isinstance(result, Awaitable):
                await result
        except Exception:
            async with session_factory() as db:
                await return_dispatch_failure(db, job_id, dispatcher_id=dispatcher_id)
    return len(job_ids)


async def claim_ai_job(db: AsyncSession, job_id: UUID, *, worker_id: str) -> AIJob | None:
    now = datetime.utcnow()
    lease_until = now + timedelta(seconds=int(getattr(settings, "ai_job_lease_seconds", 180)))
    claimed_id = (
        await db.execute(
            update(AIJob)
            .where(
                AIJob.id == job_id,
                AIJob.status == "queued",
                AIJob.attempts < AIJob.max_attempts,
            )
            .values(
                status="processing",
                attempts=AIJob.attempts + 1,
                lease_until=lease_until,
                lease_owner=worker_id,
                last_error_code=None,
                updated_at=now,
            )
            .returning(AIJob.id)
        )
    ).scalar_one_or_none()
    await db.commit()
    if claimed_id is None:
        return None
    return (await db.execute(select(AIJob).where(AIJob.id == claimed_id))).scalar_one()


async def heartbeat_ai_job(db: AsyncSession, job_id: UUID, *, worker_id: str) -> bool:
    now = datetime.utcnow()
    lease_until = now + timedelta(seconds=int(getattr(settings, "ai_job_lease_seconds", 180)))
    renewed = (
        await db.execute(
            update(AIJob)
            .where(
                AIJob.id == job_id,
                AIJob.status == "processing",
                AIJob.lease_owner == worker_id,
            )
            .values(lease_until=lease_until, updated_at=now)
            .returning(AIJob.id)
        )
    ).scalar_one_or_none()
    await db.commit()
    return renewed is not None


async def complete_ai_job(
    db: AsyncSession,
    job_id: UUID,
    *,
    worker_id: str,
    result: Any,
) -> None:
    encoded = canonical_json(result)
    if len(encoded) > MAX_JOB_RESULT_CHARS:
        raise ValueError("AI job result is too large")
    now = datetime.utcnow()
    completed = (
        await db.execute(
            update(AIJob)
            .where(
                AIJob.id == job_id,
                AIJob.status == "processing",
                AIJob.lease_owner == worker_id,
            )
            .values(
                status="completed",
                result=encoded,
                lease_until=None,
                lease_owner=None,
                last_error_code=None,
                completed_at=now,
                updated_at=now,
            )
            .returning(AIJob.id)
        )
    ).scalar_one_or_none()
    await db.commit()
    if completed is None:
        raise AIJobLeaseLostError("AI job lease was lost before completion")


async def mark_ai_job_stale(
    db: AsyncSession,
    job_id: UUID,
    *,
    worker_id: str,
    code: str = "AI_SOURCE_CHANGED",
) -> None:
    now = datetime.utcnow()
    updated = (
        await db.execute(
            update(AIJob)
            .where(
                AIJob.id == job_id,
                AIJob.status == "processing",
                AIJob.lease_owner == worker_id,
            )
            .values(
                status="stale",
                lease_until=None,
                lease_owner=None,
                last_error_code=code[:80],
                completed_at=now,
                updated_at=now,
            )
            .returning(AIJob.id)
        )
    ).scalar_one_or_none()
    await db.commit()
    if updated is None:
        raise AIJobLeaseLostError("AI job lease was lost before stale transition")


async def fail_ai_job(
    db: AsyncSession,
    job_id: UUID,
    *,
    worker_id: str,
    error_code: str,
    retryable: bool,
) -> str:
    job = (
        await db.execute(
            select(AIJob).where(
                AIJob.id == job_id,
                AIJob.status == "processing",
                AIJob.lease_owner == worker_id,
            )
        )
    ).scalar_one_or_none()
    if job is None:
        raise AIJobLeaseLostError("AI job lease was lost before failure transition")
    now = datetime.utcnow()
    if retryable and job.attempts < job.max_attempts:
        job.status = "pending"
        job.available_at = now + timedelta(seconds=min(300, 5 * (2 ** (job.attempts - 1))))
        final_status = "pending"
    else:
        job.status = "failed"
        job.completed_at = now
        final_status = "failed"
    job.lease_until = None
    job.lease_owner = None
    job.last_error_code = error_code[:80]
    job.updated_at = now
    await db.commit()
    return final_status


def _profile_data(profile: CandidateProfile | None) -> dict[str, Any] | None:
    if profile is None:
        return None
    return {
        "user_id": profile.user_id,
        "headline": profile.headline,
        "bio": profile.bio,
        "field": profile.field_of_study,
        "university": profile.university,
        "study_level": profile.study_level,
        "city": profile.city,
        "skills": profile.skills,
        "experience": profile.years_of_experience,
        "cv_asset": profile.current_cv_asset_id,
    }


def _offer_data(offer: Offer) -> dict[str, Any]:
    return {
        "id": offer.id,
        "company_id": offer.company_id,
        "title": offer.title,
        "company": offer.company,
        "region": offer.region,
        "field": offer.field,
        "type": offer.type,
        "description": offer.description,
        "requirements": offer.requirements,
        "active": offer.active,
        "opportunity_status": offer.opportunity_status,
        "deadline": offer.deadline,
    }


async def match_source_fingerprint(
    db: AsyncSession,
    candidate_id: UUID,
    offer_id: UUID,
) -> str | None:
    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == candidate_id))
    ).scalar_one_or_none()
    offer = (await db.execute(select(Offer).where(Offer.id == offer_id))).scalar_one_or_none()
    if profile is None or offer is None:
        return None
    return content_fingerprint({"profile": _profile_data(profile), "offer": _offer_data(offer)})


async def application_source_fingerprint(db: AsyncSession, application_id: UUID) -> str | None:
    app = (
        await db.execute(select(Application).where(Application.id == application_id))
    ).scalar_one_or_none()
    if app is None:
        return None
    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == app.candidate_id))
    ).scalar_one_or_none()
    offer = (
        await db.execute(select(Offer).where(Offer.id == app.opportunity_id))
    ).scalar_one_or_none()
    asset = None
    if app.cv_asset_id is not None:
        asset = (await db.execute(select(CVAsset).where(CVAsset.id == app.cv_asset_id))).scalar_one_or_none()
    if offer is None:
        return None
    return content_fingerprint(
        {
            "application": {
                "id": app.id,
                "candidate_id": app.candidate_id,
                "offer_id": app.opportunity_id,
                "company_id": app.company_id,
                "cover_letter": app.cover_letter,
                "cv_asset_id": app.cv_asset_id,
            },
            "profile": _profile_data(profile),
            "offer": _offer_data(offer),
            "cv_asset": (
                {
                    "id": asset.id,
                    "owner_id": asset.owner_id,
                    "version": asset.version,
                    "path": asset.storage_path,
                    "size": asset.size_bytes,
                }
                if asset is not None
                else None
            ),
        }
    )


async def recommendation_source_fingerprint(
    db: AsyncSession,
    candidate_id: UUID,
    criteria: dict[str, Any],
) -> str | None:
    profile = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == candidate_id))
    ).scalar_one_or_none()
    if profile is None:
        return None
    query = select(Offer).where(*eligible_offer_predicates()).order_by(Offer.id)
    offer_type = criteria.get("type")
    field = str(criteria.get("field") or "").strip()
    region = str(criteria.get("region") or "").strip()
    if offer_type:
        query = query.where(Offer.type == offer_type)
    if field:
        query = query.where(Offer.field.ilike(f"%{field}%"))
    if region:
        query = query.where(Offer.region.ilike(f"%{region}%"))
    offers = list((await db.execute(query.limit(30))).scalars())
    return content_fingerprint(
        {
            "profile": _profile_data(profile),
            "criteria": criteria,
            "offers": [_offer_data(offer) for offer in offers],
        }
    )


async def assessment_source_fingerprint(
    db: AsyncSession, assessment_id: UUID
) -> str | None:
    assessment = (
        await db.execute(select(Assessment).where(Assessment.id == assessment_id))
    ).scalar_one_or_none()
    if assessment is None or not assessment.submission_text:
        return None
    return content_fingerprint(
        {
            "id": assessment.id,
            "application_id": assessment.application_id,
            "candidate_id": assessment.candidate_id,
            "title": assessment.title,
            "description": assessment.description,
            "rubric": assessment.rubric,
            "max_score": assessment.max_score,
            "submission_text": assessment.submission_text,
            "submitted_at": assessment.submitted_at,
        }
    )


async def current_source_fingerprint(db: AsyncSession, job: AIJob) -> str | None:
    payload = json.loads(job.payload)
    if job.kind == "application_screen" and job.resource_id:
        return await application_source_fingerprint(db, job.resource_id)
    if job.kind == "match_score" and job.resource_id:
        return await match_source_fingerprint(db, job.actor_id, job.resource_id) if job.actor_id else None
    if job.kind == "recommendation_rank" and job.actor_id:
        return await recommendation_source_fingerprint(db, job.actor_id, payload.get("criteria", {}))
    if job.kind == "assessment_grade" and job.resource_id:
        return await assessment_source_fingerprint(db, job.resource_id)
    return job.source_fingerprint
