from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Application, CandidateProfile, Offer, User
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
        return {"applications": [
            {
                "id": str(app.id),
                "opportunity_id": str(app.opportunity_id),
                "status": app.status,
                "chat_enabled": is_chat_enabled_for_status(app.status),
                "created_at": app.created_at.isoformat(),
                "updated_at": app.updated_at.isoformat() if app.updated_at else None,
                "opportunity": {"id": str(offer.id), "title": offer.title, "company": offer.company},
            }
            for app, offer in result.all()
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
        return {
            "applications": [
                _serialize_application(a, u, profiles.get(a.candidate_id))
                for a, u in rows
            ]
        }
    if current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Application).order_by(Application.created_at.desc()))
        apps = result.scalars().all()
        return {"applications": [{"id": str(a.id), "status": a.status, "chat_enabled": is_chat_enabled_for_status(a.status)} for a in apps]}
    raise HTTPException(status_code=403, detail="Forbidden")


def _effective_cv_path(app: Application, profile: CandidateProfile | None) -> str | None:
    """Resolve the candidate's CV for an application.

    Source of truth is the candidate profile; the application stores a snapshot
    copied at apply time. Fall back to the live profile CV so applications
    created before the snapshot existed still resolve the existing file.
    No second CV record is ever created here.
    """
    if app.cv_url:
        return app.cv_url
    if profile is not None and profile.cv_url:
        return profile.cv_url
    return None


def _serialize_application(
    app: Application,
    candidate: User | None,
    profile: CandidateProfile | None = None,
) -> dict:
    """Recruiter-facing application payload.

    Relationship chain: Application -> User (candidate) -> CandidateProfile
    (skills + CV). Skills come from the single source of truth,
    CandidateProfile.skills — the same value the candidate sees.
    """
    cv_path = _effective_cv_path(app, profile)
    return {
        "id": str(app.id),
        "candidate_id": str(app.candidate_id),
        "opportunity_id": str(app.opportunity_id),
        "status": app.status,
        "chat_enabled": is_chat_enabled_for_status(app.status),
        "ai_score": app.ai_score,
        "ai_report": app.ai_report,
        "ai_status": getattr(app, "ai_status", None) or "pending",
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
                "filename": cv_path.rsplit("/", 1)[-1],
                "download_url": f"/applications/{app.id}/cv",
            }
            if cv_path
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


def _queue_screening(application_id: UUID) -> None:
    try:
        from app.tasks import screen_application_task

        screen_application_task.delay(str(application_id))
    except Exception:
        pass


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
        return {"id": str(app.id), "candidate_id": str(app.candidate_id), "opportunity_id": str(app.opportunity_id), "status": app.status, "chat_enabled": is_chat_enabled_for_status(app.status)}
    if current_user.role.value == "CANDIDATE":
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=404, detail="Application not found")
        candidate = (await db.execute(select(User).where(User.id == app.candidate_id))).scalar_one_or_none()
        profiles = await _profiles_by_user_id(db, {app.candidate_id})
        return _serialize_application(app, candidate, profiles.get(app.candidate_id))
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        candidate = (await db.execute(select(User).where(User.id == app.candidate_id))).scalar_one_or_none()
        profiles = await _profiles_by_user_id(db, {app.candidate_id})
        return _serialize_application(app, candidate, profiles.get(app.candidate_id))
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

    profile = (
        await db.execute(
            select(CandidateProfile).where(CandidateProfile.user_id == app.candidate_id)
        )
    ).scalar_one_or_none()
    cv_path = _effective_cv_path(app, profile)
    if not cv_path:
        raise HTTPException(status_code=404, detail="No CV attached to this application")
    # Defense in depth: storage keys are "<candidate_id>/...".
    if not cv_path.startswith(f"{app.candidate_id}/"):
        raise HTTPException(status_code=404, detail="CV not found")

    from app.services.cv_storage import CVStorageError, download_cv

    try:
        data = download_cv(cv_path)
    except CVStorageError:
        raise HTTPException(status_code=404, detail="CV not found")

    filename = cv_path.rsplit("/", 1)[-1]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    media = {
        "pdf": "application/pdf",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }.get(ext, "application/octet-stream")
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
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("", response_model=dict)
async def create_application(
    data: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if current_user.role.value != "CANDIDATE":
        raise HTTPException(status_code=403, detail="Only candidates can apply")
    opportunity_id = data.get("opportunity_id")
    if not opportunity_id:
        raise HTTPException(status_code=400, detail="opportunity_id required")
    try:
        opp_id = UUID(str(opportunity_id))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid opportunity_id")
    offer = (await db.execute(select(Offer).where(Offer.id == opp_id))).scalar_one_or_none()
    if not offer:
        raise HTTPException(status_code=404, detail="Opportunity not found")
    existing = (await db.execute(select(Application).where(Application.candidate_id == current_user.id, Application.opportunity_id == opp_id))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Already applied")
    # company_id derived from offer, never trust client
    app = Application(candidate_id=current_user.id, opportunity_id=opp_id, company_id=offer.company_id, status="applied", cv_url=data.get("cv_url"), cover_letter=data.get("cover_letter"))
    db.add(app)
    await db.commit()
    await db.refresh(app)
    await log_audit(db, action="APPLICATION_CREATED", actor=current_user, company_id=offer.company_id, resource_type="application", resource_id=app.id)
    _queue_screening(app.id)
    return {"id": str(app.id), "status": app.status}


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
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "evaluate_candidates"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
    elif current_user.role.value != "PLATFORM_ADMIN":
        raise HTTPException(status_code=403, detail="Forbidden")
    if (getattr(app, "ai_status", None) or "pending") == "processing":
        return {"id": str(app.id), "ai_status": "processing"}
    app.ai_status = "pending"
    await db.commit()
    _queue_screening(app.id)
    return {"id": str(app.id), "ai_status": "pending"}


@router.patch("/{app_id}", response_model=dict)
async def update_application_status(
    app_id: UUID,
    data: dict,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    new_status = data.get("status")
    if new_status not in ["under_review", "shortlisted", "assessment_required", "assessment_completed", "interview", "accepted", "rejected"]:
        raise HTTPException(status_code=400, detail="Invalid status")
    # Idempotent conversation anchor: lock the application row first so
    # concurrent accepts / stage moves reuse the SAME recruitment conversation
    # (application_id) instead of creating a second one. Stage changes only
    # update metadata on the existing conversation; they never insert a new one.
    app = await get_or_create_recruitment_conversation(db, app_id)
    # Candidate must not modify recruiter-controlled state
    if current_user.role.value == "CANDIDATE":
        raise HTTPException(status_code=403, detail="Forbidden")
    if current_user.role.value == "PLATFORM_ADMIN":
        was_enabled = is_chat_enabled_for_status(app.status)
        app.status = new_status
        await db.commit()
        await db.refresh(app)
        await log_audit(db, action="APPLICATION_STATUS_CHANGED", actor=current_user, resource_type="application", resource_id=app.id, details=new_status)
        if is_chat_enabled_for_status(new_status) and not was_enabled:
            await log_audit(db, action="RECRUITMENT_CHAT_ENABLED", actor=current_user, resource_type="application", resource_id=app.id, details=new_status)
        return {"id": str(app.id), "status": app.status, "chat_enabled": is_chat_enabled_for_status(app.status)}
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "move_recruitment_stage"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        was_enabled = is_chat_enabled_for_status(app.status)
        app.status = new_status
        await db.commit()
        await db.refresh(app)
        action = "CANDIDATE_SHORTLISTED" if new_status == "shortlisted" else "CANDIDATE_REJECTED" if new_status == "rejected" else "APPLICATION_STATUS_CHANGED"
        await log_audit(db, action=action, actor=current_user, company_id=current_user.company_id, resource_type="application", resource_id=app.id, details=new_status)
        if is_chat_enabled_for_status(new_status) and not was_enabled:
            # Recruitment chat becomes available — surfaced to the candidate via
            # chat_enabled and to the company via the audit/notification feed.
            await log_audit(db, action="RECRUITMENT_CHAT_ENABLED", actor=current_user, company_id=current_user.company_id, resource_type="application", resource_id=app.id, details=new_status)
        return {"id": str(app.id), "status": app.status, "chat_enabled": is_chat_enabled_for_status(app.status)}
    raise HTTPException(status_code=403, detail="Forbidden")
