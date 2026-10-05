from __future__ import annotations

import json
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_admin, require_candidate
from app.models import CandidateProfile, MissionAttempt, PracticeMission, User
from app.schemas import (
    MissionAttemptCreate,
    MissionAttemptOut,
    MissionAttemptReview,
    MissionProgressOut,
    MissionReviewQueueItem,
    MissionReviewQueueOut,
    PracticeMissionCreate,
    PracticeMissionListOut,
    PracticeMissionOut,
)


router = APIRouter()


def _string_list(raw: str) -> list[str]:
    try:
        value = json.loads(raw)
    except (TypeError, ValueError):
        return []
    return [str(item)[:80] for item in value[:12]] if isinstance(value, list) else []


def _attempt_out(attempt: MissionAttempt) -> MissionAttemptOut:
    return MissionAttemptOut(
        id=attempt.id,
        mission_id=attempt.mission_id,
        candidate_id=attempt.candidate_id,
        attempt_number=attempt.attempt_number,
        evidence=attempt.evidence,
        status=attempt.status,
        score=attempt.score,
        validated_skills=_string_list(attempt.validated_skills),
        feedback=attempt.feedback,
        reviewed_by=attempt.reviewed_by,
        reviewed_at=attempt.reviewed_at,
        version=attempt.version,
        created_at=attempt.created_at,
        updated_at=attempt.updated_at,
    )


def _mission_out(
    mission: PracticeMission, latest_attempt: MissionAttempt | None = None
) -> PracticeMissionOut:
    return PracticeMissionOut(
        id=mission.id,
        field=mission.field,
        level=mission.level,
        title=mission.title,
        description=mission.description,
        evidence_prompt=mission.evidence_prompt,
        skills=_string_list(mission.skills),
        active=mission.active,
        created_at=mission.created_at,
        latest_attempt=_attempt_out(latest_attempt) if latest_attempt else None,
    )


@router.get("", response_model=PracticeMissionListOut)
async def list_missions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    field: str | None = Query(default=None, max_length=120),
    level: Literal["beginner", "intermediate", "advanced"] | None = None,
) -> PracticeMissionListOut:
    query = select(PracticeMission).where(PracticeMission.active.is_(True))
    if field:
        query = query.where(PracticeMission.field.ilike(f"%{field.strip()}%"))
    if level:
        query = query.where(PracticeMission.level == level)
    missions = list((await db.execute(query.order_by(PracticeMission.created_at.desc()).limit(100))).scalars())
    latest: dict[UUID, MissionAttempt] = {}
    if current_user.role.value == "CANDIDATE" and missions:
        attempts = list(
            (
                await db.execute(
                    select(MissionAttempt)
                    .where(
                        MissionAttempt.candidate_id == current_user.id,
                        MissionAttempt.mission_id.in_([mission.id for mission in missions]),
                    )
                    .order_by(
                        MissionAttempt.mission_id,
                        MissionAttempt.attempt_number.desc(),
                    )
                )
            ).scalars()
        )
        for attempt in attempts:
            latest.setdefault(attempt.mission_id, attempt)
    return PracticeMissionListOut(
        missions=[_mission_out(mission, latest.get(mission.id)) for mission in missions]
    )


@router.post("", response_model=PracticeMissionOut, status_code=status.HTTP_201_CREATED)
async def create_mission(
    data: PracticeMissionCreate,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PracticeMissionOut:
    mission = PracticeMission(
        field=data.field,
        level=data.level,
        title=data.title,
        description=data.description,
        evidence_prompt=data.evidence_prompt,
        skills=json.dumps(data.skills, ensure_ascii=False),
        created_by=current_admin.id,
    )
    db.add(mission)
    await db.commit()
    await db.refresh(mission)
    return _mission_out(mission)


@router.get("/attempts/pending", response_model=MissionReviewQueueOut)
async def list_pending_attempts(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MissionReviewQueueOut:
    rows = list(
        (
            await db.execute(
                select(MissionAttempt, PracticeMission, User)
                .join(PracticeMission, MissionAttempt.mission_id == PracticeMission.id)
                .join(User, MissionAttempt.candidate_id == User.id)
                .where(MissionAttempt.status == "submitted")
                .order_by(MissionAttempt.created_at.asc())
                .limit(200)
            )
        ).all()
    )
    return MissionReviewQueueOut(
        attempts=[
            MissionReviewQueueItem(
                attempt=_attempt_out(attempt),
                mission_title=mission.title,
                mission_skills=_string_list(mission.skills),
                candidate_name=candidate.full_name,
                candidate_email=candidate.email,
            )
            for attempt, mission, candidate in rows
        ]
    )


@router.post("/{mission_id}/attempts", response_model=MissionAttemptOut, status_code=status.HTTP_201_CREATED)
async def create_attempt(
    mission_id: UUID,
    data: MissionAttemptCreate,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MissionAttemptOut:
    mission = (
        await db.execute(
            select(PracticeMission)
            .where(PracticeMission.id == mission_id, PracticeMission.active.is_(True))
            .with_for_update()
        )
    ).scalar_one_or_none()
    if mission is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    latest = (
        await db.execute(
            select(MissionAttempt)
            .where(
                MissionAttempt.mission_id == mission_id,
                MissionAttempt.candidate_id == current_user.id,
            )
            .order_by(MissionAttempt.attempt_number.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    if latest is not None and latest.status == "submitted":
        raise HTTPException(status_code=409, detail="Your current attempt is awaiting review")
    attempt_number = (latest.attempt_number + 1) if latest else 1
    if attempt_number > 5:
        raise HTTPException(status_code=409, detail="Maximum attempts reached")
    attempt = MissionAttempt(
        mission_id=mission.id,
        candidate_id=current_user.id,
        attempt_number=attempt_number,
        evidence=data.evidence,
        status="submitted",
    )
    db.add(attempt)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="A concurrent attempt already exists") from exc
    await db.refresh(attempt)
    return _attempt_out(attempt)


async def _refresh_candidate_scores(db: AsyncSession, candidate_id: UUID) -> None:
    attempts = list(
        (
            await db.execute(
                select(MissionAttempt).where(
                    MissionAttempt.candidate_id == candidate_id,
                    MissionAttempt.status == "validated",
                    MissionAttempt.score.is_not(None),
                )
            )
        ).scalars()
    )
    skills = sorted(
        {
            skill
            for attempt in attempts
            for skill in _string_list(attempt.validated_skills)
        }
    )
    scores = [attempt.score for attempt in attempts if attempt.score is not None]
    profile = (
        await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == candidate_id)
        )
    ).scalar_one_or_none()
    if profile is None:
        profile = CandidateProfile(user_id=candidate_id)
        db.add(profile)
    profile.validated_skills = json.dumps(skills, ensure_ascii=False)
    profile.overall_score = round(sum(scores) / len(scores)) if scores else None


@router.patch("/attempts/{attempt_id}/review", response_model=MissionAttemptOut)
async def review_attempt(
    attempt_id: UUID,
    data: MissionAttemptReview,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MissionAttemptOut:
    row = (
        await db.execute(
            select(MissionAttempt, PracticeMission)
            .join(PracticeMission, MissionAttempt.mission_id == PracticeMission.id)
            .where(MissionAttempt.id == attempt_id)
            .with_for_update()
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Attempt not found")
    attempt, mission = row
    if attempt.version != data.expected_version:
        raise HTTPException(
            status_code=409,
            detail={"code": "STALE_MISSION_ATTEMPT", "current_version": attempt.version},
        )
    if attempt.status != "submitted":
        raise HTTPException(status_code=409, detail="Attempt has already been reviewed")
    mission_skills = set(_string_list(mission.skills))
    validated = list(dict.fromkeys(data.validated_skills)) if data.status == "validated" else []
    if not set(validated).issubset(mission_skills):
        raise HTTPException(status_code=422, detail="Validated skills must come from the mission")
    attempt.status = data.status
    attempt.score = data.score
    attempt.validated_skills = json.dumps(validated, ensure_ascii=False)
    attempt.feedback = data.feedback
    attempt.reviewed_by = current_admin.id
    attempt.reviewed_at = datetime.utcnow()
    attempt.version += 1
    await _refresh_candidate_scores(db, attempt.candidate_id)
    await db.commit()
    await db.refresh(attempt)
    return _attempt_out(attempt)


@router.get("/progress/me", response_model=MissionProgressOut)
async def get_my_progress(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> MissionProgressOut:
    attempts = list(
        (
            await db.execute(
                select(MissionAttempt)
                .where(MissionAttempt.candidate_id == current_user.id)
                .order_by(MissionAttempt.created_at.desc())
                .limit(200)
            )
        ).scalars()
    )
    validated = [attempt for attempt in attempts if attempt.status == "validated"]
    skills = sorted(
        {
            skill
            for attempt in validated
            for skill in _string_list(attempt.validated_skills)
        }
    )
    scores = [attempt.score for attempt in validated if attempt.score is not None]
    return MissionProgressOut(
        completed=len(validated),
        attempted=len(attempts),
        average_score=round(sum(scores) / len(scores)) if scores else None,
        validated_skills=skills,
        attempts=[_attempt_out(attempt) for attempt in attempts],
    )
