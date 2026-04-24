"""add admin activity logs

Revision ID: c2f4a7db9012
Revises: a1c9f9c5b2f0
Create Date: 2026-04-24 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c2f4a7db9012"
down_revision: Union[str, Sequence[str], None] = "a1c9f9c5b2f0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "admin_activity_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("action", sa.String(length=80), nullable=False),
        sa.Column("admin_id", sa.UUID(), nullable=False),
        sa.Column("admin_email", sa.String(), nullable=False),
        sa.Column("target_user_id", sa.UUID(), nullable=True),
        sa.Column("target_user_email", sa.String(), nullable=True),
        sa.Column("details", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["admin_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("admin_activity_logs")
