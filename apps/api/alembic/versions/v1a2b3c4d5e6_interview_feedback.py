"""add structured interview feedback

Revision ID: v1a2b3c4d5e6
Revises: u1a2b3c4d5e6
Create Date: 2026-10-03 14:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "v1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "u1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "interview_feedback",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("application_id", sa.UUID(), nullable=False),
        sa.Column("reviewer_id", sa.UUID(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("recommendation", sa.String(length=30), nullable=False),
        sa.Column("strengths", sa.Text(), nullable=False),
        sa.Column("concerns", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_interview_feedback_rating"),
        sa.CheckConstraint(
            "recommendation IN ('strong_no', 'no', 'neutral', 'yes', 'strong_yes')",
            name="ck_interview_feedback_recommendation",
        ),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reviewer_id"], ["users.id"], ondelete="RESTRICT"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("application_id", "reviewer_id", name="uq_interview_feedback_reviewer"),
    )
    op.create_index(
        "ix_interview_feedback_application",
        "interview_feedback",
        ["application_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_interview_feedback_application", table_name="interview_feedback")
    op.drop_table("interview_feedback")
