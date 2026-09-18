"""add match status lifecycle to saved_recommendations

Revision ID: e1f2a3b4c5d6
Revises: d9e0f1a2b3c4
Create Date: 2026-09-18 00:00:00.000000

Why:
- SavedRecommendation had only ai_score/ai_reasoning with no status column,
  so candidate match analysis could sit at score=0 ("pending") forever with
  no processing/completed/failed lifecycle and no failure path.
- Adds status (pending/processing/completed/failed), error (safe failure
  reason, never secrets), updated_at. Existing score=0 rows backfill to
  pending; scored rows backfill to completed so Discover can render them.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e1f2a3b4c5d6"
down_revision: Union[str, Sequence[str], None] = "d9e0f1a2b3c4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "saved_recommendations",
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
    )
    op.add_column(
        "saved_recommendations",
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.add_column(
        "saved_recommendations",
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    # Backfill: rows that already carry a real score are completed history.
    op.execute(
        sa.text(
            "UPDATE saved_recommendations SET status='completed' WHERE ai_score > 0"
        )
    )


def downgrade() -> None:
    op.drop_column("saved_recommendations", "updated_at")
    op.drop_column("saved_recommendations", "error")
    op.drop_column("saved_recommendations", "status")
