import uuid
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_recruiter
from app.models import Offer, OfferType, User
from app.schemas import OfferCreate, OfferOut


router = APIRouter()


@router.get("", response_model=dict[str, list[OfferOut]])
async def list_offers(
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[OfferOut]]:
    result = await db.execute(
        select(Offer).where(Offer.active.is_(True)).order_by(Offer.posted_at.desc())
    )
    offers = result.scalars().all()
    return {"offers": [OfferOut.model_validate(offer) for offer in offers]}


@router.post("", response_model=OfferOut)
async def create_offer(
    data: OfferCreate,
    current_user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    offer = Offer(
        recruiter_id=current_user.id,
        title=data.title,
        company=data.company,
        region=data.region,
        field=data.field,
        type=OfferType(data.type),
        description=data.description,
        requirements=data.requirements,
    )
    db.add(offer)
    await db.commit()
    await db.refresh(offer)
    return OfferOut.model_validate(offer)


@router.get("/mine", response_model=dict[str, list[OfferOut]])
async def list_my_offers(
    current_user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, list[OfferOut]]:
    result = await db.execute(
        select(Offer)
        .where(Offer.recruiter_id == current_user.id)
        .order_by(Offer.posted_at.desc())
    )
    offers = result.scalars().all()
    return {"offers": [OfferOut.model_validate(offer) for offer in offers]}


@router.patch("/{offer_id}/toggle", response_model=OfferOut)
async def toggle_offer(
    offer_id: uuid.UUID,
    current_user: Annotated[User, Depends(require_recruiter)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OfferOut:
    result = await db.execute(select(Offer).where(Offer.id == offer_id))
    offer = result.scalar_one_or_none()
    if offer is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    if offer.recruiter_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Offer not found")

    offer.active = not offer.active
    await db.commit()
    await db.refresh(offer)
    return OfferOut.model_validate(offer)
