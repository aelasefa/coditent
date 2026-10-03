from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.database import get_db
from app.dependencies import get_current_user, require_platform_admin
from app.models import Institution, InstitutionMembership, User
from app.schemas import (
    InstitutionCreate,
    InstitutionLicenseUpdate,
    InstitutionListOut,
    InstitutionMemberOut,
    InstitutionMembershipCreate,
    InstitutionMembershipListOut,
    InstitutionOut,
)


router = APIRouter()


async def _seat_count(db: AsyncSession, institution_id: UUID) -> int:
    return int(
        await db.scalar(
            select(func.count(InstitutionMembership.id)).where(
                InstitutionMembership.institution_id == institution_id,
                InstitutionMembership.status == "active",
            )
        )
        or 0
    )


async def _institution_out(db: AsyncSession, institution: Institution) -> InstitutionOut:
    return InstitutionOut(
        id=institution.id,
        name=institution.name,
        domain=institution.domain,
        status=institution.status,
        license_plan=institution.license_plan,
        seat_limit=institution.seat_limit,
        seats_used=await _seat_count(db, institution.id),
        license_expires_at=institution.license_expires_at,
        created_at=institution.created_at,
    )


def _member_out(membership: InstitutionMembership, user: User) -> InstitutionMemberOut:
    return InstitutionMemberOut(
        id=membership.id,
        user_id=user.id,
        email=user.email,
        full_name=user.full_name,
        role=membership.role,
        status=membership.status,
        created_at=membership.created_at,
    )


async def _require_manager(
    db: AsyncSession, institution_id: UUID, current_user: User
) -> Institution:
    institution = await db.get(Institution, institution_id)
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    if current_user.role.value == "PLATFORM_ADMIN":
        return institution
    membership = (
        await db.execute(
            select(InstitutionMembership).where(
                InstitutionMembership.institution_id == institution_id,
                InstitutionMembership.user_id == current_user.id,
                InstitutionMembership.role == "ADMIN",
                InstitutionMembership.status == "active",
            )
        )
    ).scalar_one_or_none()
    if membership is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    return institution


@router.get("", response_model=InstitutionListOut)
async def list_institutions(
    _: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionListOut:
    institutions = list(
        (await db.execute(select(Institution).order_by(Institution.name.asc()))).scalars()
    )
    return InstitutionListOut(
        institutions=[await _institution_out(db, item) for item in institutions]
    )


@router.post("", response_model=InstitutionOut, status_code=status.HTTP_201_CREATED)
async def create_institution(
    data: InstitutionCreate,
    current_admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionOut:
    institution = Institution(
        name=data.name,
        domain=data.domain,
        license_plan=data.license_plan,
        seat_limit=data.seat_limit,
        license_expires_at=data.license_expires_at,
        status="active",
    )
    db.add(institution)
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Institution name or domain already exists") from exc
    await db.refresh(institution)
    await log_audit(db, action="INSTITUTION_CREATED", actor=current_admin, resource_type="institution", resource_id=institution.id)
    return await _institution_out(db, institution)


@router.get("/me", response_model=InstitutionListOut)
async def list_my_institutions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionListOut:
    institutions = list(
        (
            await db.execute(
                select(Institution)
                .join(InstitutionMembership, InstitutionMembership.institution_id == Institution.id)
                .where(
                    InstitutionMembership.user_id == current_user.id,
                    InstitutionMembership.status == "active",
                )
                .order_by(Institution.name.asc())
            )
        ).scalars()
    )
    return InstitutionListOut(
        institutions=[await _institution_out(db, item) for item in institutions]
    )


@router.patch("/{institution_id}/license", response_model=InstitutionOut)
async def update_institution_license(
    institution_id: UUID,
    data: InstitutionLicenseUpdate,
    current_admin: Annotated[User, Depends(require_platform_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionOut:
    institution = (
        await db.execute(
            select(Institution).where(Institution.id == institution_id).with_for_update()
        )
    ).scalar_one_or_none()
    if institution is None:
        raise HTTPException(status_code=404, detail="Institution not found")
    seats_used = await _seat_count(db, institution.id)
    if data.seat_limit < seats_used:
        raise HTTPException(status_code=409, detail=f"Seat limit cannot be below {seats_used} active members")
    institution.status = data.status
    institution.license_plan = data.license_plan
    institution.seat_limit = data.seat_limit
    institution.license_expires_at = data.license_expires_at
    await db.commit()
    await db.refresh(institution)
    await log_audit(db, action="INSTITUTION_LICENSE_UPDATED", actor=current_admin, resource_type="institution", resource_id=institution.id, details=f"plan={institution.license_plan};status={institution.status};seats={institution.seat_limit}")
    return await _institution_out(db, institution)


@router.get("/{institution_id}/members", response_model=InstitutionMembershipListOut)
async def list_institution_members(
    institution_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionMembershipListOut:
    institution = await _require_manager(db, institution_id, current_user)
    rows = list(
        (
            await db.execute(
                select(InstitutionMembership, User)
                .join(User, InstitutionMembership.user_id == User.id)
                .where(InstitutionMembership.institution_id == institution_id)
                .order_by(InstitutionMembership.created_at.asc())
            )
        ).all()
    )
    return InstitutionMembershipListOut(
        institution=await _institution_out(db, institution),
        members=[_member_out(membership, user) for membership, user in rows],
    )


@router.post("/{institution_id}/members", response_model=InstitutionMemberOut, status_code=201)
async def add_institution_member(
    institution_id: UUID,
    data: InstitutionMembershipCreate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionMemberOut:
    await _require_manager(db, institution_id, current_user)
    institution = (
        await db.execute(
            select(Institution).where(Institution.id == institution_id).with_for_update()
        )
    ).scalar_one()
    if institution.status != "active" or (
        institution.license_expires_at is not None
        and institution.license_expires_at <= datetime.utcnow()
    ):
        raise HTTPException(status_code=402, detail="Institution license is inactive or expired")
    user = (
        await db.execute(select(User).where(User.email == str(data.email).lower()))
    ).scalar_one_or_none()
    if user is None or user.is_active is False:
        raise HTTPException(status_code=404, detail="Active user not found")
    membership = (
        await db.execute(
            select(InstitutionMembership).where(
                InstitutionMembership.institution_id == institution_id,
                InstitutionMembership.user_id == user.id,
            )
        )
    ).scalar_one_or_none()
    if membership is not None and membership.status == "active":
        raise HTTPException(status_code=409, detail="User is already an active member")
    if await _seat_count(db, institution_id) >= institution.seat_limit:
        raise HTTPException(status_code=402, detail="Institution seat limit reached")
    if membership is None:
        membership = InstitutionMembership(
            institution_id=institution_id,
            user_id=user.id,
            role=data.role,
            status="active",
        )
        db.add(membership)
    else:
        membership.role = data.role
        membership.status = "active"
    await db.commit()
    await db.refresh(membership)
    await log_audit(db, action="INSTITUTION_MEMBER_ADDED", actor=current_user, resource_type="institution_membership", resource_id=membership.id, details=f"institution_id={institution_id};role={membership.role}")
    return _member_out(membership, user)


@router.delete("/{institution_id}/members/{membership_id}", response_model=InstitutionMemberOut)
async def remove_institution_member(
    institution_id: UUID,
    membership_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> InstitutionMemberOut:
    await _require_manager(db, institution_id, current_user)
    row = (
        await db.execute(
            select(InstitutionMembership, User)
            .join(User, InstitutionMembership.user_id == User.id)
            .where(
                InstitutionMembership.id == membership_id,
                InstitutionMembership.institution_id == institution_id,
            )
            .with_for_update()
        )
    ).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Institution member not found")
    membership, user = row
    if membership.role == "ADMIN" and membership.status == "active":
        admin_count = int(
            await db.scalar(
                select(func.count(InstitutionMembership.id)).where(
                    InstitutionMembership.institution_id == institution_id,
                    InstitutionMembership.role == "ADMIN",
                    InstitutionMembership.status == "active",
                )
            )
            or 0
        )
        if admin_count <= 1 and current_user.role.value != "PLATFORM_ADMIN":
            raise HTTPException(status_code=409, detail="The last institution admin cannot be removed")
    membership.status = "inactive"
    await db.commit()
    await db.refresh(membership)
    await log_audit(db, action="INSTITUTION_MEMBER_REMOVED", actor=current_user, resource_type="institution_membership", resource_id=membership.id, details=f"institution_id={institution_id}")
    return _member_out(membership, user)
