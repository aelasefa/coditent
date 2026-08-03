"""add applications table

Revision ID: f0a1b2c3d4e5
Revises: d8a1b2c3e4f5
Create Date: 2026-05-09 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "f0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "d8a1b2c3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "applications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("candidate_id", sa.UUID(), nullable=False),
        sa.Column("offer_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "PENDING",
                "REVIEWED",
                "ACCEPTED",
                "REJECTED",
                "WITHDRAWN",
                name="applicationstatus",
            ),
            nullable=False,
        ),
        sa.Column("cover_letter", sa.Text(), nullable=True),
        sa.Column("recruiter_note", sa.Text(), nullable=True),
        sa.Column("applied_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["offer_id"], ["offers.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "candidate_id",
            "offer_id",
            name="uq_applications_candidate_offer",
        ),
    )
    op.create_index(
        "ix_applications_candidate_id",
        "applications",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        "ix_applications_offer_id",
        "applications",
        ["offer_id"],
        unique=False,
    )
    op.create_index(
        "ix_applications_status",
        "applications",
        ["status"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_applications_status", table_name="applications")
    op.drop_index("ix_applications_offer_id", table_name="applications")
    op.drop_index("ix_applications_candidate_id", table_name="applications")
    op.drop_table("applications")
    op.execute("DROP TYPE IF EXISTS applicationstatus")
