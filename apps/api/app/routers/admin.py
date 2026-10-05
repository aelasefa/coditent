import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_pagination, require_admin
from app.models import (
    AdminActivityLog,
    CandidateProfile,
    Company,
    CompanyStatus,
    Offer,
    User,
    UserRole,
)
from app.observability import get_logger
from app.schemas import (
    AdminActivityOut,
    AdminMutationOut,
    AdminStatsOut,
    AdminUserCreate,
    AdminUserUpdate,
    CompanyListOut,
    CompanyOut,
    CompanySubscriptionOut,
    CompanySubscriptionUpdate,
    OfferOut,
    RecruiterApprovalOut,
    TokenResponse,
    UserOut,
)
from app.services.authentication import AuthenticationRejected, issue_access_token
from app.services.offer_eligibility import eligible_offer_predicates
from app.services.passwords import hash_password
from app.services.entitlements import EntitlementDenied, entitlement_snapshot


router = APIRouter(prefix="/admin")
logger = get_logger("admin")


def _queue_admin_action(
    db: AsyncSession,
    *,
    action: str,
    admin_user: User,
    target_user: User | None = None,
    details: str | None = None,
) -> None:
    """Add an audit record to the caller's transaction.

    Security-sensitive mutations and their audit record must commit together.
    The legacy helper below remains for existing actions that already commit
    before logging.
    """
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
    total_recruiters = await db.scalar(
        select(func.count(User.id)).where(
            User.role.in_((UserRole.COMPANY_USER, UserRole.RECRUITER))
        )
    )
    total_offers = await db.scalar(select(func.count(Offer.id)))
    total_companies = await db.scalar(select(func.count(Company.id)))
    active_companies = await db.scalar(select(func.count(Company.id)).where(Company.status == CompanyStatus.active))
    pending_invites = await db.scalar(select(func.count(text("1"))).select_from(text("company_invitations")).where(text("status = 'pending'")))
    expired_invites = await db.scalar(select(func.count(text("1"))).select_from(text("company_invitations")).where(text("status = 'expired'")))
    active_offers = await db.scalar(
        select(func.count(Offer.id)).where(*eligible_offer_predicates())
    )

    return AdminStatsOut(
        total_users=int(total_users or 0),
        total_candidates=int(total_candidates or 0),
        total_recruiters=int(total_recruiters or 0),
        total_offers=int(total_offers or 0),
        total_companies=int(total_companies or 0),
        active_companies=int(active_companies or 0),
        pending_company_invitations=int(pending_invites or 0),
        expired_company_invitations=int(expired_invites or 0),
        active_offers=int(active_offers or 0),
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


@router.post(
    "/users",
    response_model=UserOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_admin_managed_user(
    data: AdminUserCreate,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    """Create a candidate without opening a company-membership bypass."""
    email = str(data.email).strip().lower()
    existing = await db.scalar(select(User.id).where(func.lower(User.email) == email))
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")

    user = User(
        email=email,
        password_hash=hash_password(data.password),
        role=UserRole.CANDIDATE,
        is_approved=True,
        is_active=True,
        full_name=data.full_name,
    )
    db.add(user)
    await db.flush()
    db.add(CandidateProfile(user_id=user.id))
    _queue_admin_action(
        db,
        action="USER_CREATED",
        admin_user=current_admin,
        target_user=user,
        details="Platform admin created candidate account",
    )
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.patch("/users/{user_id}", response_model=UserOut)
async def update_admin_managed_user(
    user_id: uuid.UUID,
    data: AdminUserUpdate,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> UserOut:
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if not data.model_fields_set:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="No changes supplied")
    if user.id == current_admin.id and data.is_active is False:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot deactivate your own account")

    changes: list[str] = []
    if "email" in data.model_fields_set and data.email is not None:
        email = str(data.email).strip().lower()
        duplicate = await db.scalar(
            select(User.id).where(func.lower(User.email) == email, User.id != user.id)
        )
        if duplicate is not None:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Email is already registered")
        if user.email != email:
            user.email = email
            user.pending_email = None
            user.pending_email_otp_hash = None
            user.pending_email_expires_at = None
            user.pending_email_attempts = 0
            user.auth_version = int(user.auth_version or 0) + 1
            changes.append("email")

    if "full_name" in data.model_fields_set and data.full_name is not None:
        if user.full_name != data.full_name:
            user.full_name = data.full_name
            changes.append("full_name")

    if "is_active" in data.model_fields_set and data.is_active is not None:
        if data.is_active and user.company_id is not None:
            company_status = await db.scalar(
                select(Company.status).where(Company.id == user.company_id)
            )
            if company_status != CompanyStatus.active.value:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Reactivate the organization before its members",
                )
        if user.is_active != data.is_active:
            user.is_active = data.is_active
            user.auth_version = int(user.auth_version or 0) + 1
            changes.append("is_active")

    if not changes:
        return UserOut.model_validate(user)

    _queue_admin_action(
        db,
        action="USER_UPDATED",
        admin_user=current_admin,
        target_user=user,
        details=f"Changed fields: {','.join(changes)}",
    )
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.delete("/users/{user_id}", response_model=AdminMutationOut)
async def deactivate_admin_managed_user(
    user_id: uuid.UUID,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMutationOut:
    if user_id == current_admin.id:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="You cannot deactivate your own account")
    user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if user.is_active:
        user.is_active = False
        user.auth_version = int(user.auth_version or 0) + 1
        _queue_admin_action(
            db,
            action="USER_DEACTIVATED",
            admin_user=current_admin,
            target_user=user,
            details="Account soft-deactivated; retained records were not deleted",
        )
        await db.commit()
    return AdminMutationOut(id=user.id, detail="deactivated", is_active=False)


@router.get("/companies", response_model=CompanyListOut)
async def get_admin_companies(
    _: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> CompanyListOut:
    limit, offset = pagination
    result = await db.execute(
        select(Company, func.count(User.id))
        .outerjoin(User, User.company_id == Company.id)
        .group_by(Company.id)
        .order_by(Company.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    companies = [
        CompanyOut.model_validate(company).model_copy(
            update={"recruiter_count": int(member_count or 0)}
        )
        for company, member_count in result.all()
    ]
    return CompanyListOut(companies=companies)


@router.delete("/companies/{company_id}", response_model=AdminMutationOut)
async def archive_company(
    company_id: uuid.UUID,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> AdminMutationOut:
    """Soft-delete an organization while retaining recruitment evidence."""
    company = await db.scalar(
        select(Company).where(Company.id == company_id).with_for_update()
    )
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    if company.status == CompanyStatus.inactive.value:
        return AdminMutationOut(id=company.id, detail="already inactive", is_active=False)

    members = list(
        (
            await db.execute(
                select(User).where(User.company_id == company.id).with_for_update()
            )
        ).scalars().all()
    )
    offers = list(
        (
            await db.execute(
                select(Offer).where(
                    Offer.company_id == company.id,
                    Offer.opportunity_status != "closed",
                ).with_for_update()
            )
        ).scalars().all()
    )

    company.status = CompanyStatus.inactive.value
    now = datetime.utcnow()
    for member in members:
        if member.is_active:
            member.is_active = False
            member.auth_version = int(member.auth_version or 0) + 1
    for offer in offers:
        offer.active = False
        offer.opportunity_status = "closed"
        offer.closed_at = offer.closed_at or now

    # Invitation rows predate ORM mappings; retain them but prevent acceptance.
    await db.execute(
        text(
            "UPDATE employee_invitations SET status='revoked' "
            "WHERE company_id=:company_id AND status='pending'"
        ),
        {"company_id": str(company.id)},
    )
    _queue_admin_action(
        db,
        action="COMPANY_ARCHIVED",
        admin_user=current_admin,
        details=(
            f"company_id={company.id}; deactivated_users={len(members)}; "
            f"closed_offers={len(offers)}"
        ),
    )
    await db.commit()
    return AdminMutationOut(
        id=company.id,
        detail="organization archived",
        is_active=False,
        affected_users=len(members),
        closed_offers=len(offers),
    )


@router.patch(
    "/companies/{company_id}/subscription",
    response_model=CompanySubscriptionOut,
)
async def update_company_subscription(
    company_id: uuid.UUID,
    data: CompanySubscriptionUpdate,
    current_admin: Annotated[User, Depends(require_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CompanySubscriptionOut:
    company = await db.scalar(
        select(Company).where(Company.id == company_id).with_for_update()
    )
    if company is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
    company.subscription_plan = data.plan
    company.subscription_status = data.subscription_status
    company.subscription_expires_at = data.expires_at
    _queue_admin_action(
        db,
        action="COMPANY_SUBSCRIPTION_UPDATED",
        admin_user=current_admin,
        details=(
            f"company_id={company.id}; plan={data.plan}; "
            f"status={data.subscription_status}"
        ),
    )
    await db.commit()
    try:
        snapshot = await entitlement_snapshot(db, company.id, require_active=False)
    except EntitlementDenied as exc:  # pragma: no cover - row was locked above
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found") from exc
    return CompanySubscriptionOut(
        company_id=company.id,
        status=company.status,
        owner_id=company.owner_id,
        plan=company.subscription_plan,
        subscription_status=company.subscription_status,
        expires_at=company.subscription_expires_at,
        limits=snapshot.limits,
        usage=snapshot.usage,
    )


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

    try:
        token = issue_access_token(
            user,
            extra_claims={
                "impersonated_by": "admin",
                "admin_id": str(current_admin.id),
            },
        )
    except AuthenticationRejected as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Target account is not active",
        ) from exc

    user_out = UserOut(
        id=user.id,
        email=user.email,
        role=user.role.value,
        is_approved=user.is_approved,
        is_active=user.is_active,
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
