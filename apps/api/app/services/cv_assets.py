"""Owner-bound CV asset lookup and retention helpers."""
from __future__ import annotations

import asyncio
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Application, CVAsset, CandidateProfile
from app.observability import get_logger
from app.services.cv_storage import CVStorageError, assert_owns_path, delete_cv


logger = get_logger("cv_assets")

# Explicit retention rule: an immutable CV version is retained for the entire
# lifetime of every application that references it. Profile replacement or
# removal only releases the profile reference; storage is deleted after the
# final profile/application reference is gone.
CV_APPLICATION_RETENTION_POLICY = "retain_while_application_exists"


class CVAssetOwnershipError(ValueError):
    pass


def assert_cv_asset_owner(asset: CVAsset, owner_id: UUID) -> None:
    if asset.owner_id != owner_id:
        raise CVAssetOwnershipError("CV asset owner mismatch")
    try:
        assert_owns_path(asset.storage_path, str(owner_id))
    except CVStorageError as exc:
        raise CVAssetOwnershipError("CV asset storage scope mismatch") from exc


async def get_owned_cv_asset(
    db: AsyncSession,
    asset_id: UUID | None,
    owner_id: UUID,
    *,
    lock: bool = False,
) -> CVAsset | None:
    if asset_id is None:
        return None
    statement = select(CVAsset).where(
        CVAsset.id == asset_id,
        CVAsset.owner_id == owner_id,
    )
    if lock:
        statement = statement.with_for_update()
    asset = (await db.execute(statement)).scalar_one_or_none()
    if asset is not None:
        assert_cv_asset_owner(asset, owner_id)
    return asset


async def get_current_cv_asset(
    db: AsyncSession,
    profile: CandidateProfile,
    owner_id: UUID,
    *,
    lock: bool = False,
) -> CVAsset | None:
    if profile.user_id != owner_id:
        raise CVAssetOwnershipError("CV profile owner mismatch")
    asset = await get_owned_cv_asset(
        db,
        profile.current_cv_asset_id,
        owner_id,
        lock=lock,
    )
    if profile.current_cv_asset_id is not None and asset is None:
        raise CVAssetOwnershipError("Current CV asset is missing or foreign")
    return asset


async def get_application_cv_asset(
    db: AsyncSession,
    application: Application,
    *,
    lock: bool = False,
) -> CVAsset | None:
    asset = await get_owned_cv_asset(
        db,
        application.cv_asset_id,
        application.candidate_id,
        lock=lock,
    )
    if application.cv_asset_id is not None and asset is None:
        raise CVAssetOwnershipError("Application CV asset is missing or foreign")
    return asset


async def next_cv_asset_version(db: AsyncSession, owner_id: UUID) -> int:
    current = await db.scalar(
        select(func.max(CVAsset.version)).where(CVAsset.owner_id == owner_id)
    )
    return int(current or 0) + 1


async def cv_asset_reference_count(db: AsyncSession, asset_id: UUID) -> int:
    profile_refs = await db.scalar(
        select(func.count())
        .select_from(CandidateProfile)
        .where(CandidateProfile.current_cv_asset_id == asset_id)
    )
    application_refs = await db.scalar(
        select(func.count())
        .select_from(Application)
        .where(Application.cv_asset_id == asset_id)
    )
    return int(profile_refs or 0) + int(application_refs or 0)


async def garbage_collect_cv_asset(
    db: AsyncSession,
    asset_id: UUID | None,
    owner_id: UUID,
) -> bool:
    """Delete one asset only after proving it is unreferenced.

    The row lock serializes cleanup with application creation, which also
    locks the selected current asset until its snapshot reference commits.
    Storage cleanup is best effort; a failed delete leaves the asset row for a
    later retry instead of losing the only metadata for an orphaned object.
    """
    if asset_id is None:
        return False
    asset = (
        await db.execute(
            select(CVAsset)
            .where(CVAsset.id == asset_id, CVAsset.owner_id == owner_id)
            .with_for_update()
        )
    ).scalar_one_or_none()
    if asset is None:
        await db.commit()
        return False
    if await cv_asset_reference_count(db, asset.id):
        await db.commit()
        return False
    try:
        assert_cv_asset_owner(asset, owner_id)
        await asyncio.to_thread(delete_cv, asset.storage_path)
    except (CVAssetOwnershipError, CVStorageError):
        await db.commit()
        logger.warning("cv_asset_cleanup_deferred", asset_id=str(asset.id))
        return False
    await db.delete(asset)
    try:
        await db.commit()
    except Exception:
        await db.rollback()
        logger.warning("cv_asset_metadata_cleanup_failed", asset_id=str(asset.id))
        return False
    logger.info("cv_asset_garbage_collected", asset_id=str(asset.id))
    return True
