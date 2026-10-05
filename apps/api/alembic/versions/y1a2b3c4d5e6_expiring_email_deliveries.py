"""add expiry to transactional email deliveries

Revision ID: y1a2b3c4d5e6
Revises: x1a2b3c4d5e6
Create Date: 2026-10-03 19:20:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "y1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "x1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("email_deliveries", sa.Column("expires_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("email_deliveries", "expires_at")
