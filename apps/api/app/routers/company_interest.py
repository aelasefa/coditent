from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.company_interest_schemas import (
    CompanyInterestCreate,
    CompanyInterestOut,
    CompanyInterestPage,
    CompanyInterestSubmitted,
    CompanyInterestUpdate,
)
from app.database import get_db
from app.dependencies import require_platform_admin
from app.limiter import limiter
from app.models import AdminActivityLog, CompanyInterestRequest, User


router = APIRouter()
GENERIC_CONFIRMATION = "Thanks. Our team will review your request and contact you."


@router.post(
    "/company-interest",
    response_model=CompanyInterestSubmitted,
    status_code=status.HTTP_202_ACCEPTED,
)
@limiter.limit("5/hour")
async def create_company_interest(
    request: Request,
    payload: CompanyInterestCreate,
    db: Annotated[AsyncSession, Depends(get_db)],
):
    email = str(payload.email).strip().lower()
    existing = await db.scalar(
        select(CompanyInterestRequest).where(
            func.lower(CompanyInterestRequest.email) == email,
            CompanyInterestRequest.status == "pending",
        )
    )
    if existing is None:
        db.add(CompanyInterestRequest(email=email))
        try:
            await db.commit()
        except IntegrityError:
            # A concurrent submission for the same email won the race. The
            # public response stays idempotent and does not expose queue state.
            await db.rollback()

    return {"detail": GENERIC_CONFIRMATION}


@router.get("/admin/company-interest", response_model=CompanyInterestPage)
async def list_company_interest(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    requests = (
        await db.scalars(
            select(CompanyInterestRequest).order_by(
                CompanyInterestRequest.created_at.desc(),
                CompanyInterestRequest.id.desc(),
            )
        )
    ).all()
    return {"requests": requests}


@router.patch("/admin/company-interest/{request_id}", response_model=CompanyInterestOut)
async def update_company_interest(
    request_id: UUID,
    payload: CompanyInterestUpdate,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    interest = await db.scalar(
        select(CompanyInterestRequest)
        .where(CompanyInterestRequest.id == request_id)
        .with_for_update()
    )
    if interest is None:
        raise HTTPException(status_code=404, detail="Company request not found")
    if interest.status != "pending":
        raise HTTPException(status_code=409, detail="Company request was already reviewed")

    interest.status = payload.status
    interest.reviewed_at = datetime.utcnow()
    interest.reviewed_by = admin.id
    db.add(
        AdminActivityLog(
            action="COMPANY_INTEREST_DISMISSED",
            admin_id=admin.id,
            admin_email=admin.email,
            details=interest.email,
        )
    )
    await db.commit()
    await db.refresh(interest)
    return interest
