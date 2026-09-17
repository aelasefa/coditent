from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Application, Offer, User
from app.services.recruitment_chat import is_chat_enabled_for_status

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
        return {"applications": [_serialize_application(a, u) for a, u in rows]}
    if current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Application).order_by(Application.created_at.desc()))
        apps = result.scalars().all()
        return {"applications": [{"id": str(a.id), "status": a.status, "chat_enabled": is_chat_enabled_for_status(a.status)} for a in apps]}
    raise HTTPException(status_code=403, detail="Forbidden")


def _serialize_application(app: Application, candidate: User | None) -> dict:
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
            {"full_name": candidate.full_name, "email": candidate.email}
            if candidate is not None
            else None
        ),
    }


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
        return {"id": str(app.id), "opportunity_id": str(app.opportunity_id), "status": app.status, "chat_enabled": is_chat_enabled_for_status(app.status), "ai_status": getattr(app, "ai_status", None) or "pending"}
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        candidate = (await db.execute(select(User).where(User.id == app.candidate_id))).scalar_one_or_none()
        return _serialize_application(app, candidate)
    raise HTTPException(status_code=403, detail="Forbidden")


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
    app = (await db.execute(select(Application).where(Application.id == app_id))).scalar_one_or_none()
    if not app:
        raise HTTPException(status_code=404, detail="Application not found")
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
