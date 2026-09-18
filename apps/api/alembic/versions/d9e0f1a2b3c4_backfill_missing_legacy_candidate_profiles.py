"""backfill missing legacy candidate profiles as onboarding complete

Revision ID: d9e0f1a2b3c4
Revises: c7d8e9f0a1b2
Create Date: 2026-09-17 21:00:00.000000
"""
from datetime import datetime, timezone
from typing import Sequence, Union
from uuid import uuid4

from alembic import op
import sqlalchemy as sa


revision: str = "d9e0f1a2b3c4"
down_revision: Union[str, Sequence[str], None] = "c7d8e9f0a1b2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    missing_candidate_ids = bind.execute(
        sa.text(
            """
            SELECT users.id
            FROM users
            LEFT JOIN candidate_profiles ON candidate_profiles.user_id = users.id
            WHERE users.role = 'CANDIDATE' AND candidate_profiles.id IS NULL
            """
        )
    ).scalars().all()

    if not missing_candidate_ids:
        return

    candidate_profiles = sa.table(
        "candidate_profiles",
        sa.column("id", sa.Uuid()),
        sa.column("user_id", sa.Uuid()),
        sa.column("onboarding_step", sa.Integer()),
        sa.column("onboarding_completed", sa.Boolean()),
        sa.column("onboarding_completed_at", sa.DateTime()),
    )
    completed_at = datetime.now(timezone.utc).replace(tzinfo=None)
    bind.execute(
        candidate_profiles.insert(),
        [
            {
                "id": uuid4(),
                "user_id": user_id,
                "onboarding_step": 7,
                "onboarding_completed": True,
                "onboarding_completed_at": completed_at,
            }
            for user_id in missing_candidate_ids
        ],
    )


def downgrade() -> None:
    # This is a data repair. Removing repaired profiles could delete user data
    # added after the migration, so downgrade intentionally preserves them.
    pass
