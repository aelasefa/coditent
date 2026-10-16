"""Canonical predicates for offers that may be matched or scored."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import or_

from app.models import Offer


def eligible_offer_predicates(*, now: datetime | None = None) -> tuple[object, ...]:
    reference = now or datetime.utcnow()
    return (
        Offer.active.is_(True),
        Offer.opportunity_status == "active",
        or_(Offer.deadline.is_(None), Offer.deadline > reference),
    )


def offer_is_eligible(offer: Offer, *, now: datetime | None = None) -> bool:
    reference = now or datetime.utcnow()
    return bool(
        offer.active
        and offer.opportunity_status == "active"
        and (offer.deadline is None or offer.deadline > reference)
    )
