from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user, require_candidate
from app.models import CandidateRequest, Company, RequestStatus, User, UserRole
from app.schemas import (
    CandidateRequestCreate,
    CandidateRequestListOut,
    CandidateRequestOut,
    CandidateRequestStatusUpdate,
    CompanyOut,
    UserOut,
)

router = APIRouter()


def _to_out(req: CandidateRequest, candidate: User | None = None, company: Company | None = None, recruiter: User | None = None) -> CandidateRequestOut:
    return CandidateRequestOut(
        id=req.id,
        candidate_id=req.candidate_id,
        company_id=req.company_id,
        recruiter_id=req.recruiter_id,
        message=req.message,
        status=req.status.value if hasattr(req.status, "value") else str(req.status),
        created_at=req.created_at,
        candidate=UserOut.model_validate(candidate) if candidate else None,
        company=CompanyOut.model_validate(company) if company else None,
        recruiter=UserOut.model_validate(recruiter) if recruiter else None,
    )


@router.post("", response_model=CandidateRequestOut)
async def create_request(
    data: CandidateRequestCreate,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateRequestOut:
    # verify company exists
    comp_res = await db.execute(select(Company).where(Company.id == data.company_id))
    company = comp_res.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    recruiter = None
    if data.recruiter_id:
        r = await db.execute(
            select(User).where(
                User.id == data.recruiter_id,
                User.role == UserRole.COMPANY_USER,
                User.company_id == company.id,
                User.is_approved.is_(True),
            )
        )
        recruiter = r.scalar_one_or_none()
        if not recruiter:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recruiter not found")
    # prevent duplicate pending request to same company
    dup = await db.execute(
        select(CandidateRequest).where(
            CandidateRequest.candidate_id == current_user.id,
            CandidateRequest.company_id == company.id,
            CandidateRequest.status == RequestStatus.pending,
        )
    )
    if dup.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You already have a pending request to this company")
    req = CandidateRequest(candidate_id=current_user.id, company_id=company.id, recruiter_id=data.recruiter_id, message=data.message, status=RequestStatus.pending)
    db.add(req)
    await db.commit()
    await db.refresh(req)
    return _to_out(req, current_user, company, recruiter)


@router.get("", response_model=CandidateRequestListOut)
async def list_requests(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    role = current_user.role.value
    if role == "CANDIDATE":
        res = await db.execute(select(CandidateRequest).where(CandidateRequest.candidate_id == current_user.id).order_by(CandidateRequest.created_at.desc()))
    elif role in ("RECRUITER", "COMPANY_USER"):
        # recruiter / company user sees requests for their company
        if not current_user.company_id:
            return {"requests": []}
        res = await db.execute(select(CandidateRequest).where(CandidateRequest.company_id == current_user.company_id).order_by(CandidateRequest.created_at.desc()))
    elif role in ("ADMIN", "PLATFORM_ADMIN"):
        res = await db.execute(select(CandidateRequest).order_by(CandidateRequest.created_at.desc()))
    else:
        # fallback: no access
        return {"requests": []}
    reqs = res.scalars().all()
    candidate_ids = {req.candidate_id for req in reqs}
    company_ids = {req.company_id for req in reqs}
    recruiter_ids = {req.recruiter_id for req in reqs if req.recruiter_id}
    users = {}
    if candidate_ids or recruiter_ids:
        user_rows = await db.execute(
            select(User).where(User.id.in_(candidate_ids | recruiter_ids))
        )
        users = {user.id: user for user in user_rows.scalars()}
    companies = {}
    if company_ids:
        company_rows = await db.execute(
            select(Company).where(Company.id.in_(company_ids))
        )
        companies = {company.id: company for company in company_rows.scalars()}
    out = [
        _to_out(
            req,
            users.get(req.candidate_id),
            companies.get(req.company_id),
            users.get(req.recruiter_id) if req.recruiter_id else None,
        )
        for req in reqs
    ]
    return {"requests": out}


@router.patch("/{request_id}", response_model=CandidateRequestOut)
async def update_request_status(
    request_id: UUID,
    status_data: CandidateRequestStatusUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CandidateRequestOut:
    new_status = status_data.status
    res = await db.execute(select(CandidateRequest).where(CandidateRequest.id == request_id))
    req = res.scalar_one_or_none()
    if not req:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Request not found")
    is_platform_admin = current_user.role == UserRole.PLATFORM_ADMIN
    is_company_member = (
        current_user.role == UserRole.COMPANY_USER
        and current_user.is_approved
        and current_user.company_id == req.company_id
    )
    if not is_platform_admin and not is_company_member:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not in this company")
    if req.status != RequestStatus.pending:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Request has already been decided",
        )
    req.status = RequestStatus(new_status)
    # if accepting and recruiter_id was null, assign current recruiter
    if new_status == "accepted" and not req.recruiter_id and is_company_member:
        req.recruiter_id = current_user.id
    await db.commit()
    await db.refresh(req)
    cand = (await db.execute(select(User).where(User.id == req.candidate_id))).scalar_one_or_none()
    comp = (await db.execute(select(Company).where(Company.id == req.company_id))).scalar_one_or_none()
    rec = None
    if req.recruiter_id:
        rec = (await db.execute(select(User).where(User.id == req.recruiter_id))).scalar_one_or_none()
    return _to_out(req, cand, comp, rec)
