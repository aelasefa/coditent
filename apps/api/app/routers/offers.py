import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.permissions import can
from app.database import get_db
from app.dependencies import get_current_user, get_pagination, require_company_member
from app.models import Company, Offer, OfferType, User
from app.schemas import OfferCreate, OfferOut


router = APIRouter()


@router.get("", response_model=dict[str, list[OfferOut]])
async def list_offers(
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
) -> dict[str, list[OfferOut]]:
    limit, offset = pagination
    result = await db.execute(
        select(Offer)
        .where(Offer.active.is_(True))
        .order_by(Offer.posted_at.desc())
        .limit(limit)
        .offset(offset)
    )
    offers = result.scalars().all()
    return {"offers": [OfferOut.model_validate(offer) for offer in offers]}


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
    # Resolve company name for legacy `company` string field
    comp_res = await db.execute(select(Company).where(Company.id == current_user.company_id))
    company = comp_res.scalar_one_or_none()
    company_name = company.name if company else data.company
    offer = Offer(
        recruiter_id=current_user.id,
        company_id=current_user.company_id,
        created_by=current_user.id,
        title=data.title,
        company=company_name,
        region=data.region,
        field=data.field,
        type=OfferType(data.type),
        description=data.description,
        requirements=data.requirements,
        location=data.region,
        opportunity_status="active",
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    await log_audit(db, action="OFFER_CREATED", actor=current_user, company_id=current_user.company_id, resource_type="offer", resource_id=offer.id)
    return OfferOut.model_validate(offer)


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
    return {"offers": [OfferOut.model_validate(offer) for offer in offers]}


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

    offer.active = not offer.active
    await db.commit()
    await db.refresh(offer)
    return OfferOut.model_validate(offer)


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
    return OfferOut.model_validate(offer)


@router.put("/{offer_id}", response_model=OfferOut)
async def update_offer(
    offer_id: uuid.UUID,
    data: OfferCreate,
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
    offer.title = data.title
    offer.company = data.company if data.company else offer.company
    offer.region = data.region
    offer.field = data.field
    offer.type = OfferType(data.type)
    offer.description = data.description
    offer.requirements = data.requirements
    offer.location = data.region
    await db.commit()
    await db.refresh(offer)
    await log_audit(db, action="OFFER_UPDATED", actor=current_user, company_id=getattr(current_user, "company_id", None), resource_type="offer", resource_id=offer.id)
    return OfferOut.model_validate(offer)


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
    await db.delete(offer)
    await db.commit()
    await log_audit(db, action="OFFER_DELETED", actor=current_user, company_id=getattr(current_user, "company_id", None), resource_type="offer", resource_id=offer_id)
