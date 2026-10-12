"""Keep a database default for active user accounts.

Revision ID: ac1b2c3d4e5f
Revises: ab1b2c3d4e5f
Create Date: 2026-10-11 12:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "ac1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "ab1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep this default in PostgreSQL as well as in the ORM. This makes user
    # creation safe during rolling deployments and for trusted SQL clients
    # that omit the newly introduced column.
    op.alter_column(
        "users",
        "is_active",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=sa.true(),
    )


def downgrade() -> None:
    op.alter_column(
        "users",
        "is_active",
        existing_type=sa.Boolean(),
        nullable=False,
        server_default=None,
    )
