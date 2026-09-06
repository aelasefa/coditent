from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user
from app.models import Application, Assessment, Offer

router = APIRouter()


@router.get("", response_model=dict)
async def list_assessments(
    current_user: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    if getattr(current_user, "role", None) and current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Assessment).order_by(Assessment.created_at.desc()))
        items = result.scalars().all()
        return {"assessments": [{"id": str(a.id), "status": a.status} for a in items]}
    if getattr(current_user, "role", None) and current_user.role.value == "CANDIDATE":
        result = await db.execute(select(Assessment).where(Assessment.candidate_id == current_user.id).order_by(Assessment.created_at.desc()))
        items = result.scalars().all()
        return {"assessments": [{"id": str(a.id), "status": a.status} for a in items]}
    if getattr(current_user, "role", None) and current_user.role.value == "COMPANY_USER":
        if not can(getattr(current_user, "company_role", None), "view_assessments"):
            raise HTTPException(status_code=403, detail="Forbidden")
        result = await db.execute(
            select(Assessment)
            .join(Application, Assessment.application_id == Application.id)
            .join(Offer, Application.opportunity_id == Offer.id)
            .where(Offer.company_id == current_user.company_id)
            .order_by(Assessment.created_at.desc())
        )
        items = result.scalars().all()
        return {"assessments": [{"id": str(a.id), "status": a.status, "score": a.score} for a in items]}
    raise HTTPException(status_code=403, detail="Forbidden")


@router.get("/{assessment_id}", response_model=dict)
async def get_assessment(
    assessment_id: UUID,
    current_user: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ass = (await db.execute(select(Assessment).where(Assessment.id == assessment_id))).scalar_one_or_none()
    if not ass:
        raise HTTPException(status_code=404, detail="Assessment not found")
    if getattr(current_user, "role", None) and current_user.role.value == "PLATFORM_ADMIN":
        return {"id": str(ass.id), "status": ass.status, "score": ass.score}
    if getattr(current_user, "role", None) and current_user.role.value == "CANDIDATE":
        if ass.candidate_id != current_user.id:
            raise HTTPException(status_code=404, detail="Assessment not found")
        # Verify candidate owns the application
        app = (await db.execute(select(Application).where(Application.id == ass.application_id, Application.candidate_id == current_user.id))).scalar_one_or_none()
        if not app:
            raise HTTPException(status_code=404, detail="Assessment not found")
        return {"id": str(ass.id), "status": ass.status, "score": ass.score}
    if getattr(current_user, "role", None) and current_user.role.value == "COMPANY_USER":
        if not can(getattr(current_user, "company_role", None), "view_assessments"):
            raise HTTPException(status_code=403, detail="Forbidden")
        app = (await db.execute(select(Application).where(Application.id == ass.application_id))).scalar_one_or_none()
        if not app:
            raise HTTPException(status_code=404, detail="Assessment not found")
        offer = (await db.execute(select(Offer).where(Offer.id == app.opportunity_id))).scalar_one_or_none()
        if not offer or offer.company_id != getattr(current_user, "company_id", None):
            raise HTTPException(status_code=404, detail="Assessment not found")
        return {"id": str(ass.id), "status": ass.status, "score": ass.score}
    raise HTTPException(status_code=403, detail="Forbidden")
