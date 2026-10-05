"""add durable AI job outbox and lease state

Revision ID: l1a2b3c4d5e6
Revises: k1a2b3c4d5e6
Create Date: 2026-10-02 00:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "l1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "k1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_jobs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("kind", sa.String(length=50), nullable=False),
        sa.Column("dedupe_key", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("actor_id", sa.Uuid(), nullable=True),
        sa.Column("company_id", sa.Uuid(), nullable=True),
        sa.Column("resource_id", sa.Uuid(), nullable=True),
        sa.Column("payload", sa.Text(), nullable=False, server_default="{}"),
        sa.Column("source_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("available_at", sa.DateTime(), nullable=False),
        sa.Column("lease_until", sa.DateTime(), nullable=True),
        sa.Column("lease_owner", sa.String(length=100), nullable=True),
        sa.Column("last_error_code", sa.String(length=80), nullable=True),
        sa.Column("result", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint(
            "status IN ('pending', 'queued', 'processing', 'completed', 'failed', 'stale')",
            name="ck_ai_jobs_status",
        ),
        sa.CheckConstraint(
            "attempts >= 0 AND max_attempts BETWEEN 1 AND 10",
            name="ck_ai_jobs_attempts",
        ),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key", name="uq_ai_jobs_dedupe_key"),
    )
    op.create_index(
        "ix_ai_jobs_dispatch",
        "ai_jobs",
        ["status", "available_at", "lease_until"],
    )
    op.create_index("ix_ai_jobs_actor_id", "ai_jobs", ["actor_id"])
    op.create_index("ix_ai_jobs_company_id", "ai_jobs", ["company_id"])
    op.create_index("ix_ai_jobs_resource", "ai_jobs", ["kind", "resource_id"])


def downgrade() -> None:
    op.drop_index("ix_ai_jobs_resource", table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_company_id", table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_actor_id", table_name="ai_jobs")
    op.drop_index("ix_ai_jobs_dispatch", table_name="ai_jobs")
    op.drop_table("ai_jobs")
