"""add encrypted durable email delivery outbox

Revision ID: r1a2b3c4d5e6
Revises: q1a2b3c4d5e6
Create Date: 2026-10-03 11:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "r1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "q1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "email_deliveries",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("dedupe_key", sa.String(length=255), nullable=False),
        sa.Column("resource_type", sa.String(length=50), nullable=False),
        sa.Column("resource_id", sa.UUID(), nullable=False),
        sa.Column("encrypted_payload", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("max_attempts", sa.Integer(), nullable=False),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("lease_until", sa.DateTime(), nullable=True),
        sa.Column("lease_owner", sa.String(length=100), nullable=True),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("provider_message_id", sa.String(length=255), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "attempts >= 0 AND max_attempts BETWEEN 1 AND 10",
            name="ck_email_deliveries_attempts",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'processing', 'retry', 'sent', 'failed')",
            name="ck_email_deliveries_status",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key", name="uq_email_deliveries_dedupe_key"),
    )
    op.create_index(
        "ix_email_deliveries_dispatch",
        "email_deliveries",
        ["status", "available_at", "lease_until"],
        unique=False,
    )
    op.create_index(
        "ix_email_deliveries_resource",
        "email_deliveries",
        ["resource_type", "resource_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_email_deliveries_resource", table_name="email_deliveries")
    op.drop_index("ix_email_deliveries_dispatch", table_name="email_deliveries")
    op.drop_table("email_deliveries")
