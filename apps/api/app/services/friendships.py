"""Canonical friendship-pair and authorization helpers."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Friendship, User, UserRole


def canonical_pair(first: UUID, second: UUID) -> tuple[UUID, UUID]:
    if first == second:
        raise ValueError("A friendship requires two users")
    return (first, second) if first.int < second.int else (second, first)


async def get_relationship(
    db: AsyncSession,
    first: UUID,
    second: UUID,
    *,
    for_update: bool = False,
) -> Friendship | None:
    low, high = canonical_pair(first, second)
    statement = select(Friendship).where(
        Friendship.pair_low_id == low,
        Friendship.pair_high_id == high,
    )
    if for_update:
        statement = statement.with_for_update()
    return (await db.execute(statement)).scalar_one_or_none()


def relationship_state(relationship: Friendship | None, viewer_id: UUID) -> str:
    if relationship is None:
        return "NONE"
    if relationship.status == "ACCEPTED":
        return "ACCEPTED"
    if relationship.status == "BLOCKED":
        return "BLOCKED"
    return "PENDING_SENT" if relationship.requester_id == viewer_id else "PENDING_RECEIVED"


async def are_accepted_friends(db: AsyncSession, first: UUID, second: UUID) -> bool:
    relationship = await get_relationship(db, first, second)
    return bool(relationship and relationship.status == "ACCEPTED")


async def candidate_is_available(db: AsyncSession, user_id: UUID) -> User | None:
    return (
        await db.execute(
            select(User).where(
                User.id == user_id,
                User.role == UserRole.CANDIDATE,
                User.company_id.is_(None),
                User.is_active.is_(True),
                User.is_approved.is_(True),
            )
        )
    ).scalar_one_or_none()


def relationship_involves(relationship: Friendship, user_id: UUID) -> bool:
    return relationship.requester_id == user_id or relationship.addressee_id == user_id


def other_user_id(relationship: Friendship, user_id: UUID) -> UUID:
    if relationship.requester_id == user_id:
        return relationship.addressee_id
    if relationship.addressee_id == user_id:
        return relationship.requester_id
    raise ValueError("User is not part of relationship")


def involving_user(user_id: UUID):
    return or_(
        Friendship.requester_id == user_id,
        Friendship.addressee_id == user_id,
    )
