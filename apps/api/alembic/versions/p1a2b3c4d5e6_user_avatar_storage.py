"""store owner-scoped user avatar objects

Revision ID: p1a2b3c4d5e6
Revises: o1a2b3c4d5e6
Create Date: 2026-10-02 15:00:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "p1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "o1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_storage_path", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_storage_path")
