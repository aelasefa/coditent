import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_pagination, require_admin
from app.models import AdminActivityLog, Offer, User, UserRole
from app.observability import get_logger
from app.schemas import AdminActivityOut, AdminStatsOut, OfferOut, RecruiterApprovalOut, TokenResponse, UserOut
from app.utils.jwt import create_access_token


router = APIRouter(prefix="/admin")
logger = get_logger("admin")


async def _log_admin_action(
    db: AsyncSession,
    *,
    action: str,
    admin_user: User,
    target_user: User | None = None,
    details: str | None = None,
) -> None:
    try:
        db.add(
            AdminActivityLog(
                action=action,
                admin_id=admin_user.id,
                admin_email=admin_user.email,
                target_user_id=target_user.id if target_user else None,
                target_user_email=target_user.email if target_user else None,
                details=details,
            )
        )
        await db.commit()
        logger.info(
            "admin_action",
            action=action,
            admin_id=str(admin_user.id),
            target_user_id=str(target_user.id) if target_user else None,
        )
    except SQLAlchemyError:
        await db.rollback()
        logger.error("admin_action_failed", action=action, admin_id=str(admin_user.id))


@router.get("/recruiters/pending", response_model=dict[str, list[RecruiterApprovalOut]])
async def list_pending_recruiters(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[RecruiterApprovalOut]]:
    result = await db.execute(
        select(User)
        .where(User.role == UserRole.RECRUITER, User.is_approved.is_(False))
        .order_by(User.created_at.asc())
    )
    recruiters = result.scalars().all()
    return {"recruiters": [RecruiterApprovalOut.model_validate(recruiter) for recruiter in recruiters]}


@router.patch("/recruiters/{recruiter_id}/approve", response_model=RecruiterApprovalOut)
async def approve_recruiter(
    recruiter_id: uuid.UUID,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruiterApprovalOut:
    result = await db.execute(select(User).where(User.id == recruiter_id))
    recruiter = result.scalar_one_or_none()

    if recruiter is None or recruiter.role != UserRole.RECRUITER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recruiter not found")

    if not recruiter.is_approved:
        recruiter.is_approved = True

    await db.commit()
    await db.refresh(recruiter)

    await _log_admin_action(
        db,
        action="RECRUITER_APPROVED",
        admin_user=current_admin,
        target_user=recruiter,
        details="Recruiter approved by admin",
    )
    return RecruiterApprovalOut.model_validate(recruiter)


@router.patch("/recruiters/{recruiter_id}/reject", response_model=RecruiterApprovalOut)
async def reject_recruiter(
    recruiter_id: uuid.UUID,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> RecruiterApprovalOut:
    result = await db.execute(select(User).where(User.id == recruiter_id))
    recruiter = result.scalar_one_or_none()

    if recruiter is None or recruiter.role != UserRole.RECRUITER:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recruiter not found")

    recruiter.is_approved = False

    await db.commit()
    await db.refresh(recruiter)

    await _log_admin_action(
        db,
        action="RECRUITER_REJECTED",
        admin_user=current_admin,
        target_user=recruiter,
        details="Recruiter rejected by admin",
    )
    return RecruiterApprovalOut.model_validate(recruiter)


@router.get("/stats", response_model=AdminStatsOut)
async def get_admin_stats(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminStatsOut:
    total_users = await db.scalar(select(func.count(User.id)))
    total_candidates = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.CANDIDATE))
    total_recruiters = await db.scalar(select(func.count(User.id)).where(User.role == UserRole.RECRUITER))
    total_offers = await db.scalar(select(func.count(Offer.id)))

    return AdminStatsOut(
        total_users=int(total_users or 0),
        total_candidates=int(total_candidates or 0),
        total_recruiters=int(total_recruiters or 0),
        total_offers=int(total_offers or 0),
    )


@router.get("/users", response_model=dict[str, list[UserOut]])
async def get_admin_users(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> dict[str, list[UserOut]]:
    limit, offset = pagination
    result = await db.execute(
        select(User).order_by(User.created_at.desc()).limit(limit).offset(offset)
    )
    users = result.scalars().all()
    return {"users": [UserOut.model_validate(user) for user in users]}


@router.get("/offers", response_model=dict[str, list[OfferOut]])
async def get_admin_offers(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> dict[str, list[OfferOut]]:
    limit, offset = pagination
    result = await db.execute(
        select(Offer).order_by(Offer.posted_at.desc()).limit(limit).offset(offset)
    )
    offers = result.scalars().all()
    return {"offers": [OfferOut.model_validate(offer) for offer in offers]}


@router.get("/activity", response_model=dict[str, list[AdminActivityOut]])
async def get_admin_activity(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> dict[str, list[AdminActivityOut]]:
    try:
        limit, offset = pagination
        result = await db.execute(
            select(AdminActivityLog)
            .order_by(AdminActivityLog.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        activity = result.scalars().all()
        return {"activity": [AdminActivityOut.model_validate(item) for item in activity]}
    except SQLAlchemyError:
        await db.rollback()
        return {"activity": []}


@router.post("/impersonate/{user_id}", response_model=TokenResponse)
async def impersonate_user(
    user_id: uuid.UUID,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> TokenResponse:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role.value,
            "impersonated_by": "admin",
            "admin_id": str(current_admin.id),
        }
    )

    user_out = UserOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        is_approved=user.is_approved,
        full_name=user.full_name,
    )

    await _log_admin_action(
        db,
        action="IMPERSONATION_STARTED",
        admin_user=current_admin,
        target_user=user,
        details=f"Admin impersonated user role={user.role.value}",
    )

    return TokenResponse(token=token, user=user_out)
