"""remove the assessment product and pipeline stages

Revision ID: z1a2b3c4d5e6
Revises: y1a2b3c4d5e6
Create Date: 2026-10-05 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "z1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "y1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Preserve applications that were parked in a removed stage by moving them
    # to the closest surviving recruiter-controlled stage.
    op.execute(
        "UPDATE applications SET status = 'shortlisted', "
        "stage_version = stage_version + 1, status_changed_at = CURRENT_TIMESTAMP "
        "WHERE status IN ('assessment_required', 'assessment_completed')"
    )
    op.execute("DELETE FROM ai_jobs WHERE kind = 'assessment_grade'")
    op.execute("DELETE FROM notifications WHERE category = 'assessment'")

    op.drop_constraint("ck_notifications_category", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_category",
        "notifications",
        "category IN ('application', 'interview', 'message', 'system')",
    )
    op.drop_column("notification_preferences", "assessment_updates")
    op.drop_table("assessments")


def downgrade() -> None:
    op.create_table(
        "assessments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="assigned"),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("report", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("rubric", sa.Text(), nullable=False, server_default="[]"),
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("due_at", sa.DateTime(), nullable=True),
        sa.Column("submission_text", sa.Text(), nullable=True),
        sa.Column("submitted_at", sa.DateTime(), nullable=True),
        sa.Column("grading_status", sa.String(20), nullable=False, server_default="not_started"),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.Uuid(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "max_score BETWEEN 1 AND 100 AND (score IS NULL OR score BETWEEN 0 AND max_score)",
            name="ck_assessments_score_bounds",
        ),
        sa.CheckConstraint("version >= 1", name="ck_assessments_version"),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.ForeignKeyConstraint(["reviewed_by"], ["users.id"], name="fk_assessments_reviewed_by", ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assessments_application_id", "assessments", ["application_id"])
    op.create_index("ix_assessments_candidate_id", "assessments", ["candidate_id"])
    op.add_column(
        "notification_preferences",
        sa.Column("assessment_updates", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.drop_constraint("ck_notifications_category", "notifications", type_="check")
    op.create_check_constraint(
        "ck_notifications_category",
        "notifications",
        "category IN ('application', 'assessment', 'interview', 'message', 'system')",
    )
