import json
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.models import AdminActivityLog

router = APIRouter()


@router.get("", response_model=dict)
async def list_audit_logs(
    current_user: Annotated[object, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    role = getattr(current_user, "role", None)
    if role and role.value == "PLATFORM_ADMIN":
        result = await db.execute(select(AdminActivityLog).order_by(AdminActivityLog.created_at.desc()).limit(50))
        logs = result.scalars().all()
        return {"logs": [{"id": str(l.id), "action": l.action, "details": l.details, "created_at": l.created_at.isoformat()} for l in logs]}
    if role and role.value == "COMPANY_USER":
        cid = str(getattr(current_user, "company_id", ""))
        result = await db.execute(select(AdminActivityLog).order_by(AdminActivityLog.created_at.desc()).limit(100))
        logs = result.scalars().all()
        filtered = []
        for l in logs:
            if l.details and cid in l.details:
                filtered.append(l)
            # also include logs where admin_id == current_user.id (own actions) even if details missing
            elif l.admin_id == current_user.id:
                filtered.append(l)
        return {"logs": [{"id": str(l.id), "action": l.action, "details": l.details, "created_at": l.created_at.isoformat()} for l in filtered[:50]]}
    return {"logs": []}
