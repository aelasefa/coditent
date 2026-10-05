from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_pagination, require_candidate_account
from app.models import CandidateProfile, Friendship, User, UserRole
from app.schemas import (
    FriendListOut,
    FriendOut,
    FriendRequestListOut,
    FriendRequestOut,
    PresenceHeartbeatIn,
    PresenceOut,
)
from app.services.friendships import (
    canonical_pair,
    get_relationship,
    involving_user,
    other_user_id,
    relationship_state,
)
from app.services.notifications import create_notification
from app.services.presence import is_online, presence_map, safe_last_seen, touch_presence


router = APIRouter()


def _mask_email(email: str) -> str:
    local, separator, domain = email.partition("@")
    return f"{local[:1]}***@{domain}" if separator else "***"


async def _profiles(db: AsyncSession, user_ids: set[UUID]) -> dict[UUID, CandidateProfile]:
    if not user_ids:
        return {}
    rows = (
        await db.execute(select(CandidateProfile).where(CandidateProfile.user_id.in_(user_ids)))
    ).scalars()
    return {profile.user_id: profile for profile in rows}


async def _friend_outputs(
    db: AsyncSession,
    users: list[User],
    *,
    viewer_id: UUID,
    relationships: dict[UUID, Friendship | None],
) -> list[FriendOut]:
    user_ids = {user.id for user in users}
    profile_by_user = await _profiles(db, user_ids)
    online_by_user = await presence_map(user_ids)
    outputs: list[FriendOut] = []
    for user in users:
        profile = profile_by_user.get(user.id)
        online = online_by_user.get(user.id, False)
        outputs.append(
            FriendOut(
                id=user.id,
                full_name=user.full_name,
                avatar_url=user.avatar_url,
                masked_email=_mask_email(user.email),
                headline=profile.headline if profile else None,
                skills=profile.skills if profile else None,
                bio=profile.bio if profile else None,
                relationship_state=relationship_state(relationships.get(user.id), viewer_id),
                is_online=online,
                online=online,
                last_seen=safe_last_seen(user.last_seen),
            )
        )
    return outputs


async def friend_output(
    db: AsyncSession,
    user: User,
    *,
    viewer_id: UUID,
    relationship: Friendship | None,
) -> FriendOut:
    return (
        await _friend_outputs(
            db,
            [user],
            viewer_id=viewer_id,
            relationships={user.id: relationship},
        )
    )[0]


async def _candidate_or_404(db: AsyncSession, user_id: UUID) -> User:
    user = (
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
    if user is None:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return user


async def _request_out(
    db: AsyncSession, relationship: Friendship, viewer_id: UUID
) -> FriendRequestOut:
    candidate_id = other_user_id(relationship, viewer_id)
    candidate = await _candidate_or_404(db, candidate_id)
    return FriendRequestOut(
        id=relationship.id,
        status=relationship.status,
        requester_id=relationship.requester_id,
        addressee_id=relationship.addressee_id,
        candidate=await friend_output(
            db, candidate, viewer_id=viewer_id, relationship=relationship
        ),
        created_at=relationship.created_at,
        updated_at=relationship.updated_at,
        responded_at=relationship.responded_at,
    )


async def _publish_relationship_revoked(first: UUID, second: UUID) -> None:
    from app.routers.chat import revoke_friend_pair

    await revoke_friend_pair(first, second)


@router.get("", response_model=FriendListOut)
async def list_friends(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
    sort: Literal["name", "recent"] = Query(default="name"),
) -> FriendListOut:
    limit, offset = pagination
    relationships = list(
        (
            await db.execute(
                select(Friendship).where(
                    involving_user(current_user.id), Friendship.status == "ACCEPTED"
                )
            )
        ).scalars()
    )
    peer_ids = [other_user_id(item, current_user.id) for item in relationships]
    users = list(
        (
            await db.execute(
                select(User).where(
                    User.id.in_(peer_ids),
                    User.role == UserRole.CANDIDATE,
                    User.is_active.is_(True),
                    User.is_approved.is_(True),
                )
            )
        ).scalars()
    )
    if sort == "name":
        users.sort(key=lambda user: (user.full_name.casefold(), str(user.id)))
    else:
        users.sort(key=lambda user: user.last_seen or datetime.min, reverse=True)
    users = users[offset : offset + limit]
    by_peer = {other_user_id(item, current_user.id): item for item in relationships}
    return FriendListOut(
        friends=await _friend_outputs(
            db, users, viewer_id=current_user.id, relationships=by_peer
        ),
        total=len(peer_ids),
    )


@router.get("/search", response_model=FriendListOut)
async def search_people(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
    q: str = Query(min_length=2, max_length=80),
) -> FriendListOut:
    needle = " ".join(q.split())
    if len(needle) < 2:
        raise HTTPException(status_code=422, detail="Search query is too short")
    limit, offset = pagination
    blocked_ids = select(Friendship.pair_low_id).where(
        involving_user(current_user.id), Friendship.status == "BLOCKED"
    ).union(
        select(Friendship.pair_high_id).where(
            involving_user(current_user.id), Friendship.status == "BLOCKED"
        )
    )
    conditions = (
        User.id != current_user.id,
        User.role == UserRole.CANDIDATE,
        User.company_id.is_(None),
        User.is_active.is_(True),
        User.is_approved.is_(True),
        User.id.not_in(blocked_ids),
        or_(User.full_name.ilike(f"%{needle}%"), User.email.ilike(f"%{needle}%")),
    )
    total = int(
        (await db.execute(select(func.count(User.id)).where(*conditions))).scalar_one()
    )
    users = list(
        (
            await db.execute(
                select(User)
                .where(*conditions)
                .order_by(User.full_name.asc(), User.id.asc())
                .limit(limit)
                .offset(offset)
            )
        ).scalars()
    )
    relationships = {
        user.id: await get_relationship(db, current_user.id, user.id) for user in users
    }
    return FriendListOut(
        friends=await _friend_outputs(
            db, users, viewer_id=current_user.id, relationships=relationships
        ),
        total=total,
    )


@router.get("/requests/incoming", response_model=FriendRequestListOut)
async def incoming_requests(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendRequestListOut:
    rows = list(
        (
            await db.execute(
                select(Friendship)
                .where(
                    Friendship.addressee_id == current_user.id,
                    Friendship.status == "PENDING",
                )
                .order_by(Friendship.created_at.desc(), Friendship.id.desc())
            )
        ).scalars()
    )
    return FriendRequestListOut(
        requests=[await _request_out(db, item, current_user.id) for item in rows],
        total=len(rows),
    )


@router.get("/requests/sent", response_model=FriendRequestListOut)
async def sent_requests(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendRequestListOut:
    rows = list(
        (
            await db.execute(
                select(Friendship)
                .where(
                    Friendship.requester_id == current_user.id,
                    Friendship.status == "PENDING",
                )
                .order_by(Friendship.created_at.desc(), Friendship.id.desc())
            )
        ).scalars()
    )
    return FriendRequestListOut(
        requests=[await _request_out(db, item, current_user.id) for item in rows],
        total=len(rows),
    )


@router.get("/blocked", response_model=FriendListOut)
async def blocked_candidates(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendListOut:
    rows = list(
        (
            await db.execute(
                select(Friendship).where(
                    Friendship.requester_id == current_user.id,
                    Friendship.status == "BLOCKED",
                )
            )
        ).scalars()
    )
    users = [await _candidate_or_404(db, item.addressee_id) for item in rows]
    return FriendListOut(
        friends=await _friend_outputs(
            db,
            users,
            viewer_id=current_user.id,
            relationships={item.addressee_id: item for item in rows},
        ),
        total=len(users),
    )


@router.post("/presence/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def presence_heartbeat(
    data: PresenceHeartbeatIn,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    current_user.last_seen = datetime.utcnow()
    await db.commit()
    await touch_presence(current_user.id, f"http:{data.connection_id}")


@router.get("/presence/{candidate_id}", response_model=PresenceOut)
async def candidate_presence(
    candidate_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> PresenceOut:
    candidate = await _candidate_or_404(db, candidate_id)
    relationship = await get_relationship(db, current_user.id, candidate_id)
    if candidate_id != current_user.id and (
        relationship is None or relationship.status != "ACCEPTED"
    ):
        raise HTTPException(status_code=403, detail="Presence is available to friends")
    return PresenceOut(
        user_id=candidate.id,
        is_online=await is_online(candidate.id),
        last_seen=safe_last_seen(candidate.last_seen),
    )


@router.post(
    "/requests/{candidate_id}",
    response_model=FriendRequestOut,
    status_code=status.HTTP_201_CREATED,
)
async def send_friend_request(
    candidate_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendRequestOut:
    if candidate_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")
    target = await _candidate_or_404(db, candidate_id)
    low, high = canonical_pair(current_user.id, candidate_id)
    relationship = await get_relationship(db, current_user.id, candidate_id, for_update=True)
    created = False
    if relationship is None:
        relationship = Friendship(
            requester_id=current_user.id,
            addressee_id=candidate_id,
            pair_low_id=low,
            pair_high_id=high,
            status="PENDING",
        )
        try:
            async with db.begin_nested():
                db.add(relationship)
                await db.flush()
            created = True
        except IntegrityError:
            relationship = await get_relationship(
                db, current_user.id, candidate_id, for_update=True
            )
    if relationship is None:
        raise HTTPException(status_code=409, detail="Friend request conflicted")
    if not created:
        if relationship.status == "BLOCKED":
            raise HTTPException(status_code=403, detail="Friend request is not allowed")
        if relationship.status == "ACCEPTED":
            raise HTTPException(status_code=409, detail="Already friends")
        if relationship.requester_id == current_user.id:
            raise HTTPException(status_code=409, detail="Friend request already sent")
        relationship.status = "ACCEPTED"
        relationship.responded_at = datetime.utcnow()
        relationship.updated_at = relationship.responded_at
        await create_notification(
            db,
            user_id=target.id,
            category="message",
            title="Friend request accepted",
            body=f"{current_user.full_name} accepted your friend request.",
            action_url="/dashboard/friends",
            resource_type="friendship",
            resource_id=relationship.id,
            dedupe_key=f"friend-accepted:{relationship.id}",
        )
    else:
        await create_notification(
            db,
            user_id=target.id,
            category="message",
            title="New friend request",
            body=f"{current_user.full_name} sent you a friend request.",
            action_url="/dashboard/friends",
            resource_type="friendship",
            resource_id=relationship.id,
            dedupe_key=f"friend-request:{relationship.id}",
        )
    await db.commit()
    await db.refresh(relationship)
    return await _request_out(db, relationship, current_user.id)


async def _pending_request(db: AsyncSession, request_id: UUID) -> Friendship:
    relationship = (
        await db.execute(
            select(Friendship).where(Friendship.id == request_id).with_for_update()
        )
    ).scalar_one_or_none()
    if relationship is None or relationship.status != "PENDING":
        raise HTTPException(status_code=404, detail="Pending friend request not found")
    return relationship


@router.post("/requests/{request_id}/accept", response_model=FriendRequestOut)
async def accept_friend_request(
    request_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendRequestOut:
    relationship = await _pending_request(db, request_id)
    if relationship.addressee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the recipient can accept")
    relationship.status = "ACCEPTED"
    relationship.responded_at = datetime.utcnow()
    relationship.updated_at = relationship.responded_at
    await create_notification(
        db,
        user_id=relationship.requester_id,
        category="message",
        title="Friend request accepted",
        body=f"{current_user.full_name} accepted your friend request.",
        action_url="/dashboard/friends",
        resource_type="friendship",
        resource_id=relationship.id,
        dedupe_key=f"friend-accepted:{relationship.id}",
    )
    await db.commit()
    await db.refresh(relationship)
    return await _request_out(db, relationship, current_user.id)


@router.delete("/requests/{request_id}/decline", status_code=204)
async def decline_friend_request(
    request_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    relationship = await _pending_request(db, request_id)
    if relationship.addressee_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the recipient can decline")
    await db.delete(relationship)
    await db.commit()


@router.delete("/requests/{request_id}/cancel", status_code=204)
async def cancel_friend_request(
    request_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    relationship = await _pending_request(db, request_id)
    if relationship.requester_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the sender can cancel")
    await db.delete(relationship)
    await db.commit()


@router.delete("/{candidate_id}", status_code=204)
async def remove_friend(
    candidate_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    relationship = await get_relationship(db, current_user.id, candidate_id, for_update=True)
    if relationship is None or relationship.status != "ACCEPTED":
        raise HTTPException(status_code=404, detail="Friendship not found")
    await db.delete(relationship)
    await db.commit()
    await _publish_relationship_revoked(current_user.id, candidate_id)


@router.post("/{candidate_id}/block", status_code=204)
async def block_candidate(
    candidate_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    if candidate_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot block yourself")
    await _candidate_or_404(db, candidate_id)
    low, high = canonical_pair(current_user.id, candidate_id)
    relationship = await get_relationship(db, current_user.id, candidate_id, for_update=True)
    if relationship is None:
        relationship = Friendship(
            requester_id=current_user.id,
            addressee_id=candidate_id,
            pair_low_id=low,
            pair_high_id=high,
            status="BLOCKED",
            responded_at=datetime.utcnow(),
        )
        db.add(relationship)
    else:
        relationship.requester_id = current_user.id
        relationship.addressee_id = candidate_id
        relationship.status = "BLOCKED"
        relationship.responded_at = datetime.utcnow()
        relationship.updated_at = relationship.responded_at
    try:
        await db.commit()
    except IntegrityError as exc:
        await db.rollback()
        raise HTTPException(status_code=409, detail="Block state conflicted") from exc
    await _publish_relationship_revoked(current_user.id, candidate_id)


@router.delete("/{candidate_id}/block", status_code=204)
async def unblock_candidate(
    candidate_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    relationship = await get_relationship(db, current_user.id, candidate_id, for_update=True)
    if (
        relationship is None
        or relationship.status != "BLOCKED"
        or relationship.requester_id != current_user.id
    ):
        raise HTTPException(status_code=404, detail="Block not found")
    await db.delete(relationship)
    await db.commit()


@router.get("/{candidate_id}/profile", response_model=FriendOut)
async def public_candidate_profile(
    candidate_id: UUID,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendOut:
    candidate = current_user if candidate_id == current_user.id else await _candidate_or_404(db, candidate_id)
    relationship = (
        None
        if candidate_id == current_user.id
        else await get_relationship(db, current_user.id, candidate_id)
    )
    if relationship is not None and relationship.status == "BLOCKED":
        raise HTTPException(status_code=404, detail="Candidate not found")
    return await friend_output(
        db, candidate, viewer_id=current_user.id, relationship=relationship
    )
