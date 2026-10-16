from __future__ import annotations

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Notification, NotificationPreference


_PREFERENCE_BY_CATEGORY = {
    "application": "application_updates",
    "interview": "interview_updates",
    "message": "message_updates",
    "system": None,
}


async def create_notification(
    db: AsyncSession,
    *,
    user_id: UUID,
    category: str,
    title: str,
    body: str,
    dedupe_key: str,
    action_url: str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | None = None,
) -> Notification | None:
    """Queue one durable in-app notification in the caller's transaction.

    The user preference is enforced server-side. Dedupe is backed by a unique
    database constraint so retries and concurrent workers cannot create two
    visible events. URLs must be internal application routes.
    """
    preference_field = _PREFERENCE_BY_CATEGORY.get(category)
    if category not in _PREFERENCE_BY_CATEGORY:
        raise ValueError("Unsupported notification category")
    if action_url is not None and (
        not action_url.startswith("/") or action_url.startswith("//")
    ):
        raise ValueError("Notification action_url must be an internal path")

    if preference_field is not None:
        preferences = (
            await db.execute(
                select(NotificationPreference).where(
                    NotificationPreference.user_id == user_id
                )
            )
        ).scalar_one_or_none()
        if preferences is not None and not getattr(preferences, preference_field):
            return None

    notification = Notification(
        user_id=user_id,
        category=category,
        title=" ".join(title.split())[:160],
        body=" ".join(body.split())[:2_000],
        action_url=action_url,
        resource_type=resource_type[:50] if resource_type else None,
        resource_id=resource_id,
        dedupe_key=dedupe_key[:200],
    )
    try:
        async with db.begin_nested():
            db.add(notification)
            await db.flush()
    except IntegrityError:
        return None
    return notification
