from __future__ import annotations

from datetime import datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import Notification, NotificationPreference, User
from app.schemas import (
    NotificationListOut,
    NotificationOut,
    NotificationPreferenceOut,
    NotificationPreferenceUpdate,
    NotificationUnreadOut,
)


router = APIRouter()


def _preference_out(value: NotificationPreference | None, user_id: UUID) -> NotificationPreferenceOut:
    if value is None:
        return NotificationPreferenceOut(user_id=user_id)
    return NotificationPreferenceOut.model_validate(value)


@router.get("", response_model=NotificationListOut)
async def list_notifications(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    page: int = Query(default=1, ge=1, le=10_000),
    limit: int = Query(default=25, ge=1, le=100),
    unread_only: bool = Query(default=False),
) -> NotificationListOut:
    filters = [Notification.user_id == current_user.id]
    if unread_only:
        filters.append(Notification.read_at.is_(None))
    total = int(
        (await db.execute(select(func.count(Notification.id)).where(*filters))).scalar_one()
    )
    unread = int(
        (
            await db.execute(
                select(func.count(Notification.id)).where(
                    Notification.user_id == current_user.id,
                    Notification.read_at.is_(None),
                )
            )
        ).scalar_one()
    )
    items = list(
        (
            await db.execute(
                select(Notification)
                .where(*filters)
                .order_by(Notification.created_at.desc(), Notification.id.desc())
                .offset((page - 1) * limit)
                .limit(limit)
            )
        ).scalars()
    )
    return NotificationListOut(
        notifications=[NotificationOut.model_validate(item) for item in items],
        total=total,
        unread=unread,
        page=page,
        limit=limit,
    )


@router.get("/unread", response_model=NotificationUnreadOut)
async def unread_count(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationUnreadOut:
    count = int(
        (
            await db.execute(
                select(func.count(Notification.id)).where(
                    Notification.user_id == current_user.id,
                    Notification.read_at.is_(None),
                )
            )
        ).scalar_one()
    )
    return NotificationUnreadOut(unread=count)


@router.patch("/{notification_id}/read", response_model=NotificationOut)
async def mark_notification_read(
    notification_id: UUID,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationOut:
    notification = (
        await db.execute(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == current_user.id,
            )
        )
    ).scalar_one_or_none()
    if notification is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    if notification.read_at is None:
        notification.read_at = datetime.utcnow()
        await db.commit()
        await db.refresh(notification)
    return NotificationOut.model_validate(notification)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.read_at.is_(None))
        .values(read_at=datetime.utcnow())
    )
    await db.commit()


@router.get("/preferences/me", response_model=NotificationPreferenceOut)
async def get_notification_preferences(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPreferenceOut:
    value = (
        await db.execute(
            select(NotificationPreference).where(
                NotificationPreference.user_id == current_user.id
            )
        )
    ).scalar_one_or_none()
    return _preference_out(value, current_user.id)


@router.put("/preferences/me", response_model=NotificationPreferenceOut)
async def update_notification_preferences(
    data: NotificationPreferenceUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> NotificationPreferenceOut:
    value = (
        await db.execute(
            select(NotificationPreference)
            .where(NotificationPreference.user_id == current_user.id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if value is None:
        value = NotificationPreference(user_id=current_user.id)
        db.add(value)
    for field, enabled in data.model_dump().items():
        setattr(value, field, enabled)
    value.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(value)
    return NotificationPreferenceOut.model_validate(value)
