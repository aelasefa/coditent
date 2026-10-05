"""add evidence-backed practice missions

Revision ID: o1a2b3c4d5e6
Revises: n1a2b3c4d5e6
Create Date: 2026-10-02 14:35:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "o1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "n1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "practice_missions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("field", sa.String(length=120), nullable=False),
        sa.Column("level", sa.String(length=30), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("evidence_prompt", sa.Text(), nullable=False),
        sa.Column("skills", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_by", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.CheckConstraint(
            "level IN ('beginner', 'intermediate', 'advanced')",
            name="ck_practice_missions_level",
        ),
    )
    op.create_index(
        "ix_practice_missions_field_level",
        "practice_missions",
        ["field", "level", "active"],
    )
    op.create_table(
        "mission_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("mission_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("attempt_number", sa.Integer(), nullable=False),
        sa.Column("evidence", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="submitted"),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("validated_skills", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("attempt_number BETWEEN 1 AND 5", name="ck_mission_attempt_number"),
        sa.CheckConstraint("score IS NULL OR score BETWEEN 0 AND 100", name="ck_mission_attempt_score"),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["mission_id"], ["practice_missions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "mission_id", "candidate_id", "attempt_number",
            name="uq_mission_attempt_number",
        ),
    )
    op.create_index(
        "ix_mission_attempts_candidate", "mission_attempts", ["candidate_id", "created_at"]
    )
    op.create_index(
        "ix_mission_attempts_mission", "mission_attempts", ["mission_id", "candidate_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_mission_attempts_mission", table_name="mission_attempts")
    op.drop_index("ix_mission_attempts_candidate", table_name="mission_attempts")
    op.drop_table("mission_attempts")
    op.drop_index("ix_practice_missions_field_level", table_name="practice_missions")
    op.drop_table("practice_missions")
