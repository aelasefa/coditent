"""add single-use password recovery attempts

Revision ID: s1a2b3c4d5e6
Revises: r1a2b3c4d5e6
Create Date: 2026-10-03 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "s1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "r1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "password_recoveries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_password_recoveries_token_hash"),
    )
    op.create_index(
        "ix_password_recoveries_user_id",
        "password_recoveries",
        ["user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_password_recoveries_expires_at",
        "password_recoveries",
        ["expires_at"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_password_recoveries_expires_at", table_name="password_recoveries")
    op.drop_index("ix_password_recoveries_user_id", table_name="password_recoveries")
    op.drop_table("password_recoveries")
