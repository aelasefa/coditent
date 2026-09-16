"""add ai_status to applications for recruiter screening lifecycle

Revision ID: b4e7f2a9c1d3
Revises: a3f9c1d4e5b7
Create Date: 2026-09-16 00:00:00.000000

Why:
- Application.ai_score/ai_report existed but nothing ever wrote them,
  so recruiter AI stayed "pending" forever with no failure path.
- ai_status (pending/processing/completed/failed) makes the screening
  lifecycle explicit. Existing rows default to pending; genuinely
  unscored rows can be queued.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b4e7f2a9c1d3"
down_revision: Union[str, Sequence[str], None] = "a3f9c1d4e5b7"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "applications",
        sa.Column("ai_status", sa.String(), nullable=False, server_default="pending"),
    )


def downgrade() -> None:
    op.drop_column("applications", "ai_status")
