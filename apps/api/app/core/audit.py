"""Centralized audit logging reusing admin_activity_logs.

Do not create a new table — reuse admin_activity_logs with details JSON
containing company_id/resource_type/resource_id. Never log raw tokens/secrets.
"""
import json
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.models import AdminActivityLog, User


async def log_audit(
    db: AsyncSession,
    *,
    action: str,
    actor: User,
    company_id: UUID | str | None = None,
    resource_type: str | None = None,
    resource_id: UUID | str | None = None,
    details: str | None = None,
) -> None:
    try:
        meta = {}
        if company_id:
            meta["company_id"] = str(company_id)
        if resource_type:
            meta["resource_type"] = resource_type
        if resource_id:
            meta["resource_id"] = str(resource_id)
        if details:
            meta["details"] = details
        db.add(
            AdminActivityLog(
                action=action,
                admin_id=actor.id,
                admin_email=actor.email,
                details=json.dumps(meta) if meta else None,
            )
        )
        await db.commit()
    except Exception:
        await db.rollback()
