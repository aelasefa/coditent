"""Server-side company subscription and capacity enforcement."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Company, Offer, User


PLAN_LIMITS: dict[str, dict[str, int]] = {
    "free": {"active_offers": 3, "members": 5},
    "pro": {"active_offers": 50, "members": 50},
    "enterprise": {"active_offers": 1_000, "members": 500},
}
ACTIVE_SUBSCRIPTION_STATES = {"active", "trialing"}


class EntitlementDenied(RuntimeError):
    def __init__(self, code: str, message: str) -> None:
        super().__init__(message)
        self.code = code


@dataclass(frozen=True)
class EntitlementSnapshot:
    company: Company
    limits: dict[str, int]
    usage: dict[str, int]


def _validate_subscription(company: Company, *, now: datetime) -> None:
    if company.status != "active":
        raise EntitlementDenied("ORGANIZATION_INACTIVE", "Organization is inactive")
    if company.subscription_plan not in PLAN_LIMITS:
        raise EntitlementDenied("SUBSCRIPTION_INVALID", "Subscription plan is invalid")
    if company.subscription_status not in ACTIVE_SUBSCRIPTION_STATES:
        raise EntitlementDenied(
            "SUBSCRIPTION_INACTIVE",
            "Subscription is not active; contact the workspace owner",
        )
    if company.subscription_expires_at and company.subscription_expires_at <= now:
        raise EntitlementDenied(
            "SUBSCRIPTION_EXPIRED",
            "Subscription has expired; contact the workspace owner",
        )


async def entitlement_snapshot(
    db: AsyncSession,
    company_id: UUID,
    *,
    lock: bool = False,
    require_active: bool = True,
) -> EntitlementSnapshot:
    query = select(Company).where(Company.id == company_id)
    if lock:
        query = query.with_for_update()
    company = await db.scalar(query)
    if company is None:
        raise EntitlementDenied("ORGANIZATION_NOT_FOUND", "Organization not found")
    if require_active:
        _validate_subscription(company, now=datetime.utcnow())

    active_offers = int(
        await db.scalar(
            select(func.count(Offer.id)).where(
                Offer.company_id == company.id,
                Offer.active.is_(True),
                Offer.opportunity_status == "active",
            )
        )
        or 0
    )
    members = int(
        await db.scalar(
            select(func.count(User.id)).where(
                User.company_id == company.id,
                User.is_active.is_(True),
            )
        )
        or 0
    )
    pending_invitations = int(
        await db.scalar(
            text(
                "SELECT count(*) FROM employee_invitations "
                "WHERE company_id=:company_id AND status='pending' AND expires_at>:now"
            ),
            {"company_id": str(company.id), "now": datetime.utcnow()},
        )
        or 0
    )
    return EntitlementSnapshot(
        company=company,
        limits=dict(PLAN_LIMITS.get(company.subscription_plan, {"active_offers": 0, "members": 0})),
        usage={
            "active_offers": active_offers,
            "members": members,
            "pending_invitations": pending_invitations,
            "reserved_members": members + pending_invitations,
        },
    )


async def require_capacity(
    db: AsyncSession,
    company_id: UUID,
    capability: str,
) -> EntitlementSnapshot:
    snapshot = await entitlement_snapshot(db, company_id, lock=True)
    if capability not in snapshot.limits:
        raise EntitlementDenied("ENTITLEMENT_UNKNOWN", "Entitlement is not configured")
    used = (
        snapshot.usage["reserved_members"]
        if capability == "members"
        else snapshot.usage[capability]
    )
    if used >= snapshot.limits[capability]:
        raise EntitlementDenied(
            "PLAN_LIMIT_REACHED",
            f"The {snapshot.company.subscription_plan} plan limit for {capability.replace('_', ' ')} has been reached",
        )
    return snapshot
