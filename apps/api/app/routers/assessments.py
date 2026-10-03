from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user, require_company_member
from app.models import Application, Assessment, Offer, User
from app.schemas import (
    AssessmentCreate,
    AssessmentListOut,
    AssessmentOut,
    AssessmentReview,
    AssessmentSubmit,
)
from app.services.ai_jobs import (
    AIQueueFullError,
    assessment_source_fingerprint,
    enqueue_ai_job,
)
from app.services.notifications import create_notification


router = APIRouter()


def _rubric(value: str) -> list[str]:
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return []
    return [str(item)[:500] for item in parsed[:12]] if isinstance(parsed, list) else []


def _assessment_out(
    assessment: Assessment, *, ai_job_id: UUID | None = None
) -> AssessmentOut:
    return AssessmentOut(
        id=assessment.id,
        application_id=assessment.application_id,
        candidate_id=assessment.candidate_id,
        created_by=assessment.created_by,
        title=assessment.title,
        description=assessment.description,
        rubric=_rubric(assessment.rubric),
        max_score=assessment.max_score,
        due_at=assessment.due_at,
        status=assessment.status,
        grading_status=assessment.grading_status,
        score=assessment.score,
        report=assessment.report,
        feedback=assessment.feedback,
        submitted_at=assessment.submitted_at,
        reviewed_by=assessment.reviewed_by,
        reviewed_at=assessment.reviewed_at,
        version=assessment.version,
        created_at=assessment.created_at,
        updated_at=assessment.updated_at,
        ai_job_id=ai_job_id,
    )


def _expire_if_due(assessment: Assessment, now: datetime) -> bool:
    if (
        assessment.status in {"assigned", "pending"}
        and assessment.due_at is not None
        and assessment.due_at <= now
    ):
        assessment.status = "expired"
        assessment.version += 1
        return True
    return False


async def _authorized_assessment(
    db: AsyncSession,
    assessment_id: UUID,
    current_user: User,
    *,
    lock: bool = False,
) -> tuple[Assessment, Application, Offer]:
    query = (
        select(Assessment, Application, Offer)
        .join(Application, Assessment.application_id == Application.id)
        .join(Offer, Application.opportunity_id == Offer.id)
        .where(Assessment.id == assessment_id)
    )
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Assessment not found")
    assessment, application, offer = row
    if current_user.role.value == "CANDIDATE":
        allowed = assessment.candidate_id == current_user.id
    elif current_user.role.value == "COMPANY_USER":
        allowed = bool(
            current_user.company_id
            and offer.company_id == current_user.company_id
            and can(current_user.company_role, "view_assessments")
        )
    else:
        allowed = current_user.role.value == "PLATFORM_ADMIN"
    if not allowed:
        raise HTTPException(status_code=404, detail="Assessment not found")
    return assessment, application, offer


@router.get("", response_model=AssessmentListOut)
async def list_assessments(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentListOut:
    if current_user.role.value == "PLATFORM_ADMIN":
        query = select(Assessment)
    elif current_user.role.value == "CANDIDATE":
        query = select(Assessment).where(Assessment.candidate_id == current_user.id)
    elif current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "view_assessments"):
            raise HTTPException(status_code=403, detail="Forbidden")
        query = (
            select(Assessment)
            .join(Application, Assessment.application_id == Application.id)
            .join(Offer, Application.opportunity_id == Offer.id)
            .where(Offer.company_id == current_user.company_id)
        )
    else:
        raise HTTPException(status_code=403, detail="Forbidden")
    items = list(
        (await db.execute(query.order_by(Assessment.created_at.desc()).limit(200))).scalars()
    )
    changed = False
    now = datetime.utcnow()
    for item in items:
        changed = _expire_if_due(item, now) or changed
    if changed:
        await db.commit()
    return AssessmentListOut(assessments=[_assessment_out(item) for item in items])


@router.post("", response_model=AssessmentOut, status_code=status.HTTP_201_CREATED)
async def create_assessment(
    data: AssessmentCreate,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentOut:
    if not can(current_user.company_role, "evaluate_candidates"):
        raise HTTPException(status_code=403, detail="Forbidden")
    if data.due_at is not None and data.due_at <= datetime.utcnow():
        raise HTTPException(status_code=422, detail="due_at must be in the future")
    row = (
        await db.execute(
            select(Application, Offer)
            .join(Offer, Application.opportunity_id == Offer.id)
            .where(Application.id == data.application_id)
            .with_for_update()
        )
    ).first()
    if row is None or row[1].company_id != current_user.company_id:
        raise HTTPException(status_code=404, detail="Application not found")
    application, offer = row
    if application.status in {"applied", "accepted", "rejected"}:
        raise HTTPException(
            status_code=409,
            detail="Application must be under review or shortlisted for assessment",
        )
    assessment = Assessment(
        application_id=application.id,
        candidate_id=application.candidate_id,
        created_by=current_user.id,
        title=data.title,
        description=data.description,
        rubric=json.dumps(data.rubric, ensure_ascii=False),
        max_score=data.max_score,
        due_at=data.due_at,
        status="assigned",
        grading_status="not_started",
    )
    db.add(assessment)
    if application.status in {"under_review", "shortlisted"}:
        application.status = "assessment_required"
        application.stage_version += 1
        application.status_changed_at = datetime.utcnow()
    await db.flush()
    await create_notification(
        db,
        user_id=application.candidate_id,
        category="assessment",
        title="Assessment assigned",
        body=f"A new assessment, {assessment.title}, is ready for your application.",
        action_url="/dashboard/assessments",
        resource_type="assessment",
        resource_id=assessment.id,
        dedupe_key=f"assessment-assigned:{assessment.id}",
    )
    await db.commit()
    await db.refresh(assessment)
    await log_audit(
        db,
        action="ASSESSMENT_ASSIGNED",
        actor=current_user,
        company_id=offer.company_id,
        resource_type="assessment",
        resource_id=assessment.id,
        details=f"application_id={application.id}",
    )
    return _assessment_out(assessment)


@router.get("/{assessment_id}", response_model=AssessmentOut)
async def get_assessment(
    assessment_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentOut:
    assessment, _application, _offer = await _authorized_assessment(
        db, assessment_id, current_user, lock=True
    )
    if _expire_if_due(assessment, datetime.utcnow()):
        await db.commit()
        await db.refresh(assessment)
    return _assessment_out(assessment)


@router.post("/{assessment_id}/submit", response_model=AssessmentOut)
async def submit_assessment(
    assessment_id: UUID,
    data: AssessmentSubmit,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentOut:
    if current_user.role.value != "CANDIDATE":
        raise HTTPException(status_code=403, detail="Only candidates can submit assessments")
    assessment, application, offer = await _authorized_assessment(
        db, assessment_id, current_user, lock=True
    )
    if _expire_if_due(assessment, datetime.utcnow()):
        await db.commit()
        raise HTTPException(status_code=409, detail="Assessment deadline has passed")
    if assessment.status not in {"assigned", "pending"}:
        raise HTTPException(status_code=409, detail="Assessment cannot be submitted in its current state")
    assessment.submission_text = data.submission_text
    assessment.submitted_at = datetime.utcnow()
    assessment.status = "submitted"
    assessment.grading_status = "queued"
    assessment.version += 1
    await db.flush()
    fingerprint = await assessment_source_fingerprint(db, assessment.id)
    if fingerprint is None:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Assessment cannot be graded")
    try:
        job = await enqueue_ai_job(
            db,
            kind="assessment_grade",
            actor_id=current_user.id,
            company_id=offer.company_id,
            resource_id=assessment.id,
            payload={"assessment_id": str(assessment.id)},
            source_fingerprint=fingerprint,
        )
    except AIQueueFullError as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail="Assessment grading queue is full; retry later") from exc
    await db.commit()
    await db.refresh(assessment)
    await log_audit(
        db,
        action="ASSESSMENT_SUBMITTED",
        actor=current_user,
        company_id=offer.company_id,
        resource_type="assessment",
        resource_id=assessment.id,
        details=f"application_id={application.id}",
    )
    return _assessment_out(assessment, ai_job_id=job.id)


@router.patch("/{assessment_id}/review", response_model=AssessmentOut)
async def review_assessment(
    assessment_id: UUID,
    data: AssessmentReview,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AssessmentOut:
    if not can(current_user.company_role, "evaluate_candidates"):
        raise HTTPException(status_code=403, detail="Forbidden")
    assessment, _application, offer = await _authorized_assessment(
        db, assessment_id, current_user, lock=True
    )
    if assessment.version != data.expected_version:
        raise HTTPException(
            status_code=409,
            detail={"code": "STALE_ASSESSMENT", "current_version": assessment.version},
        )
    reviewable = assessment.status in {"graded", "reviewed"} or (
        assessment.status == "submitted" and assessment.grading_status == "failed"
    )
    if not reviewable:
        raise HTTPException(status_code=409, detail="Assessment is not ready for review")
    if data.score > assessment.max_score:
        raise HTTPException(status_code=422, detail="score exceeds max_score")
    assessment.score = data.score
    assessment.feedback = data.feedback
    assessment.status = "reviewed"
    assessment.grading_status = "completed"
    assessment.reviewed_by = current_user.id
    assessment.reviewed_at = datetime.utcnow()
    assessment.version += 1
    await create_notification(
        db,
        user_id=assessment.candidate_id,
        category="assessment",
        title="Assessment reviewed",
        body=f"Your assessment, {assessment.title}, has been reviewed.",
        action_url="/dashboard/assessments",
        resource_type="assessment",
        resource_id=assessment.id,
        dedupe_key=f"assessment-reviewed:{assessment.id}:{assessment.version}",
    )
    await db.commit()
    await db.refresh(assessment)
    await log_audit(
        db,
        action="ASSESSMENT_REVIEWED",
        actor=current_user,
        company_id=offer.company_id,
        resource_type="assessment",
        resource_id=assessment.id,
        details=f"score={assessment.score}/{assessment.max_score}",
    )
    return _assessment_out(assessment)
