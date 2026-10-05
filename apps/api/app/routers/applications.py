import asyncio
from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Assessment, Application, CVAsset, CandidateProfile, Company, InterviewFeedback, Offer, User
from app.schemas import (
    ApplicationCreate,
    ApplicationCreatedOut,
    ApplicationStatusOut,
    ApplicationStatusUpdate,
    InterviewFeedbackCreate,
    InterviewFeedbackListOut,
    InterviewFeedbackOut,
    InterviewFeedbackUpdate,
)
from app.services.cv_assets import (
    CVAssetOwnershipError,
    assert_cv_asset_owner,
    get_application_cv_asset,
    get_current_cv_asset,
)
from app.services.ai_jobs import (
    AIQueueFullError,
    application_source_fingerprint,
    enqueue_ai_job,
)
from app.services.offer_eligibility import offer_is_eligible
from app.services.notifications import create_notification
from app.services.recruitment_chat import (
    get_or_create_recruitment_conversation,
    is_chat_enabled_for_status,
)

router = APIRouter()


@router.get("", response_model=dict[str, list[dict]])
async def list_applications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if current_user.role.value == "CANDIDATE":
        result = await db.execute(
            select(Application, Offer)
            .join(Offer, Application.opportunity_id == Offer.id)
            .where(Application.candidate_id == current_user.id)
            .order_by(Application.created_at.desc())
        )
        rows = result.all()
        company_ids = {offer.company_id for _, offer in rows if offer.company_id is not None}
        logos: dict[str, str | None] = {}
        if company_ids:
            comp_rows = await db.execute(
                select(Company.id, Company.logo_url).where(Company.id.in_(company_ids))
            )
            logos = {str(cid): logo for cid, logo in comp_rows.all()}
        return {"applications": [
            {
                "id": str(app.id),
                "opportunity_id": str(app.opportunity_id),
                "status": app.status,
                "stage_version": app.stage_version,
                "chat_enabled": is_chat_enabled_for_status(app.status),
                "created_at": app.created_at.isoformat(),
                "updated_at": app.updated_at.isoformat() if app.updated_at else None,
                "opportunity": {
                    "id": str(offer.id),
                    "title": offer.title,
                    "company": offer.company,
                    "company_id": str(offer.company_id) if offer.company_id else None,
                    "company_logo_url": logos.get(str(offer.company_id)) if offer.company_id else None,
                },
            }
            for app, offer in rows
        ]}
    if current_user.role.value == "COMPANY_USER":
        if not current_user.company_id or not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        result = await db.execute(
            select(Application, User)
            .join(Offer, Application.opportunity_id == Offer.id)
            .join(User, Application.candidate_id == User.id)
            .where(Offer.company_id == current_user.company_id)
            .order_by(Application.created_at.desc())
        )
        rows = result.all()
        profiles = await _profiles_by_user_id(
            db, {row[0].candidate_id for row in rows}
        )
        cv_assets = await _cv_assets_by_id(db, [row[0] for row in rows])
        return {
            "applications": [
                _serialize_application(
                    a,
                    u,
                    profiles.get(a.candidate_id),
                    cv_assets.get(a.cv_asset_id) if a.cv_asset_id else None,
                )
                for a, u in rows
            ]
        }
    if current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Application).order_by(Application.created_at.desc()))
        apps = result.scalars().all()
        return {"applications": [{"id": str(a.id), "status": a.status, "stage_version": a.stage_version, "chat_enabled": is_chat_enabled_for_status(a.status)} for a in apps]}
    raise HTTPException(status_code=403, detail="Forbidden")


def _effective_cv_path(app: Application, asset: CVAsset | None) -> str | None:
    """Return only the immutable owner-bound asset frozen at apply time."""
    if asset is None or app.cv_asset_id != asset.id:
        return None
    try:
        assert_cv_asset_owner(asset, app.candidate_id)
    except CVAssetOwnershipError:
        return None
    return asset.storage_path


def _serialize_application(
    app: Application,
    candidate: User | None,
    profile: CandidateProfile | None = None,
    cv_asset: CVAsset | None = None,
) -> dict:
    """Recruiter-facing application payload.

    Relationship chain: Application -> User (candidate) -> CandidateProfile
    (skills + CV). Skills come from the single source of truth,
    CandidateProfile.skills — the same value the candidate sees.
    """
    cv_path = _effective_cv_path(app, cv_asset)
    return {
        "id": str(app.id),
        "candidate_id": str(app.candidate_id),
        "opportunity_id": str(app.opportunity_id),
        "status": app.status,
        "stage_version": app.stage_version,
        "chat_enabled": is_chat_enabled_for_status(app.status),
        "ai_score": app.ai_score,
        "ai_report": app.ai_report,
        "ai_status": getattr(app, "ai_status", None) or "pending",
        "interview_scheduled_at": (
            app.interview_scheduled_at.isoformat()
            if app.interview_scheduled_at
            else None
        ),
        "interview_notes": app.interview_notes,
        "status_changed_at": (
            app.status_changed_at.isoformat() if app.status_changed_at else None
        ),
        "created_at": app.created_at.isoformat() if app.created_at else None,
        "updated_at": app.updated_at.isoformat() if app.updated_at else None,
        "candidate": (
            {
                "full_name": candidate.full_name,
                "email": candidate.email,
                "avatar_url": candidate.avatar_url,
                # Same source of truth as the candidate's own profile view.
                "skills": profile.skills if profile is not None else None,
                "headline": profile.headline if profile is not None else None,
                "city": profile.city if profile is not None else None,
            }
            if candidate is not None
            else None
        ),
        "profile": (
            {
                "headline": profile.headline,
                "bio": profile.bio,
                "field_of_study": profile.field_of_study,
                "university": profile.university,
                "study_level": profile.study_level.value if profile.study_level else None,
                "skills": profile.skills,
                "years_of_experience": profile.years_of_experience,
                "city": profile.city,
                "linkedin_url": profile.linkedin_url,
                "portfolio_url": profile.portfolio_url,
            }
            if profile is not None
            else None
        ),
        # Never expose the raw storage path as a linkable URL: the bucket is
        # private. View/Download go through GET /applications/{id}/cv, which
        # re-checks company isolation on every request.
        "cv": (
            {
                "filename": cv_asset.original_filename,
                "download_url": f"/applications/{app.id}/cv",
            }
            if cv_path and cv_asset is not None
            else None
        ),
    }


async def _profiles_by_user_id(
    db: AsyncSession, user_ids: set[UUID],
) -> dict[UUID, CandidateProfile]:
    if not user_ids:
        return {}
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id.in_(user_ids))
    )
    return {profile.user_id: profile for profile in result.scalars().all()}


async def _cv_assets_by_id(
    db: AsyncSession,
    applications: list[Application],
) -> dict[UUID, CVAsset]:
    asset_ids = {app.cv_asset_id for app in applications if app.cv_asset_id is not None}
    if not asset_ids:
        return {}
    result = await db.execute(select(CVAsset).where(CVAsset.id.in_(asset_ids)))
    return {asset.id: asset for asset in result.scalars().all()}


@router.get("/{application_id}", response_model=dict)
async def get_application(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    app = (await db.execute(select(Application).where(Application.id == application_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role.value == "PLATFORM_ADMIN":
        return {"id": str(app.id), "candidate_id": str(app.candidate_id), "opportunity_id": str(app.opportunity_id), "status": app.status, "stage_version": app.stage_version, "chat_enabled": is_chat_enabled_for_status(app.status)}
    if current_user.role.value == "CANDIDATE":
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=404, detail="Application not found")
        candidate = (await db.execute(select(User).where(User.id == app.candidate_id))).scalar_one_or_none()
        profiles = await _profiles_by_user_id(db, {app.candidate_id})
        try:
            cv_asset = await get_application_cv_asset(db, app)
        except CVAssetOwnershipError as exc:
            raise HTTPException(status_code=404, detail="Application CV not found") from exc
        if app.cv_asset_id is not None and cv_asset is None:
            raise HTTPException(status_code=404, detail="Application CV not found")
        return _serialize_application(
            app,
            candidate,
            profiles.get(app.candidate_id),
            cv_asset,
        )
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        candidate = (await db.execute(select(User).where(User.id == app.candidate_id))).scalar_one_or_none()
        profiles = await _profiles_by_user_id(db, {app.candidate_id})
        try:
            cv_asset = await get_application_cv_asset(db, app)
        except CVAssetOwnershipError as exc:
            raise HTTPException(status_code=404, detail="Application CV not found") from exc
        if app.cv_asset_id is not None and cv_asset is None:
            raise HTTPException(status_code=404, detail="Application CV not found")
        return _serialize_application(
            app,
            candidate,
            profiles.get(app.candidate_id),
            cv_asset,
        )
    raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/{application_id}/cv")
async def download_application_cv(
    application_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    """Stream the candidate's CV for an application.

    Access requires: requester owns the application (candidate), or is a
    company member with view rights whose company owns the job, or platform
    admin. Company isolation is re-checked here — a Company B recruiter
    changing the ID gets 404, never Company A's file. The storage path comes
    from the DB (never from user input) and must live under the candidate's
    own prefix.
    """
    app = (await db.execute(select(Application).where(Application.id == application_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    if current_user.role.value == "CANDIDATE":
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=404, detail="Application not found")
    elif current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        if app.company_id is not None and app.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
    elif current_user.role.value != "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")

    try:
        cv_asset = await get_application_cv_asset(db, app)
    except CVAssetOwnershipError as exc:
        raise HTTPException(status_code=404, detail="CV not found") from exc
    if cv_asset is None:
        raise HTTPException(status_code=404, detail="No CV attached to this application")
    cv_path = cv_asset.storage_path

    from app.services.cv_storage import CVStorageError, download_cv

    try:
        data = await asyncio.to_thread(download_cv, cv_path)
    except CVStorageError:
        raise HTTPException(status_code=404, detail="CV not found")

    await log_audit(
        db,
        action="RECRUITER_CV_VIEWED",
        actor=current_user,
        company_id=getattr(current_user, "company_id", None),
        resource_type="application",
        resource_id=app.id,
    )
    return StreamingResponse(
        iter([data]),
        media_type=cv_asset.content_type,
        headers={
            "Content-Disposition": f'attachment; filename="{cv_asset.original_filename}"'
        },
    )


@router.post("", response_model=ApplicationCreatedOut, status_code=201)
async def create_application(
    data: ApplicationCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if current_user.role.value != "CANDIDATE":
        raise HTTPException(status_code=403, detail="Only candidates can apply")
    # ``cv_url`` is intentionally ignored for compatibility with older web
    # clients. Storage keys are server-managed and the current owned asset is
    # selected below, so client input can never choose a CV version.
    opp_id = data.opportunity_id
    offer = (await db.execute(select(Offer).where(Offer.id == opp_id))).scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if not offer_is_eligible(offer):
        raise HTTPException(status_code=409, detail="Opportunity is no longer accepting applications")
    existing = (await db.execute(select(Application).where(Application.candidate_id == current_user.id, Application.opportunity_id == opp_id))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=409, detail="Already applied")
    profile = (
        await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
        )
    ).scalar_one_or_none()
    cv_asset: CVAsset | None = None
    if profile is not None and profile.current_cv_asset_id is not None:
        try:
            # Hold the immutable asset row until the application snapshot
            # commits so replacement cleanup cannot race this reference.
            cv_asset = await get_current_cv_asset(
                db,
                profile,
                current_user.id,
                lock=True,
            )
        except CVAssetOwnershipError as exc:
            raise HTTPException(status_code=409, detail="Current CV is invalid") from exc
        if cv_asset is None:
            raise HTTPException(status_code=409, detail="Current CV is unavailable")
    # company_id and the immutable CV version are derived server-side.
    app = Application(
        candidate_id=current_user.id,
        opportunity_id=opp_id,
        company_id=offer.company_id,
        status="applied",
        cv_asset_id=cv_asset.id if cv_asset else None,
        cv_url=cv_asset.storage_path if cv_asset else None,
        cover_letter=data.cover_letter,
    )
    db.add(app)
    try:
        await db.flush()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Already applied") from exc
    source_fingerprint = await application_source_fingerprint(db, app.id)
    if source_fingerprint is None:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Application cannot be screened")
    try:
        job = await enqueue_ai_job(
            db,
            kind="application_screen",
            actor_id=current_user.id,
            company_id=offer.company_id,
            resource_id=app.id,
            payload={"application_id": str(app.id)},
            source_fingerprint=source_fingerprint,
        )
    except AIQueueFullError as exc:
        await db.rollback()
        raise HTTPException(status_code=503, detail="AI screening queue is full; retry later") from exc
    await db.commit()
    await db.refresh(app)
    await log_audit(db, action="APPLICATION_CREATED", actor=current_user, company_id=offer.company_id, resource_type="application", resource_id=app.id)
    return ApplicationCreatedOut(
        id=app.id,
        status=app.status,
        stage_version=app.stage_version,
        ai_job_id=job.id,
    )


@router.post("/{app_id}/screen", response_model=dict)
async def retry_application_screening(
    app_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """Requeue AI screening after a failure (or a stuck pending)."""
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
    offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "evaluate_candidates"):
            raise HTTPException(status_code=403, detail="Forbidden")
        if offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
    elif current_user.role.value != "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")
    if (getattr(app, "ai_status", None) or "pending") == "processing":
        return {"id": str(app.id), "ai_status": "processing"}
    source_fingerprint = await application_source_fingerprint(db, app.id)
    if source_fingerprint is None:
        raise HTTPException(status_code=409, detail="Application cannot be screened")
    try:
        job = await enqueue_ai_job(
            db,
            kind="application_screen",
            actor_id=app.candidate_id,
            company_id=offer.company_id,
            resource_id=app.id,
            payload={"application_id": str(app.id)},
            source_fingerprint=source_fingerprint,
            reset_failed=True,
        )
    except AIQueueFullError as exc:
        raise HTTPException(status_code=503, detail="AI screening queue is full; retry later") from exc
    app.ai_status = "pending"
    await db.commit()
    return {"id": str(app.id), "ai_status": "pending", "ai_job_id": str(job.id)}


_ALLOWED_STAGE_TRANSITIONS: dict[str, frozenset[str]] = {
    "applied": frozenset({"under_review", "rejected"}),
    "under_review": frozenset(
        {"shortlisted", "interview", "rejected"}
    ),
    "shortlisted": frozenset({"interview", "rejected"}),
    "assessment_required": frozenset({"assessment_completed", "rejected"}),
    "assessment_completed": frozenset({"interview", "accepted", "rejected"}),
    "interview": frozenset({"accepted", "rejected"}),
    "accepted": frozenset(),
    "rejected": frozenset(),
}


async def _validate_stage_evidence(
    db: AsyncSession,
    app: Application,
    data: ApplicationStatusUpdate,
) -> None:
    if data.status == "assessment_completed":
        assessment = (
            await db.execute(
                select(Assessment).where(
                    Assessment.application_id == app.id,
                    Assessment.status.in_(("completed", "graded", "reviewed")),
                    Assessment.score.is_not(None),
                )
            )
        ).scalars().first()
        if assessment is None:
            raise HTTPException(
                status_code=409,
                detail="A graded assessment is required before completing assessment",
            )
    if data.status == "interview" and data.interview_scheduled_at is None:
        raise HTTPException(
            status_code=422,
            detail="interview_scheduled_at is required for the interview stage",
        )


@router.patch("/{app_id}", response_model=ApplicationStatusOut)
async def update_application_status(
    app_id: UUID,
    data: ApplicationStatusUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ApplicationStatusOut:
    new_status = data.status
    # Idempotent conversation anchor: lock the application row first so
    # concurrent accepts / stage moves reuse the SAME recruitment conversation
    # (application_id) instead of creating a second one. Stage changes only
    # update metadata on the existing conversation; they never insert a new one.
    app = await get_or_create_recruitment_conversation(db, app_id)
    # Candidate must not modify recruiter-controlled state
    if current_user.role.value == "CANDIDATE":
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "move_recruitment_stage"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
    elif current_user.role.value != "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")

    if app.stage_version != data.expected_version:
        raise HTTPException(
            status_code=409,
            detail={
                "code": "STALE_APPLICATION_STAGE",
                "current_status": app.status,
                "current_version": app.stage_version,
            },
        )
    if new_status == app.status:
        return ApplicationStatusOut(
            id=app.id,
            status=app.status,
            stage_version=app.stage_version,
            chat_enabled=is_chat_enabled_for_status(app.status),
        )
    if new_status == "assessment_required":
        raise HTTPException(
            status_code=409,
            detail="Assign an assessment to move the application into the assessment stage",
        )
    allowed = _ALLOWED_STAGE_TRANSITIONS.get(app.status, frozenset())
    if new_status not in allowed:
        raise HTTPException(
            status_code=409,
            detail=f"Transition from {app.status} to {new_status} is not allowed",
        )
    await _validate_stage_evidence(db, app, data)

    was_enabled = is_chat_enabled_for_status(app.status)
    app.status = new_status
    app.stage_version += 1
    app.status_changed_at = datetime.utcnow()
    if new_status == "interview":
        app.interview_scheduled_at = data.interview_scheduled_at
        app.interview_notes = data.interview_notes
    label = new_status.replace("_", " ").title()
    await create_notification(
        db,
        user_id=app.candidate_id,
        category="interview" if new_status == "interview" else "application",
        title="Interview scheduled" if new_status == "interview" else "Application updated",
        body=(
            f"Your application moved to {label}."
            if new_status != "interview"
            else f"Your application moved to {label}. Open it to review the scheduled time."
        ),
        action_url="/dashboard/applications",
        resource_type="application",
        resource_id=app.id,
        dedupe_key=f"application-stage:{app.id}:{app.stage_version}",
    )
    await db.commit()
    await db.refresh(app)
    action = (
        "CANDIDATE_SHORTLISTED"
        if new_status == "shortlisted"
        else "CANDIDATE_REJECTED"
        if new_status == "rejected"
        else "APPLICATION_STATUS_CHANGED"
    )
    await log_audit(
        db,
        action=action,
        actor=current_user,
        company_id=getattr(current_user, "company_id", None),
        resource_type="application",
        resource_id=app.id,
        details=new_status,
    )
    if is_chat_enabled_for_status(new_status) and not was_enabled:
        await log_audit(
            db,
            action="RECRUITMENT_CHAT_ENABLED",
            actor=current_user,
            company_id=getattr(current_user, "company_id", None),
            resource_type="application",
            resource_id=app.id,
            details=new_status,
        )
    return ApplicationStatusOut(
        id=app.id,
        status=app.status,
        stage_version=app.stage_version,
        chat_enabled=is_chat_enabled_for_status(app.status),
    )


def _interview_feedback_out(feedback: InterviewFeedback, reviewer: User) -> InterviewFeedbackOut:
    return InterviewFeedbackOut(
        id=feedback.id,
        application_id=feedback.application_id,
        reviewer_id=feedback.reviewer_id,
        reviewer_name=reviewer.full_name,
        rating=feedback.rating,
        recommendation=feedback.recommendation,
        strengths=feedback.strengths,
        concerns=feedback.concerns,
        notes=feedback.notes,
        version=feedback.version,
        created_at=feedback.created_at,
        updated_at=feedback.updated_at,
    )


async def _interview_application_for_company(
    db: AsyncSession,
    application_id: UUID,
    current_user: User,
    *,
    lock: bool = False,
) -> tuple[Application, Offer]:
    query = (
        select(Application, Offer)
        .join(Offer, Application.opportunity_id == Offer.id)
        .where(Application.id == application_id)
    )
    if lock:
        query = query.with_for_update()
    row = (await db.execute(query)).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")
    application, offer = row
    if current_user.role.value == "COMPANY_USER":
        if (
            not can(current_user.company_role, "evaluate_candidates")
            or offer.company_id != current_user.company_id
        ):
            raise HTTPException(status_code=404, detail="Application not found")
    elif current_user.role.value != "PLATFORM_ADMIN":
        raise HTTPException(status_code=404, detail="Application not found")
    return application, offer


@router.get("/{app_id}/interview-feedback", response_model=InterviewFeedbackListOut)
async def list_interview_feedback(
    app_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewFeedbackListOut:
    await _interview_application_for_company(db, app_id, current_user)
    rows = list(
        (
            await db.execute(
                select(InterviewFeedback, User)
                .join(User, InterviewFeedback.reviewer_id == User.id)
                .where(InterviewFeedback.application_id == app_id)
                .order_by(InterviewFeedback.created_at.asc())
            )
        ).all()
    )
    return InterviewFeedbackListOut(
        feedback=[_interview_feedback_out(feedback, reviewer) for feedback, reviewer in rows]
    )


@router.post(
    "/{app_id}/interview-feedback",
    response_model=InterviewFeedbackOut,
    status_code=201,
)
async def create_interview_feedback(
    app_id: UUID,
    data: InterviewFeedbackCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewFeedbackOut:
    application, offer = await _interview_application_for_company(
        db, app_id, current_user, lock=True
    )
    if current_user.role.value != "COMPANY_USER":
        raise HTTPException(status_code=403, detail="Only company interviewers can submit feedback")
    if application.status not in {"interview", "accepted", "rejected"} or application.interview_scheduled_at is None:
        raise HTTPException(status_code=409, detail="A scheduled interview is required before feedback")
    feedback = InterviewFeedback(
        application_id=application.id,
        reviewer_id=current_user.id,
        rating=data.rating,
        recommendation=data.recommendation,
        strengths=data.strengths,
        concerns=data.concerns,
        notes=data.notes,
    )
    db.add(feedback)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="You already submitted interview feedback") from exc
    await db.refresh(feedback)
    await log_audit(
        db,
        action="INTERVIEW_FEEDBACK_CREATED",
        actor=current_user,
        company_id=offer.company_id,
        resource_type="interview_feedback",
        resource_id=feedback.id,
        details=f"application_id={application.id}",
    )
    return _interview_feedback_out(feedback, current_user)


@router.patch("/{app_id}/interview-feedback/{feedback_id}", response_model=InterviewFeedbackOut)
async def update_interview_feedback(
    app_id: UUID,
    feedback_id: UUID,
    data: InterviewFeedbackUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InterviewFeedbackOut:
    _application, offer = await _interview_application_for_company(
        db, app_id, current_user, lock=True
    )
    feedback = (
        await db.execute(
            select(InterviewFeedback)
            .where(
                InterviewFeedback.id == feedback_id,
                InterviewFeedback.application_id == app_id,
            )
            .with_for_update()
        )
    ).scalar_one_or_none()
    if feedback is None or feedback.reviewer_id != current_user.id:
        raise HTTPException(status_code=404, detail="Interview feedback not found")
    if feedback.version != data.expected_version:
        raise HTTPException(
            status_code=409,
            detail={"code": "STALE_INTERVIEW_FEEDBACK", "current_version": feedback.version},
        )
    feedback.rating = data.rating
    feedback.recommendation = data.recommendation
    feedback.strengths = data.strengths
    feedback.concerns = data.concerns
    feedback.notes = data.notes
    feedback.version += 1
    await db.commit()
    await db.refresh(feedback)
    await log_audit(
        db,
        action="INTERVIEW_FEEDBACK_UPDATED",
        actor=current_user,
        company_id=offer.company_id,
        resource_type="interview_feedback",
        resource_id=feedback.id,
        details=f"application_id={app_id};version={feedback.version}",
    )
    return _interview_feedback_out(feedback, current_user)
