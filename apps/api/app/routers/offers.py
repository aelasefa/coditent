import uuid
from datetime import datetime
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import get_async_redis
from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user, get_pagination, require_company_admin, require_company_member
from app.models import Application, Company, Offer, OfferType, User
from app.schemas import OfferCreate, OfferOut, OfferUpdate, ResponsibleHrUpdate
from app.services.offer_eligibility import eligible_offer_predicates
from app.services.entitlements import EntitlementDenied, entitlement_snapshot, require_capacity


router = APIRouter()


def _entitlement_http_error(exc: EntitlementDenied) -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_402_PAYMENT_REQUIRED,
        detail={"code": exc.code, "message": str(exc)},
    )


async def _company_logo_map(db: AsyncSession, company_ids: set) -> dict[str, str | None]:
    """Batch-load logo paths for offers to avoid N+1 queries."""
    ids = [cid for cid in company_ids if cid is not None]
    if not ids:
        return {}
    result = await db.execute(select(Company.id, Company.logo_url).where(Company.id.in_(ids)))
    return {str(cid): logo for cid, logo in result.all()}


def _offer_out(offer: Offer, logos: dict[str, str | None] | None = None) -> OfferOut:
    out = OfferOut.model_validate(offer)
    if logos is not None and offer.company_id is not None:
        out.company_logo_url = logos.get(str(offer.company_id))
    return out


@router.get("", response_model=dict[str, list[OfferOut]])
async def list_offers(
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> dict[str, list[OfferOut]]:
    limit, offset = pagination
    result = await db.execute(
        select(Offer)
        .where(*eligible_offer_predicates())
        .order_by(Offer.posted_at.desc())
        .limit(limit)
        .offset(offset)
    )
    offers = result.scalars().all()
    logos = await _company_logo_map(db, {o.company_id for o in offers})
    return {"offers": [_offer_out(offer, logos) for offer in offers]}


async def _bust_recommendation_cache() -> None:
    """Drop cached generate results so newly published (or toggled) offers
    get rescored on the next Generate instead of serving stale lists."""
    try:
        client = get_async_redis()
        batch: list[str | bytes] = []
        async for key in client.scan_iter(match="recommendations:*", count=100):
            batch.append(key)
            if len(batch) == 100:
                await client.delete(*batch)
                batch.clear()
        if batch:
            await client.delete(*batch)
    except Exception:
        pass


@router.post("", response_model=OfferOut)
async def create_offer(
    data: OfferCreate,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    if not can(current_user.company_role, "create_offers"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: cannot create offers with this role")
    # Enforce company isolation — never trust client company_id
    if not current_user.company_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Company membership required")
    # Lock the organization row so concurrent publishes cannot exceed the
    # server-side plan limit.
    try:
        snapshot = (
            await require_capacity(db, current_user.company_id, "active_offers")
            if data.opportunity_status == "active"
            else await entitlement_snapshot(db, current_user.company_id, lock=True)
        )
    except EntitlementDenied as exc:
        raise _entitlement_http_error(exc) from exc
    company = snapshot.company
    company_name = company.name
    offer = Offer(
        recruiter_id=current_user.id,
        company_id=current_user.company_id,
        created_by=current_user.id,
        # Creator is the default responsible HR; company admins may reassign.
        responsible_hr_id=current_user.id,
        title=data.title,
        company=company_name,
        region=data.region,
        field=data.field,
        type=OfferType(data.type),
        description=data.description,
        requirements=data.requirements,
        location=data.location or data.region,
        work_mode=data.work_mode,
        required_skills=data.required_skills,
        required_experience=data.required_experience,
        education_requirements=data.education_requirements,
        salary_min=data.salary_min,
        salary_max=data.salary_max,
        deadline=data.deadline,
        opportunity_status=data.opportunity_status,
        active=data.opportunity_status == "active",
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    await log_audit(db, action="OFFER_CREATED", actor=current_user, company_id=current_user.company_id, resource_type="offer", resource_id=offer.id)
    await _bust_recommendation_cache()
    logos = await _company_logo_map(db, {offer.company_id})
    return _offer_out(offer, logos)


@router.get("/mine", response_model=dict[str, list[OfferOut]])
async def list_my_offers(
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[OfferOut]]:
    # Company isolation: return all offers of the company, not just own
    result = await db.execute(
        select(Offer)
        .where(Offer.company_id == current_user.company_id)
        .order_by(Offer.posted_at.desc())
    )
    offers = result.scalars().all()
    logos = await _company_logo_map(db, {o.company_id for o in offers})
    return {"offers": [_offer_out(offer, logos) for offer in offers]}


@router.patch("/{offer_id}/responsible-hr", response_model=OfferOut)
async def set_responsible_hr(
    offer_id: uuid.UUID,
    data: ResponsibleHrUpdate,
    current_user: Annotated[User, Depends(require_company_admin)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    """Assign the responsible HR for an offer. OWNER/ADMIN only.

    The new responsible HR must be an eligible member of the SAME company —
    enforced here on the backend, never just in the frontend. Previous HR
    loses recruitment-chat access automatically (authorization re-resolves
    the current responsible HR on every request).
    """
    result = await db.execute(
        select(Offer).where(
            Offer.id == offer_id, Offer.company_id == current_user.company_id
        )
    )
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    target_res = await db.execute(select(User).where(User.id == data.responsible_hr_id))
    target = target_res.scalar_one_or_none()
    if (
        target is None
        or target.role.value != "COMPANY_USER"
        or not target.company_id
        or target.company_id != current_user.company_id
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Responsible HR must be a member of the same company",
        )
    offer.responsible_hr_id = target.id
    await db.commit()
    await db.refresh(offer)
    await log_audit(db, action="OFFER_RESPONSIBLE_HR_CHANGED", actor=current_user, company_id=current_user.company_id, resource_type="offer", resource_id=offer.id, details=str(target.id))
    logos = await _company_logo_map(db, {offer.company_id})
    return _offer_out(offer, logos)


@router.patch("/{offer_id}/toggle", response_model=OfferOut)
async def toggle_offer(
    offer_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_company_member)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    # Company isolation: 404 if not in same company (avoid leaking existence)
    result = await db.execute(
        select(Offer).where(Offer.id == offer_id, Offer.company_id == current_user.company_id)
    )
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    if offer.active:
        offer.active = False
        offer.opportunity_status = "closed"
        offer.closed_at = datetime.utcnow()
    else:
        if offer.deadline is not None and offer.deadline <= datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Expired offers cannot be reopened",
            )
        try:
            await require_capacity(db, current_user.company_id, "active_offers")
        except EntitlementDenied as exc:
            raise _entitlement_http_error(exc) from exc
        offer.active = True
        offer.opportunity_status = "active"
        offer.closed_at = None
    await db.commit()
    await db.refresh(offer)
    await _bust_recommendation_cache()
    logos = await _company_logo_map(db, {offer.company_id})
    return _offer_out(offer, logos)


@router.get("/{offer_id}", response_model=OfferOut)
async def get_offer(
    offer_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    # Candidates view public opportunities; company isolation protects management ops, not discovery.
    # PLATFORM_ADMIN and CANDIDATE get platform-wide read (active or not, 404 if missing).
    if current_user.role.value in ("PLATFORM_ADMIN", "CANDIDATE"):
        result = await db.execute(select(Offer).where(Offer.id == offer_id))
    elif current_user.role.value == "COMPANY_USER":
        result = await db.execute(
            select(Offer).where(
                Offer.id == offer_id, Offer.company_id == current_user.company_id
            )
        )
    else:
        # Legacy ADMIN/RECRUITER — deny by scoping to NULL (404, no leak)
        result = await db.execute(
            select(Offer).where(Offer.id == offer_id, Offer.company_id == current_user.company_id)
        )
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    logos = await _company_logo_map(db, {offer.company_id})
    return _offer_out(offer, logos)


@router.patch("/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: uuid.UUID,
    data: OfferUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    # RBAC: PLATFORM_ADMIN platform-wide; COMPANY_USER scoped; CANDIDATE 403 via can()
    if current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Offer).where(Offer.id == offer_id))
    elif current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "edit_offers"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
        result = await db.execute(
            select(Offer).where(
                Offer.id == offer_id, Offer.company_id == current_user.company_id
            )
        )
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    fields = data.model_dump(exclude_unset=True)
    # The authenticated membership remains authoritative for company identity.
    fields.pop("company", None)
    if "type" in fields:
        fields["type"] = OfferType(fields["type"])
    new_salary_min = fields.get("salary_min", offer.salary_min)
    new_salary_max = fields.get("salary_max", offer.salary_max)
    if (
        new_salary_min is not None
        and new_salary_max is not None
        and new_salary_min > new_salary_max
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="salary_min must be less than or equal to salary_max",
        )
    for field, value in fields.items():
        setattr(offer, field, value)
    await db.commit()
    await db.refresh(offer)
    await log_audit(db, action="OFFER_UPDATED", actor=current_user, company_id=getattr(current_user, "company_id", None), resource_type="offer", resource_id=offer.id)
    logos = await _company_logo_map(db, {offer.company_id})
    return _offer_out(offer, logos)


@router.delete("/{offer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_offer(
    offer_id: uuid.UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if current_user.role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(Offer).where(Offer.id == offer_id))
    elif current_user.role.value == "COMPANY_USER":
        if not can(current_user.company_role, "delete_offers"):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden: owner/admin only")
        result = await db.execute(
            select(Offer).where(
                Offer.id == offer_id, Offer.company_id == current_user.company_id
            )
        )
    else:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")
    application_count = (
        await db.execute(
            select(func.count())
            .select_from(Application)
            .where(Application.opportunity_id == offer.id)
        )
    ).scalar_one()
    if application_count:
        # Recruitment history is retained. DELETE becomes an idempotent close
        # for populated offers, so applications/CV snapshots are never erased.
        offer.active = False
        offer.opportunity_status = "closed"
        offer.closed_at = offer.closed_at or datetime.utcnow()
        action = "OFFER_CLOSED"
    else:
        await db.delete(offer)
        action = "OFFER_DELETED"
    await db.commit()
    await log_audit(db, action=action, actor=current_user, company_id=getattr(current_user, "company_id", None), resource_type="offer", resource_id=offer_id)
    await _bust_recommendation_cache()
