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

router = APIRouter()


@router.get("", response_model=dict[str, list[dict]])
async def list_applications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if current_user.role.value == "CANDIDATE":
        result = await db.execute(select(Application).where(Application.candidate_id == current_user.id).order_by(Application.created_at.desc()))
        apps = result.scalars().all()
        return {"applications": [{"id": str(a.id), "opportunity_id": str(a.opportunity_id), "status": a.status, "created_at": a.created_at.isoformat()} for a in apps]}
    if current_user.role.value == "COMPANY_USER":
        if not current_user.company_id or not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        result = await db.execute(
            select(Application).join(Offer, Application.opportunity_id == Offer.id).where(Offer.company_id == current_user.company_id).order_by(Application.created_at.desc())
        )
        apps = result.scalars().all()
        return {"applications": [{"id": str(a.id), "candidate_id": str(a.candidate_id), "opportunity_id": str(a.opportunity_id), "status": a.status} for a in apps]}
    if current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Application).order_by(Application.created_at.desc()))
        apps = result.scalars().all()
        return {"applications": [{"id": str(a.id), "status": a.status} for a in apps]}
    raise HTTPException(status_code=403, detail="Forbidden")


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
        return {"id": str(app.id), "candidate_id": str(app.candidate_id), "opportunity_id": str(app.opportunity_id), "status": app.status}
    if current_user.role.value == "CANDIDATE":
        if app.candidate_id != current_user.id:
            raise HTTPException(status_code=404, detail="Application not found")
        return {"id": str(app.id), "opportunity_id": str(app.opportunity_id), "status": app.status}
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "view_applications"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        return {"id": str(app.id), "candidate_id": str(app.candidate_id), "opportunity_id": str(app.opportunity_id), "status": app.status}
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
    return {"id": str(app.id), "status": app.status}


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
        app.status = new_status
        await db.commit()
        await db.refresh(app)
        await log_audit(db, action="APPLICATION_STATUS_CHANGED", actor=current_user, resource_type="application", resource_id=app.id, details=new_status)
        return {"id": str(app.id), "status": app.status}
    if current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "move_recruitment_stage"):
            raise HTTPException(status_code=403, detail="Forbidden")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != current_user.company_id:
            raise HTTPException(status_code=404, detail="Application not found")
        app.status = new_status
        await db.commit()
        await db.refresh(app)
        action = "CANDIDATE_SHORTLISTED" if new_status == "shortlisted" else "CANDIDATE_REJECTED" if new_status == "rejected" else "APPLICATION_STATUS_CHANGED"
        await log_audit(db, action=action, actor=current_user, company_id=current_user.company_id, resource_type="application", resource_id=app.id, details=new_status)
        return {"id": str(app.id), "status": app.status}
    raise HTTPException(status_code=403, detail="Forbidden")
