from typing import Annotated

import uuid as uuid_lib

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.dependencies import require_candidate
from app.models import CandidateProfile, User
from app.observability import get_logger
from app.schemas import CVMetaOut, CVParseOut, ProfileOut, ProfileUpdate
from app.services.cv_extraction import AIExtractionError, extract_profile_from_text
from app.services.cv_parser import (
    MAX_CV_BYTES,
    NoExtractableTextError,
    extract_text,
    get_pdf_page_count,
    validate_cv_file,
)
from app.services.cv_storage import (
    CVStorageError,
    assert_owns_path,
    delete_cv,
    download_cv,
    upload_cv,
)

router = APIRouter()
logger = get_logger("candidates")


async def _get_profile(db: AsyncSession, user_id) -> CandidateProfile:
    result = await db.execute(
        select(CandidateProfile).where(CandidateProfile.user_id == user_id)
    )
    profile = result.scalar_one_or_none()
    if profile is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Profile not found")
    return profile


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
    for key, value in updates.items():
        setattr(profile, key, value)

    await db.commit()
    await db.refresh(profile)
    return ProfileOut.model_validate(profile)


@router.post("/cv", response_model=CVMetaOut, status_code=status.HTTP_201_CREATED)
async def upload_candidate_cv(
    file: UploadFile,
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CVMetaOut:
    filename = file.filename or ""
    try:
        # Read first to know size (Streamlit-style); cap at MAX+1 to detect oversize
        data = await file.read()
    finally:
        await file.close()
    try:
        ext = validate_cv_file(filename, file.content_type, len(data))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
    if len(data) > MAX_CV_BYTES:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="File too large. Maximum size is 5MB")

    profile = await _get_profile(db, current_user.id)
    # Delete previous CV first (best effort, ownership enforced)
    old_path = profile.cv_url
    if old_path:
        try:
            assert_owns_path(old_path, str(current_user.id))
            delete_cv(old_path)
        except CVStorageError:
            pass

    base = filename.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    path = f"{current_user.id}/{uuid_lib.uuid4().hex}_{_safe_filename(base)}.{ext}"
    try:
        upload_cv(path, data, CONTENT_TYPE_BY_EXT[ext])
    except CVStorageError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)) from exc

    profile.cv_url = path
    await db.commit()
    await db.refresh(profile)
    logger.info("cv_uploaded", user_id=str(current_user.id))
    return CVMetaOut(cv_url=path, filename=filename, content_type=CONTENT_TYPE_BY_EXT[ext], size_bytes=len(data))


@router.get("/cv/meta", response_model=CVMetaOut)
async def get_cv_meta(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CVMetaOut:
    profile = await _get_profile(db, current_user.id)
    if not profile.cv_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No CV uploaded")
    try:
        assert_owns_path(profile.cv_url, str(current_user.id))
    except CVStorageError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
    filename = profile.cv_url.rsplit("/", 1)[-1]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return CVMetaOut(
        cv_url=profile.cv_url,
        filename=filename,
        content_type=CONTENT_TYPE_BY_EXT.get(ext),
        size_bytes=None,
    )


@router.get("/cv")
async def download_candidate_cv(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
):
    profile = await _get_profile(db, current_user.id)
    if not profile.cv_url:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No CV uploaded")
    try:
        assert_owns_path(profile.cv_url, str(current_user.id))
        data = download_cv(profile.cv_url)
    except CVStorageError as exc:
        msg = str(exc)
        if msg == "Forbidden":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found") from exc
    filename = profile.cv_url.rsplit("/", 1)[-1]
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    media = CONTENT_TYPE_BY_EXT.get(ext, "application/octet-stream")
    return StreamingResponse(
        iter([data]),
        media_type=media,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.delete("/cv", status_code=status.HTTP_204_NO_CONTENT)
async def delete_candidate_cv(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> None:
    profile = await _get_profile(db, current_user.id)
    if not profile.cv_url:
        return None
    try:
        assert_owns_path(profile.cv_url, str(current_user.id))
        delete_cv(profile.cv_url)
    except CVStorageError as exc:
        if str(exc) == "Forbidden":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
        # Storage missing but DB points to it: still clear DB to stay consistent
        logger.error("cv_delete_storage_miss")
    profile.cv_url = None
    await db.commit()
    logger.info("cv_deleted", user_id=str(current_user.id))
    return None


@router.post("/cv/parse", response_model=CVParseOut)
async def parse_candidate_cv(
    current_user: Annotated[User, Depends(require_candidate)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> CVParseOut:
    """Extract structured data from stored CV. Read-only: never mutates profile (retry-safe)."""
    profile = await _get_profile(db, current_user.id)
    if not profile.cv_url:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CV_FILE_READ_ERROR", "message": "No CV uploaded"},
        )
    try:
        assert_owns_path(profile.cv_url, str(current_user.id))
        data = download_cv(profile.cv_url)
    except CVStorageError as exc:
        if str(exc) == "Forbidden":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden") from exc
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "CV_FILE_READ_ERROR", "message": "CV not found"},
        ) from exc

    filename = profile.cv_url.rsplit("/", 1)[-1]
    logger.info("cv_parse_downloaded", file_bytes=len(data))
    try:
        text = extract_text(filename, data)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"code": "CV_FILE_READ_ERROR", "message": str(exc)},
        ) from exc
    except NoExtractableTextError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"code": "CV_NO_TEXT", "message": str(exc)},
        ) from exc

    pages = get_pdf_page_count(data)
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
