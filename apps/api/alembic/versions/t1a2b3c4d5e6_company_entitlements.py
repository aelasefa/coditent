"""add enforceable company subscription entitlements

Revision ID: t1a2b3c4d5e6
Revises: s1a2b3c4d5e6
Create Date: 2026-10-03 13:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "t1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "s1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "companies",
        sa.Column("subscription_plan", sa.String(length=30), nullable=False, server_default="free"),
    )
    op.add_column(
        "companies",
        sa.Column("subscription_status", sa.String(length=30), nullable=False, server_default="active"),
    )
    op.add_column(
        "companies",
        sa.Column("subscription_expires_at", sa.DateTime(), nullable=True),
    )
    op.create_check_constraint(
        "ck_companies_subscription_plan",
        "companies",
        "subscription_plan IN ('free', 'pro', 'enterprise')",
    )
    op.create_check_constraint(
        "ck_companies_subscription_status",
        "companies",
        "subscription_status IN ('trialing', 'active', 'past_due', 'canceled')",
    )
    op.alter_column("companies", "subscription_plan", server_default=None)
    op.alter_column("companies", "subscription_status", server_default=None)


def downgrade() -> None:
    op.drop_constraint("ck_companies_subscription_status", "companies", type_="check")
    op.drop_constraint("ck_companies_subscription_plan", "companies", type_="check")
    op.drop_column("companies", "subscription_expires_at")
    op.drop_column("companies", "subscription_status")
    op.drop_column("companies", "subscription_plan")
