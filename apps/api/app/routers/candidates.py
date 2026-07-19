from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_candidate
from app.models import CandidateProfile, User
from app.schemas import ProfileOut, ProfileUpdate


router = APIRouter()


@router.get("/profile", response_model=ProfileOut)
async def get_profile(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileOut:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    return ProfileOut.model_validate(profile)

# Auto‑fill profile from a CV using Gemini (backend only)
@router.post("/profile/auto-fill", response_model=ProfileUpdate)
async def auto_fill_profile(
    cv: UploadFile = File(...),
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Read file bytes
    content = await cv.read()
    # Extract profile fields via Gemini
    from app.services.cv_extractor import extract_profile_from_cv
    extracted = await extract_profile_from_cv(content, cv.filename or "cv")
    # Map to the ProfileUpdate schema (fields may be None)
    fields = {
        "city": extracted.get("city"),
        "phone": extracted.get("phone"),
        "headline": extracted.get("headline"),
        "bio": extracted.get("bio"),
        "field_of_study": extracted.get("field_of_study"),
        "university": extracted.get("university"),
        "study_level": extracted.get("study_level"),
        "skills": extracted.get("skills"),
        "years_of_experience": extracted.get("years_of_experience"),
        "linkedin_url": extracted.get("linkedin_url"),
        "portfolio_url": extracted.get("portfolio_url"),
    }
    return fields


@router.put("/profile", response_model=ProfileOut)
async def update_profile(
    data: ProfileUpdate,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileOut:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == current_user.id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")

    updates = data.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(profile, key, value)

    await db.commit()
    await db.refresh(profile)
    return ProfileOut.model_validate(profile)

# Auto‑fill profile from a CV using Gemini (backend only)
@router.post("/profile/auto-fill", response_model=ProfileUpdate)
async def auto_fill_profile(
    cv: UploadFile = File(...),
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict:
    # Read file bytes
    content = await cv.read()
    # Extract profile fields via Gemini
    from app.services.cv_extractor import extract_profile_from_cv
    extracted = await extract_profile_from_cv(content, cv.filename or "cv")
    # Map to the ProfileUpdate schema (fields may be None)
    fields = {
        "city": extracted.get("city"),
        "phone": extracted.get("phone"),
        "headline": extracted.get("headline"),
        "bio": extracted.get("bio"),
        "field_of_study": extracted.get("field_of_study"),
        "university": extracted.get("university"),
        "study_level": extracted.get("study_level"),
        "skills": extracted.get("skills"),
        "years_of_experience": extracted.get("years_of_experience"),
        "linkedin_url": extracted.get("linkedin_url"),
        "portfolio_url": extracted.get("portfolio_url"),
    }
    return fields
