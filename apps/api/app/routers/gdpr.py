from datetime import datetime, timezone
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Request, status
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import get_current_user
from app.limiter import limiter
from app.models import Application, CandidateProfile, User
from app.observability import get_logger
from app.schemas import GDPRDeleteRequest, GDPRExportOut, UserOut

router = APIRouter()
logger = get_logger("gdpr")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/export", response_model=GDPRExportOut)
@limiter.limit("2/minute")
async def gdpr_export_data(
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> GDPRExportOut:
    """GDPR Data Portability (Article 20): Export full user profile and activity records."""
    # 1. Candidate Profile
    profile_dict = None
    prof_res = await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == current_user.id))
    prof = prof_res.scalar_one_or_none()
    if prof:
        profile_dict = {
            "city": prof.city,
            "phone": prof.phone,
            "field_of_study": prof.field_of_study,
            "university": prof.university,
            "study_level": prof.study_level,
            "onboarding_completed": prof.onboarding_completed,
            "skills": getattr(prof, "skills", None),
            "experience_summary": getattr(prof, "experience_summary", None),
        }

    # 2. Applications
    apps_res = await db.execute(select(Application).where(Application.candidate_id == current_user.id))
    applications = apps_res.scalars().all()
    apps_list = [
        {
            "id": str(app.id),
            "offer_id": str(app.offer_id),
            "status": app.status.value if hasattr(app.status, "value") else str(app.status),
            "created_at": app.created_at.isoformat() if hasattr(app, "created_at") and app.created_at else None,
        }
        for app in applications
    ]

    logger.info("gdpr_export_generated", user_id=str(current_user.id))
    return GDPRExportOut(
        exported_at=datetime.now(timezone.utc).isoformat(),
        user_info=UserOut.model_validate(current_user),
        candidate_profile=profile_dict,
        applications=apps_list,
        audit_logs=[],
    )


@router.delete("/delete", status_code=status.HTTP_200_OK)
@limiter.limit("2/minute")
async def gdpr_delete_account(
    data: GDPRDeleteRequest,
    request: Request,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    """GDPR Right to Erasure (Article 17): Permanent account and personal data deletion."""
    if not pwd_context.verify(data.password, current_user.password_hash):
        logger.warning("gdpr_delete_failed", user_id=str(current_user.id), reason="invalid_password")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid account password.",
        )

    user_id_str = str(current_user.id)
    prof_res = await db.execute(select(CandidateProfile).where(CandidateProfile.user_id == current_user.id))
    prof = prof_res.scalar_one_or_none()
    if prof:
        await db.delete(prof)

    apps_res = await db.execute(select(Application).where(Application.candidate_id == current_user.id))
    for app_item in apps_res.scalars().all():
        await db.delete(app_item)

    await db.delete(current_user)
    await db.commit()

    logger.info("gdpr_account_deleted", user_id=user_id_str)
    return {"detail": "Your account and all associated personal data have been permanently deleted."}
