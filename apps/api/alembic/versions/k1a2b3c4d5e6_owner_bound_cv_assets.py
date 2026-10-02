"""add immutable owner-bound CV assets

Revision ID: k1a2b3c4d5e6
Revises: j1a2b3c4d5e6
Create Date: 2026-10-01 00:00:00.000000

Application CV snapshots are retained for as long as the application row
exists. Removing or replacing the profile's current CV therefore never
deletes an asset still referenced by an application.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "k1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "j1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _owned_path(path: str | None, owner_id: object) -> bool:
    if not path:
        return False
    normalized = path.replace("\\", "/")
    parts = normalized.split("/")
    return bool(
        normalized == path
        and len(parts) >= 2
        and parts[0] == str(owner_id)
        and all(part not in {"", ".", ".."} for part in parts)
        and not any(ord(character) < 32 or ord(character) == 127 for character in path)
        and parts[-1].lower().endswith((".pdf", ".docx"))
    )


def _content_type(path: str) -> str:
    return (
        "application/pdf"
        if path.lower().endswith(".pdf")
        else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )


def upgrade() -> None:
    op.create_table(
        "cv_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("owner_id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("storage_path", sa.String(), nullable=False),
        sa.Column("original_filename", sa.String(), nullable=False),
        sa.Column("content_type", sa.String(length=100), nullable=False),
        sa.Column("size_bytes", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("id", "owner_id", name="uq_cv_assets_id_owner"),
        sa.UniqueConstraint("owner_id", "version", name="uq_cv_assets_owner_version"),
        sa.UniqueConstraint("storage_path", name="uq_cv_assets_storage_path"),
    )
    op.create_index("ix_cv_assets_owner_id", "cv_assets", ["owner_id"])

    op.add_column(
        "candidate_profiles",
        sa.Column("current_cv_asset_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "applications",
        sa.Column("cv_asset_id", sa.Uuid(), nullable=True),
    )

    connection = op.get_bind()
    assets = sa.table(
        "cv_assets",
        sa.column("id", sa.Uuid()),
        sa.column("owner_id", sa.Uuid()),
        sa.column("version", sa.Integer()),
        sa.column("storage_path", sa.String()),
        sa.column("original_filename", sa.String()),
        sa.column("content_type", sa.String()),
        sa.column("size_bytes", sa.Integer()),
        sa.column("created_at", sa.DateTime()),
    )
    profiles = sa.table(
        "candidate_profiles",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("cv_url", sa.String()),
        sa.column("current_cv_asset_id", sa.Uuid()),
    )
    applications = sa.table(
        "applications",
        sa.column("id", sa.Uuid()),
        sa.column("candidate_id", sa.Uuid()),
        sa.column("cv_url", sa.String()),
        sa.column("cv_asset_id", sa.Uuid()),
    )

    asset_by_owner_path: dict[tuple[str, str], uuid.UUID] = {}
    profile_asset_by_owner: dict[str, uuid.UUID] = {}
    version_by_owner: dict[str, int] = {}

    def ensure_asset(owner_id: object, path: str) -> uuid.UUID:
        owner_key = str(owner_id)
        key = (owner_key, path)
        existing = asset_by_owner_path.get(key)
        if existing is not None:
            return existing
        version = version_by_owner.get(owner_key, 0) + 1
        version_by_owner[owner_key] = version
        asset_id = uuid.uuid4()
        connection.execute(
            assets.insert().values(
                id=asset_id,
                owner_id=owner_id,
                version=version,
                storage_path=path,
                original_filename=path.rsplit("/", 1)[-1],
                content_type=_content_type(path),
                size_bytes=None,
                created_at=datetime.utcnow(),
            )
        )
        asset_by_owner_path[key] = asset_id
        return asset_id

    profile_rows = connection.execute(
        sa.select(profiles.c.id, profiles.c.user_id, profiles.c.cv_url)
    ).mappings()
    for row in profile_rows:
        path = row["cv_url"]
        if not _owned_path(path, row["user_id"]):
            continue
        asset_id = ensure_asset(row["user_id"], path)
        profile_asset_by_owner[str(row["user_id"])] = asset_id
        connection.execute(
            profiles.update()
            .where(profiles.c.id == row["id"])
            .values(current_cv_asset_id=asset_id)
        )

    application_rows = connection.execute(
        sa.select(
            applications.c.id,
            applications.c.candidate_id,
            applications.c.cv_url,
        )
    ).mappings()
    for row in application_rows:
        path = row["cv_url"]
        asset_id: uuid.UUID | None = None
        if _owned_path(path, row["candidate_id"]):
            asset_id = ensure_asset(row["candidate_id"], path)
        if asset_id is None:
            # Legacy applications without a valid snapshot used the live
            # profile CV. Freeze that safe owner-bound version at migration.
            asset_id = profile_asset_by_owner.get(str(row["candidate_id"]))
        if asset_id is not None:
            connection.execute(
                applications.update()
                .where(applications.c.id == row["id"])
                .values(cv_asset_id=asset_id)
            )

    op.create_foreign_key(
        "fk_candidate_profiles_current_cv_owner",
        "candidate_profiles",
        "cv_assets",
        ["current_cv_asset_id", "user_id"],
        ["id", "owner_id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_applications_cv_asset_owner",
        "applications",
        "cv_assets",
        ["cv_asset_id", "candidate_id"],
        ["id", "owner_id"],
        ondelete="RESTRICT",
    )
    op.create_index(
        "ix_candidate_profiles_current_cv_asset_id",
        "candidate_profiles",
        ["current_cv_asset_id"],
    )
    op.create_index(
        "ix_applications_cv_asset_id",
        "applications",
        ["cv_asset_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_applications_cv_asset_id", table_name="applications")
    op.drop_index(
        "ix_candidate_profiles_current_cv_asset_id",
        table_name="candidate_profiles",
    )
    op.drop_constraint(
        "fk_applications_cv_asset_owner",
        "applications",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_candidate_profiles_current_cv_owner",
        "candidate_profiles",
        type_="foreignkey",
    )
    op.drop_column("applications", "cv_asset_id")
    op.drop_column("candidate_profiles", "current_cv_asset_id")
    op.drop_index("ix_cv_assets_owner_id", table_name="cv_assets")
    op.drop_table("cv_assets")
