"""store revoked access sessions durably

Revision ID: ae1b2c3d4e5f
Revises: ad1b2c3d4e5f
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ae1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "ad1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "revoked_sessions",
        sa.Column("session_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("session_id"),
    )
    op.create_index(
        "ix_revoked_sessions_expires_at", "revoked_sessions", ["expires_at"]
    )
    op.create_index(
        "ix_revoked_sessions_user_id", "revoked_sessions", ["user_id"]
    )
    op.create_table(
        "revoked_trusted_devices",
        sa.Column("token_id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("token_id"),
    )
    op.create_index(
        "ix_revoked_trusted_devices_expires_at",
        "revoked_trusted_devices",
        ["expires_at"],
    )
    op.create_index(
        "ix_revoked_trusted_devices_user_id",
        "revoked_trusted_devices",
        ["user_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_revoked_trusted_devices_user_id",
        table_name="revoked_trusted_devices",
    )
    op.drop_index(
        "ix_revoked_trusted_devices_expires_at",
        table_name="revoked_trusted_devices",
    )
    op.drop_table("revoked_trusted_devices")
    op.drop_index("ix_revoked_sessions_user_id", table_name="revoked_sessions")
    op.drop_index("ix_revoked_sessions_expires_at", table_name="revoked_sessions")
    op.drop_table("revoked_sessions")
