"""add admin role and recruiter approval

Revision ID: a1c9f9c5b2f0
Revises: 4f1d2c8b9a11
Create Date: 2026-04-20 00:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "a1c9f9c5b2f0"
down_revision: Union[str, Sequence[str], None] = "4f1d2c8b9a11"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'ADMIN'")

    op.add_column(
        "users",
        sa.Column("is_approved", sa.Boolean(), nullable=False, server_default=sa.true()),
    )
    op.alter_column("users", "is_approved", server_default=None)


def downgrade() -> None:
    op.drop_column("users", "is_approved")
