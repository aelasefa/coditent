from __future__ import annotations

from datetime import datetime, timedelta
from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user, get_pagination
from app.models import Friendship, User
from app.schemas import FriendListOut, FriendOut


router = APIRouter()


def _friend_out(user: User, *, now: datetime) -> FriendOut:
    return FriendOut(
        id=user.id,
        full_name=user.full_name,
        avatar_url=user.avatar_url,
        role=user.role.value,
        online=bool(user.last_seen and user.last_seen >= now - timedelta(minutes=5)),
        last_seen=user.last_seen,
    )


async def _touch_presence(db: AsyncSession, user: User) -> None:
    user.last_seen = datetime.utcnow()
    await db.flush()


@router.get("", response_model=FriendListOut)
async def list_friends(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    pagination: Annotated[tuple[int, int], Depends(get_pagination)],
    sort: Literal["name", "recent"] = Query(default="name"),
) -> FriendListOut:
    limit, offset = pagination
    await _touch_presence(db, current_user)
    base = (
        select(User)
        .join(Friendship, Friendship.friend_id == User.id)
        .where(Friendship.user_id == current_user.id)
    )
    ordering = User.full_name.asc() if sort == "name" else User.last_seen.desc().nullslast()
    users = list((await db.execute(base.order_by(ordering).limit(limit).offset(offset))).scalars())
    total = int(
        (
            await db.execute(
                select(func.count(Friendship.id)).where(Friendship.user_id == current_user.id)
            )
        ).scalar_one()
    )
    await db.commit()
    now = datetime.utcnow()
    return FriendListOut(friends=[_friend_out(user, now=now) for user in users], total=total)


@router.get("/search", response_model=FriendListOut)
async def search_people(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    q: str = Query(min_length=2, max_length=80),
) -> FriendListOut:
    needle = q.strip()
    if len(needle) < 2:
        raise HTTPException(status_code=422, detail="Search query is too short")
    already_friends = select(Friendship.friend_id).where(
        Friendship.user_id == current_user.id
    )
    users = list(
        (
            await db.execute(
                select(User)
                .where(
                    User.id != current_user.id,
                    User.is_approved.is_(True),
                    User.id.not_in(already_friends),
                    or_(
                        User.full_name.ilike(f"%{needle}%"),
                        User.email.ilike(f"%{needle}%"),
                    ),
                )
                .order_by(User.full_name.asc())
                .limit(20)
            )
        ).scalars()
    )
    now = datetime.utcnow()
    return FriendListOut(friends=[_friend_out(user, now=now) for user in users], total=len(users))


@router.post("/presence/heartbeat", status_code=status.HTTP_204_NO_CONTENT)
async def presence_heartbeat(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    # Keep the static route above /{friend_id}; otherwise FastAPI would try to
    # parse the literal "presence" as a UUID for POST requests.
    current_user.last_seen = datetime.utcnow()
    await db.commit()


@router.post("/{friend_id}", response_model=FriendOut, status_code=status.HTTP_201_CREATED)
async def add_friend(
    friend_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> FriendOut:
    if friend_id == current_user.id:
        raise HTTPException(status_code=400, detail="You cannot add yourself")
    friend = (
        await db.execute(
            select(User).where(User.id == friend_id, User.is_approved.is_(True))
        )
    ).scalar_one_or_none()
    if friend is None:
        raise HTTPException(status_code=404, detail="User not found")
    existing = (
        await db.execute(
            select(Friendship.id).where(
                Friendship.user_id == current_user.id,
                Friendship.friend_id == friend_id,
            )
        )
    ).scalar_one_or_none()
    if existing is None:
        db.add_all(
            [
                Friendship(user_id=current_user.id, friend_id=friend_id),
                Friendship(user_id=friend_id, friend_id=current_user.id),
            ]
        )
        try:
            await db.commit()
        except IntegrityError as exc:
            await db.rollback()
            existing = (
                await db.execute(
                    select(Friendship.id).where(
                        Friendship.user_id == current_user.id,
                        Friendship.friend_id == friend_id,
                    )
                )
            ).scalar_one_or_none()
            if existing is None:
                raise HTTPException(status_code=409, detail="Friend could not be added") from exc
    return _friend_out(friend, now=datetime.utcnow())


@router.delete("/{friend_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_friend(
    friend_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await db.execute(
        delete(Friendship).where(
            or_(
                (Friendship.user_id == current_user.id) & (Friendship.friend_id == friend_id),
                (Friendship.user_id == friend_id) & (Friendship.friend_id == current_user.id),
            )
        )
    )
    await db.commit()
