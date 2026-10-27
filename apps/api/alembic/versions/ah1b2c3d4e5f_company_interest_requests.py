"""add public company interest review queue

Revision ID: ah1b2c3d4e5f
Revises: ag1b2c3d4e5f
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ah1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "ag1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_interest_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("status", sa.String(length=20), server_default="pending", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'invited', 'dismissed')",
            name="ck_company_interest_requests_status",
        ),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_company_interest_requests_created_at",
        "company_interest_requests",
        ["created_at"],
    )
    op.execute(
        "CREATE UNIQUE INDEX uq_company_interest_requests_pending_email "
        "ON company_interest_requests (lower(email)) WHERE status = 'pending'"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_company_interest_requests_pending_email")
    op.drop_index(
        "ix_company_interest_requests_created_at",
        table_name="company_interest_requests",
    )
    op.drop_table("company_interest_requests")
