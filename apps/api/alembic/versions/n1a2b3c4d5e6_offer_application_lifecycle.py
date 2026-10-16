"""retain offer history and version application stages

Revision ID: n1a2b3c4d5e6
Revises: m1a2b3c4d5e6
Create Date: 2026-10-02 14:15:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "n1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "m1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _offer_application_fk_name() -> str | None:
    inspector = sa.inspect(op.get_bind())
    for foreign_key in inspector.get_foreign_keys("applications"):
        if (
            foreign_key.get("referred_table") == "offers"
            and foreign_key.get("constrained_columns") == ["opportunity_id"]
        ):
            return foreign_key.get("name")
    return None


def upgrade() -> None:
    op.add_column("offers", sa.Column("closed_at", sa.DateTime(), nullable=True))
    op.add_column("offers", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute(
        "UPDATE offers SET opportunity_status = CASE WHEN active THEN 'active' ELSE 'closed' END"
    )
    op.execute("UPDATE offers SET closed_at = posted_at WHERE active = false")
    op.execute("UPDATE offers SET updated_at = posted_at WHERE updated_at IS NULL")
    op.create_check_constraint(
        "ck_offers_opportunity_status",
        "offers",
        "opportunity_status IN ('draft', 'active', 'closed')",
    )
    op.create_check_constraint(
        "ck_offers_salary_range",
        "offers",
        "salary_min IS NULL OR salary_max IS NULL OR salary_min <= salary_max",
    )

    op.add_column(
        "applications",
        sa.Column("stage_version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column(
        "applications", sa.Column("interview_scheduled_at", sa.DateTime(), nullable=True)
    )
    op.add_column("applications", sa.Column("interview_notes", sa.Text(), nullable=True))
    op.add_column(
        "applications", sa.Column("status_changed_at", sa.DateTime(), nullable=True)
    )
    op.execute(
        "UPDATE applications SET status_changed_at = COALESCE(updated_at, created_at) "
        "WHERE status_changed_at IS NULL"
    )
    op.alter_column("applications", "status_changed_at", nullable=False)
    op.create_check_constraint(
        "ck_applications_stage_version", "applications", "stage_version >= 1"
    )

    old_fk = _offer_application_fk_name()
    if old_fk:
        op.drop_constraint(old_fk, "applications", type_="foreignkey")
    op.create_foreign_key(
        "fk_applications_opportunity_retained",
        "applications",
        "offers",
        ["opportunity_id"],
        ["id"],
        ondelete="RESTRICT",
    )

    op.add_column(
        "assessments",
        sa.Column("rubric", sa.Text(), nullable=False, server_default="[]"),
    )
    op.add_column(
        "assessments",
        sa.Column("max_score", sa.Integer(), nullable=False, server_default="100"),
    )
    op.add_column("assessments", sa.Column("due_at", sa.DateTime(), nullable=True))
    op.add_column("assessments", sa.Column("submission_text", sa.Text(), nullable=True))
    op.add_column("assessments", sa.Column("submitted_at", sa.DateTime(), nullable=True))
    op.add_column(
        "assessments",
        sa.Column(
            "grading_status", sa.String(20), nullable=False, server_default="not_started"
        ),
    )
    op.add_column("assessments", sa.Column("feedback", sa.Text(), nullable=True))
    op.add_column("assessments", sa.Column("reviewed_by", sa.Uuid(), nullable=True))
    op.add_column("assessments", sa.Column("reviewed_at", sa.DateTime(), nullable=True))
    op.add_column(
        "assessments",
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("assessments", sa.Column("updated_at", sa.DateTime(), nullable=True))
    op.execute("UPDATE assessments SET status = 'assigned' WHERE status = 'pending'")
    op.execute("UPDATE assessments SET updated_at = created_at WHERE updated_at IS NULL")
    op.alter_column("assessments", "updated_at", nullable=False)
    op.create_foreign_key(
        "fk_assessments_reviewed_by",
        "assessments",
        "users",
        ["reviewed_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_check_constraint(
        "ck_assessments_score_bounds",
        "assessments",
        "max_score BETWEEN 1 AND 100 AND (score IS NULL OR score BETWEEN 0 AND max_score)",
    )
    op.create_check_constraint(
        "ck_assessments_version", "assessments", "version >= 1"
    )
    # The historical a1b2... migration removed the original social tables on
    # the main branch. Restore them here now that friends/presence are a
    # supported product feature. This is intentionally creation, not an ALTER,
    # because both a fresh database and existing databases at revision m lack
    # these objects.
    op.add_column("users", sa.Column("last_seen", sa.DateTime(), nullable=True))
    op.create_table(
        "friendships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("friend_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("user_id <> friend_id", name="ck_friendships_not_self"),
        sa.ForeignKeyConstraint(["friend_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "friend_id", name="uq_friendships_pair"),
    )
    op.create_index("ix_friendships_friend_id", "friendships", ["friend_id"])
    op.create_index("ix_friendships_user_id", "friendships", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_friendships_user_id", table_name="friendships")
    op.drop_index("ix_friendships_friend_id", table_name="friendships")
    op.drop_table("friendships")
    op.drop_column("users", "last_seen")
    op.drop_constraint("ck_assessments_version", "assessments", type_="check")
    op.drop_constraint("ck_assessments_score_bounds", "assessments", type_="check")
    op.drop_constraint("fk_assessments_reviewed_by", "assessments", type_="foreignkey")
    op.drop_column("assessments", "updated_at")
    op.drop_column("assessments", "version")
    op.drop_column("assessments", "reviewed_at")
    op.drop_column("assessments", "reviewed_by")
    op.drop_column("assessments", "feedback")
    op.drop_column("assessments", "grading_status")
    op.drop_column("assessments", "submitted_at")
    op.drop_column("assessments", "submission_text")
    op.drop_column("assessments", "due_at")
    op.drop_column("assessments", "max_score")
    op.drop_column("assessments", "rubric")
    op.drop_constraint(
        "fk_applications_opportunity_retained", "applications", type_="foreignkey"
    )
    op.create_foreign_key(
        "applications_opportunity_id_fkey",
        "applications",
        "offers",
        ["opportunity_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.drop_constraint("ck_applications_stage_version", "applications", type_="check")
    op.drop_column("applications", "status_changed_at")
    op.drop_column("applications", "interview_notes")
    op.drop_column("applications", "interview_scheduled_at")
    op.drop_column("applications", "stage_version")
    op.drop_constraint("ck_offers_salary_range", "offers", type_="check")
    op.drop_constraint("ck_offers_opportunity_status", "offers", type_="check")
    op.drop_column("offers", "updated_at")
    op.drop_column("offers", "closed_at")
