"""add institution membership and licensing

Revision ID: x1a2b3c4d5e6
Revises: w1a2b3c4d5e6
Create Date: 2026-10-03 15:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "x1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "w1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "institutions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=180), nullable=False),
        sa.Column("domain", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("license_plan", sa.String(length=30), nullable=False, server_default="community"),
        sa.Column("seat_limit", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("license_expires_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_institutions_status"),
        sa.CheckConstraint("license_plan IN ('community', 'standard', 'enterprise')", name="ck_institutions_license_plan"),
        sa.CheckConstraint("seat_limit BETWEEN 1 AND 100000", name="ck_institutions_seat_limit"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("domain"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_institutions_status", "institutions", ["status"])
    op.create_table(
        "institution_memberships",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("institution_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role", sa.String(length=30), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="active"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("role IN ('ADMIN', 'ADVISOR', 'STUDENT')", name="ck_institution_membership_role"),
        sa.CheckConstraint("status IN ('active', 'inactive')", name="ck_institution_membership_status"),
        sa.ForeignKeyConstraint(["institution_id"], ["institutions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("institution_id", "user_id", name="uq_institution_membership"),
    )
    op.create_index("ix_institution_memberships_user", "institution_memberships", ["user_id", "status"])
    op.create_index("ix_institution_memberships_institution", "institution_memberships", ["institution_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_institution_memberships_institution", table_name="institution_memberships")
    op.drop_index("ix_institution_memberships_user", table_name="institution_memberships")
    op.drop_table("institution_memberships")
    op.drop_index("ix_institutions_status", table_name="institutions")
    op.drop_table("institutions")
