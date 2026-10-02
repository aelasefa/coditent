import asyncio
import json
from datetime import UTC, datetime
from typing import Annotated

import uuid as uuid_lib

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_candidate, require_candidate_account
from app.models import CVAsset, CandidateProfile, User
from app.observability import get_logger
from app.schemas import (
    CVMetaOut,
    CVParseOut,
    OnboardingStateOut,
    OnboardingStepUpdate,
    ProfileOut,
    ProfileUpdate,
)
from app.services.cv_extraction import AIExtractionError, extract_profile_from_text
from app.services.cv_assets import (
    CVAssetOwnershipError,
    garbage_collect_cv_asset,
    get_current_cv_asset,
    next_cv_asset_version,
)
from app.services.cv_parser import (
    MAX_CV_BYTES,
    CVParseTimeoutError,
    CVResourceLimitError,
    NoExtractableTextError,
    extract_text_with_meta_async,
    validate_cv_file,
    validate_cv_content_async,
)
from app.services.cv_storage import (
    CVStorageError,
    delete_cv,
    download_cv,
    upload_cv,
)
from app.services.upload_limits import UploadTooLargeError, read_upload_limited

router = APIRouter()
logger = get_logger("candidates")

ONBOARDING_OPTIONS: dict[int, set[str]] = {
    1: {"ASAP", "WITHIN_3_MONTHS", "WITHIN_6_MONTHS", "PASSIVELY_BROWSING"},
    2: {"INTERNSHIP", "JOB", "BOTH"},
    3: {"engineering", "design", "data", "operations", "success"},
    4: {"Casablanca", "Rabat", "Marrakech", "Other in Morocco"},
    5: {"ON_SITE", "HYBRID", "REMOTE", "NO_PREFERENCE"},
    6: {"STUDENT", "RECENT_GRADUATE", "ZERO_TO_ONE", "ONE_TO_THREE", "THREE_TO_FIVE", "FIVE_PLUS"},
}

ONBOARDING_FIELD_BY_STEP = {
    1: "search_timeline",
    2: "desired_opportunity_type",
    3: "desired_fields",
    4: "desired_location",
    5: "preferred_work_mode",
    6: "career_stage",
}

MATCH_PROFILE_FIELDS = {
    "headline",
    "bio",
    "field_of_study",
    "university",
    "study_level",
    "city",
    "skills",
    "years_of_experience",
}


async def _clear_recommendation_cache(user_id) -> None:
    """Best-effort removal of legacy bulk results for this candidate only."""
    try:
        from app.cache import get_async_redis

        client = get_async_redis()
        keys = await client.keys(f"recommendations:{user_id}:*")
        if keys:
            await client.delete(*keys)
    except Exception:
        logger.warning("recommendation_cache_invalidation_failed", candidate_id=str(user_id))


async def _get_profile(db: AsyncSession, user_id) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


def _onboarding_state(profile: CandidateProfile) -> OnboardingStateOut:
    fields: list[str] = []
    if profile.desired_fields:
        try:
            parsed = json.loads(profile.desired_fields)
            if isinstance(parsed, list):
                fields = [str(value) for value in parsed]
        except (TypeError, ValueError):
            fields = []
    return OnboardingStateOut(
        search_timeline=profile.search_timeline,
        desired_opportunity_type=profile.desired_opportunity_type,
        desired_fields=fields,
        desired_location=profile.desired_location,
        preferred_work_mode=profile.preferred_work_mode,
        career_stage=profile.career_stage,
        onboarding_step=profile.onboarding_step,
        onboarding_completed=profile.onboarding_completed,
        onboarding_completed_at=profile.onboarding_completed_at,
    )


@router.get("/onboarding", response_model=OnboardingStateOut)
async def get_onboarding(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OnboardingStateOut:
    return _onboarding_state(await _get_profile(db, current_user.id))


@router.put("/onboarding/step", response_model=OnboardingStateOut)
async def update_onboarding_step(
    data: OnboardingStepUpdate,
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OnboardingStateOut:
    profile = await _get_profile(db, current_user.id)
    if profile.onboarding_completed:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Onboarding is already complete")
    if data.step > profile.onboarding_step:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complete the current step first")

    allowed = ONBOARDING_OPTIONS[data.step]
    if data.step == 3:
        if not isinstance(data.value, list) or not data.value:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Select at least one field")
        values = list(dict.fromkeys(data.value))
        if any(not isinstance(value, str) or value not in allowed for value in values):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid field selection")
        stored_value: str = json.dumps(values)
    else:
        if not isinstance(data.value, str) or data.value not in allowed:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Invalid onboarding answer")
        stored_value = data.value

    setattr(profile, ONBOARDING_FIELD_BY_STEP[data.step], stored_value)
    if data.step == profile.onboarding_step:
        profile.onboarding_step = min(7, data.step + 1)
    await db.commit()
    await db.refresh(profile)
    return _onboarding_state(profile)


@router.post("/onboarding/complete", response_model=OnboardingStateOut)
async def complete_onboarding(
    current_user: Annotated[User, Depends(require_candidate_account)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> OnboardingStateOut:
    profile = await _get_profile(db, current_user.id)
    required = (
        profile.search_timeline,
        profile.desired_opportunity_type,
        profile.desired_fields,
        profile.desired_location,
        profile.preferred_work_mode,
        profile.career_stage,
    )
    if profile.onboarding_step < 7 or not all(required):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Complete every onboarding step first")
    if not profile.onboarding_completed:
        profile.onboarding_completed = True
        profile.onboarding_completed_at = datetime.now(UTC).replace(tzinfo=None)
        await db.commit()
        await db.refresh(profile)
    return _onboarding_state(profile)


CONTENT_TYPE_BY_EXT = {
    "pdf": "application/pdf",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
}


def _safe_filename(name: str) -> str:
    safe = "".join(c for c in (name or "cv") if c.isalnum() or c in ("-", "_", ".", " ")).strip()
    return (safe or "cv")[:80]


@router.get("/profile", response_model=ProfileOut)
async def get_profile(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileOut:
    profile = await _get_profile(db, current_user.id)
    return ProfileOut.model_validate(profile)


@router.put("/profile", response_model=ProfileOut)
async def update_profile(
    data: ProfileUpdate,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> ProfileOut:
    profile = await _get_profile(db, current_user.id)
    updates = data.model_dump(exclude_unset=True)
    match_profile_changed = any(
        key in MATCH_PROFILE_FIELDS and getattr(profile, key) != value
        for key, value in updates.items()
    )
    for key, value in updates.items():
        setattr(profile, key, value)

    if match_profile_changed:
        from app.services.match_scoring import invalidate_candidate_matches

        await invalidate_candidate_matches(db, current_user.id)
    await db.commit()
    await db.refresh(profile)
    if match_profile_changed:
        await _clear_recommendation_cache(current_user.id)
    return ProfileOut.model_validate(profile)


@router.post("/cv", response_model=CVMetaOut, status_code=status.HTTP_201_CREATED)
async def upload_candidate_cv(
    file: UploadFile,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CVMetaOut:
    filename = file.filename or ""
    try:
        data = await read_upload_limited(file, MAX_CV_BYTES)
    except UploadTooLargeError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="File too large. Maximum size is 5MB",
        ) from exc
    finally:
        await file.close()
    try:
        ext = validate_cv_file(filename, file.content_type, len(data))
        await validate_cv_content_async(data, ext)
    except CVResourceLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(exc),
        ) from exc
    except CVParseTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="CV could not be validated within the processing limit",
        ) from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    profile = await _get_profile(db, current_user.id)
    try:
        old_asset = await get_current_cv_asset(
            db,
            profile,
            current_user.id,
            lock=True,
        )
    except CVAssetOwnershipError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Current CV is invalid",
        ) from exc
    old_asset_id = old_asset.id if old_asset is not None else None
    version = await next_cv_asset_version(db, current_user.id)
    asset_id = uuid_lib.uuid4()
    submitted_name = filename.replace("\\", "/").rsplit("/", 1)[-1]
    base = submitted_name.rsplit(".", 1)[0]
    display_filename = f"{_safe_filename(base)}.{ext}"
    path = f"{current_user.id}/{asset_id.hex}_{_safe_filename(base)}.{ext}"
    try:
        await asyncio.to_thread(upload_cv, path, data, CONTENT_TYPE_BY_EXT[ext])
    except CVStorageError as exc:
        await db.rollback()
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    asset = CVAsset(
        id=asset_id,
        owner_id=current_user.id,
        version=version,
        storage_path=path,
        original_filename=display_filename,
        content_type=CONTENT_TYPE_BY_EXT[ext],
        size_bytes=len(data),
    )
    db.add(asset)
    profile.current_cv_asset_id = asset.id
    profile.cv_url = path
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        try:
            await asyncio.to_thread(delete_cv, path)
        except CVStorageError:
            logger.warning("cv_failed_upload_cleanup_deferred", asset_id=str(asset.id))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CV could not be saved",
        ) from exc
    await db.refresh(profile)
    if old_asset_id and old_asset_id != asset.id:
        await garbage_collect_cv_asset(db, old_asset_id, current_user.id)
    logger.info("cv_uploaded", user_id=str(current_user.id))
    return CVMetaOut(
        cv_url=path,
        filename=display_filename,
        content_type=CONTENT_TYPE_BY_EXT[ext],
        size_bytes=len(data),
    )


@router.get("/cv/meta", response_model=CVMetaOut)
async def get_cv_meta(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CVMetaOut:
    profile = await _get_profile(db, current_user.id)
    try:
        asset = await get_current_cv_asset(db, profile, current_user.id)
    except CVAssetOwnershipError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No CV uploaded")
    return CVMetaOut(
        cv_url=asset.storage_path,
        filename=asset.original_filename,
        content_type=asset.content_type,
        size_bytes=asset.size_bytes,
    )


@router.get("/cv")
async def download_candidate_cv(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await _get_profile(db, current_user.id)
    try:
        asset = await get_current_cv_asset(db, profile, current_user.id)
    except CVAssetOwnershipError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    if asset is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No CV uploaded")
    try:
        data = await asyncio.to_thread(download_cv, asset.storage_path)
    except CVStorageError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found") from exc
    return StreamingResponse(
        iter([data]),
        media_type=asset.content_type,
        headers={"Content-Disposition": f'attachment; filename="{asset.original_filename}"'},
    )


@router.delete("/cv", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate_cv(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    profile = await _get_profile(db, current_user.id)
    try:
        asset = await get_current_cv_asset(db, profile, current_user.id)
    except CVAssetOwnershipError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    if asset is None:
        if profile.cv_url:
            profile.cv_url = None
            await db.commit()
        return None
    old_asset_id = asset.id
    profile.current_cv_asset_id = None
    profile.cv_url = None
    try:
        await db.commit()
    except Exception as exc:
        await db.rollback()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CV could not be removed",
        ) from exc
    # Application snapshots follow the explicit retain-while-application-exists
    # policy; cleanup deletes storage only when no application references it.
    await garbage_collect_cv_asset(db, old_asset_id, current_user.id)
    logger.info("cv_deleted", user_id=str(current_user.id))
    return None


@router.post("/cv/parse", response_model=CVParseOut)
async def parse_candidate_cv(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CVParseOut:
    """Extract structured data from stored CV. Read-only: never mutates profile (retry-safe)."""
    profile = await _get_profile(db, current_user.id)
    try:
        asset = await get_current_cv_asset(db, profile, current_user.id)
    except CVAssetOwnershipError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CV_FILE_READ_ERROR", "message": "No CV uploaded"},
        )
    try:
        data = await asyncio.to_thread(download_cv, asset.storage_path)
    except CVStorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CV_FILE_READ_ERROR", "message": "CV not found"},
        ) from exc

    filename = asset.original_filename
    logger.info("cv_parse_downloaded", file_bytes=len(data))
    try:
        text, pages = await extract_text_with_meta_async(filename, data)
    except NoExtractableTextError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CV_NO_TEXT", "message": str(exc)},
        ) from exc
    except CVResourceLimitError as exc:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail={"code": "CV_RESOURCE_LIMIT", "message": str(exc)},
        ) from exc
    except CVParseTimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CV_PARSE_TIMEOUT", "message": str(exc)},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CV_FILE_READ_ERROR", "message": str(exc)},
        ) from exc

    logger.info("cv_parse_text", text_chars=len(text), pages=pages if pages is not None else -1)
    try:
        extracted, warnings, ai_meta = await extract_profile_from_text(text)
    except AIExtractionError as exc:
        status_code = (
            status.HTTP_504_GATEWAY_TIMEOUT
            if exc.code == "CV_AI_TIMEOUT"
            else status.HTTP_502_BAD_GATEWAY
        )
        raise HTTPException(
            status_code=status_code,
            detail={"code": exc.code, "message": str(exc)},
        ) from exc
    logger.info("cv_parse_validated", fields=len(extracted.model_dump(exclude_none=True)))
    meta: dict[str, int] = {
        "file_bytes": len(data),
        "text_chars": len(text),
        "ai_response_chars": ai_meta.get("ai_response_chars", 0),
    }
    if pages is not None:
        meta["pages"] = pages
    return CVParseOut(extracted=extracted, warnings=warnings, has_cv=True, meta=meta)
