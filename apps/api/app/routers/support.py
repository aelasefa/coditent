import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, require_platform_admin
from app.limiter import limiter
from app.models import AdminActivityLog, Company, SupportTicket, User
from app.support_schemas import AdminSupportOut, AdminSupportPage, SupportCreate, SupportOut, SupportPage, SupportStatus, SupportUpdate

router = APIRouter()


@router.post("/support", response_model=SupportOut, status_code=201)
@limiter.limit("5/minute")
async def create_report(
    request: Request,
    payload: SupportCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    # A retry after a lost response must not create a second report.
    reporter_id = current_user.id
    existing = await db.get(SupportTicket, payload.request_id)
    if existing:
        if existing.reporter_id != reporter_id:
            raise HTTPException(409, "Please start a new report")
        return existing
    ticket = SupportTicket(
        id=payload.request_id,
        reporter_id=reporter_id,
        company_id=current_user.company_id,
        **payload.model_dump(exclude={"request_id"}),
    )
    db.add(ticket)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()
        existing = await db.get(SupportTicket, payload.request_id)
        if existing and existing.reporter_id == reporter_id:
            return existing
        raise HTTPException(409, "Please start a new report")
    await db.refresh(ticket)
    return ticket


@router.get("/support", response_model=SupportPage)
async def my_reports(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    own = SupportTicket.reporter_id == current_user.id
    total = await db.scalar(select(func.count()).select_from(SupportTicket).where(own))
    tickets = (await db.scalars(select(SupportTicket).where(own).order_by(SupportTicket.created_at.desc(), SupportTicket.id.desc()).offset(offset).limit(limit))).all()
    return {"tickets": tickets, "total": total}


@router.get("/admin/support", response_model=AdminSupportPage)
async def all_reports(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    status: SupportStatus | None = None,
    offset: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=50),
):
    filters = [SupportTicket.status == status] if status else []
    total = await db.scalar(select(func.count()).select_from(SupportTicket).where(*filters))
    rows = (await db.execute(
        select(SupportTicket, User, Company.name)
        .join(User, User.id == SupportTicket.reporter_id)
        .outerjoin(Company, Company.id == SupportTicket.company_id)
        .where(*filters)
        .order_by(SupportTicket.created_at.desc(), SupportTicket.id.desc())
        .offset(offset).limit(limit)
    )).all()
    tickets = [AdminSupportOut(
        **SupportOut.model_validate(ticket).model_dump(),
        reporter_name=user.full_name,
        reporter_email=user.email,
        reporter_role=user.role.value,
        company_name=company_name,
    ) for ticket, user, company_name in rows]
    return {"tickets": tickets, "total": total}


@router.patch("/admin/support/{ticket_id}", response_model=SupportOut)
async def update_report(
    ticket_id: uuid.UUID,
    payload: SupportUpdate,
    admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    ticket = await db.get(SupportTicket, ticket_id)
    if ticket is None:
        raise HTTPException(404, "Report not found")
    ticket.status = payload.status
    ticket.response = payload.response or None
    db.add(AdminActivityLog(
        action="SUPPORT_REPORT_UPDATED",
        admin_id=admin.id,
        admin_email=admin.email,
        target_user_id=ticket.reporter_id,
        details=f"Support report {ticket.id}: {ticket.status}",
    ))
    await db.commit()
    await db.refresh(ticket)
    return ticket
