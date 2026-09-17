"""add persistent candidate onboarding state

Revision ID: c7d8e9f0a1b2
Revises: b4e7f2a9c1d3
Create Date: 2026-09-17 00:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c7d8e9f0a1b2"
down_revision: Union[str, Sequence[str], None] = "b4e7f2a9c1d3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("candidate_profiles", sa.Column("search_timeline", sa.String(length=40), nullable=True))
    op.add_column("candidate_profiles", sa.Column("desired_fields", sa.Text(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("preferred_work_mode", sa.String(length=30), nullable=True))
    op.add_column("candidate_profiles", sa.Column("career_stage", sa.String(length=30), nullable=True))
    op.add_column("candidate_profiles", sa.Column("onboarding_step", sa.Integer(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("onboarding_completed", sa.Boolean(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("onboarding_completed_at", sa.DateTime(), nullable=True))

    # Existing candidates retain access. Profiles created after this migration use
    # the model/default values below and must complete onboarding.
    op.execute(
        "UPDATE candidate_profiles SET onboarding_step = 7, onboarding_completed = true, "
        "onboarding_completed_at = CURRENT_TIMESTAMP"
    )
    op.alter_column("candidate_profiles", "onboarding_step", nullable=False, server_default="1")
    op.alter_column("candidate_profiles", "onboarding_completed", nullable=False, server_default=sa.false())


def downgrade() -> None:
    op.drop_column("candidate_profiles", "onboarding_completed_at")
    op.drop_column("candidate_profiles", "onboarding_completed")
    op.drop_column("candidate_profiles", "onboarding_step")
    op.drop_column("candidate_profiles", "career_stage")
    op.drop_column("candidate_profiles", "preferred_work_mode")
    op.drop_column("candidate_profiles", "desired_fields")
    op.drop_column("candidate_profiles", "search_timeline")
