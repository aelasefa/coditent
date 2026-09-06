from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user, require_company_admin, require_company_member, require_recruiter
from app.models import Company, User, UserRole
from app.schemas import CompanyCreate, CompanyOut

router = APIRouter()


@router.get("", response_model=dict[str, list[CompanyOut]])
async def list_companies(db: Annotated[AsyncSession, Depends(get_db)]) -> dict:
    result = await db.execute(select(Company).order_by(Company.created_at.desc()))
    companies = result.scalars().all()
    out = []
    for c in companies:
        cnt = await db.execute(select(func.count()).select_from(User).where(User.company_id == c.id))
        count = cnt.scalar() or 0
        out.append(
            CompanyOut(
                id=c.id, name=c.name, region=c.region, description=c.description,
                logo_url=c.logo_url, industry=c.industry, location=c.location,
                website=c.website, company_size=c.company_size, contact_email=c.contact_email,
                contact_phone=c.contact_phone, status=c.status, owner_id=c.owner_id,
                created_at=c.created_at, recruiter_count=count,
            )
        )
    return {"companies": out}


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(company_id: UUID, db: Annotated[AsyncSession, Depends(get_db)]) -> CompanyOut:
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    cnt = await db.execute(select(func.count()).select_from(User).where(User.company_id == company.id))
    count = cnt.scalar() or 0
    return CompanyOut(
        id=company.id, name=company.name, region=company.region, description=company.description,
        logo_url=company.logo_url, industry=company.industry, location=company.location,
        website=company.website, company_size=company.company_size, contact_email=company.contact_email,
        contact_phone=company.contact_phone, status=company.status, owner_id=company.owner_id,
        created_at=company.created_at, recruiter_count=count,
    )


@router.post("", response_model=CompanyOut)
async def create_company(
    data: CompanyCreate,
    current_user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CompanyOut:
    # Legacy path kept for local dev — invitation flow is preferred. Prevent company hopping.
    if current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Already in a company — use invitation flow")
    existing = await db.execute(select(Company).where(Company.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company already exists")
    company = Company(
        name=data.name.strip(), region=data.region, description=data.description,
        logo_url=data.logo_url, industry=data.industry, location=data.location,
        website=data.website, company_size=data.company_size, contact_email=data.contact_email,
        contact_phone=data.contact_phone, owner_id=current_user.id,
    )
    db.add(company)
    await db.flush()
    current_user.company_id = company.id
    current_user.company_role = "OWNER"
    await db.commit()
    await db.refresh(company)
    await log_audit(db, action="COMPANY_CREATED", actor=current_user, company_id=company.id, resource_type="company", resource_id=company.id)
    return CompanyOut(
        id=company.id, name=company.name, region=company.region, description=company.description,
        logo_url=company.logo_url, industry=company.industry, location=company.location,
        website=company.website, company_size=company.company_size, contact_email=company.contact_email,
        contact_phone=company.contact_phone, status=company.status, owner_id=company.owner_id,
        created_at=company.created_at, recruiter_count=1,
    )


@router.post("/{company_id}/join", response_model=dict)
async def join_company(
    company_id: UUID,
    current_user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Deprecated: invitation-only membership. Legacy join would allow uninvited users to join any company.
    raise HTTPException(
        status_code=status.HTTP_410_GONE,
        detail="Company membership is invitation-only — use /invites/company/accept or /invites/employee/accept",
    )


@router.get("/{company_id}/recruiters", response_model=dict[str, list[dict]])
async def list_recruiters(
    company_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Company isolation: COMPANY_USER can only list own company
    if current_user.role.value == "COMPANY_USER" and str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    # Allow candidates to view recruiter list for request targeting; admins unrestricted
    result = await db.execute(select(User).where(User.company_id == company_id))
    recruiters = result.scalars().all()
    return {"recruiters": [{"id": str(r.id), "full_name": r.full_name, "email": r.email, "avatar_url": r.avatar_url, "company_role": r.company_role} for r in recruiters],
            "members": [{"id": str(r.id), "full_name": r.full_name, "email": r.email, "avatar_url": r.avatar_url, "company_role": r.company_role} for r in recruiters]}


@router.get("/{company_id}/members", response_model=dict[str, list[dict]])
async def list_members(
    company_id: UUID,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    result = await db.execute(select(User).where(User.company_id == company_id).order_by(User.created_at.asc()))
    members = result.scalars().all()
    return {"members": [{"id": str(m.id), "full_name": m.full_name, "email": m.email, "company_role": m.company_role, "is_approved": m.is_approved} for m in members]}


@router.patch("/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: UUID,
    data: CompanyCreate,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CompanyOut:
    if str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if not can(current_user.company_role, "edit_company"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: owner/admin only")
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    # Only allow whitelisted fields
    for field in ["name", "region", "description", "logo_url", "industry", "location", "website", "company_size", "contact_email", "contact_phone"]:
        val = getattr(data, field, None)
        if val is not None:
            setattr(company, field, val.strip() if isinstance(val, str) else val)
    await db.commit()
    await db.refresh(company)
    await log_audit(db, action="COMPANY_UPDATED", actor=current_user, company_id=company.id, resource_type="company", resource_id=company.id)
    cnt = await db.execute(select(func.count()).select_from(User).where(User.company_id == company.id))
    count = cnt.scalar() or 0
    return CompanyOut(id=company.id, name=company.name, region=company.region, description=company.description, logo_url=company.logo_url, industry=company.industry, location=company.location, website=company.website, company_size=company.company_size, contact_email=company.contact_email, contact_phone=company.contact_phone, status=company.status, owner_id=company.owner_id, created_at=company.created_at, recruiter_count=count)


@router.patch("/{company_id}/members/{user_id}", response_model=dict)
async def change_member_role(
    company_id: UUID,
    user_id: UUID,
    data: dict,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if not can(current_user.company_role, "change_employee_roles"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    new_role = str(data.get("company_role") or data.get("role") or "").upper().strip()
    if new_role not in {"ADMIN", "HR", "RECRUITER", "HIRING_MANAGER"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid role — cannot set OWNER via this endpoint")
    target = (await db.execute(select(User).where(User.id == user_id, User.company_id == company_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if target.company_role == "OWNER":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot change OWNER role")
    target.company_role = new_role
    await db.commit()
    await log_audit(db, action="EMPLOYEE_ROLE_CHANGED", actor=current_user, company_id=company_id, resource_type="user", resource_id=user_id, details=new_role)
    return {"id": str(target.id), "company_role": target.company_role}


@router.delete("/{company_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    company_id: UUID,
    user_id: UUID,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if not can(current_user.company_role, "remove_employees"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if str(current_user.id) == str(user_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove yourself")
    target = (await db.execute(select(User).where(User.id == user_id, User.company_id == company_id))).scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")
    if target.company_role == "OWNER":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot remove OWNER")
    target.company_id = None
    target.company_role = None
    await db.commit()
    await log_audit(db, action="EMPLOYEE_REMOVED", actor=current_user, company_id=company_id, resource_type="user", resource_id=user_id)


@router.get("/{company_id}/subscription", response_model=dict)
async def get_subscription(
    company_id: UUID,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    if str(current_user.company_id) != str(company_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if not can(current_user.company_role, "manage_subscription"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: owner only")
    result = await db.execute(select(Company).where(Company.id == company_id))
    company = result.scalar_one_or_none()
    if not company:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    return {"company_id": str(company.id), "status": company.status, "owner_id": str(company.owner_id) if company.owner_id else None}
