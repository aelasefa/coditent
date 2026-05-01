"""add oauth fields to users

Revision ID: d8a1b2c3e4f5
Revises: b7c2f1d9a3e4
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d8a1b2c3e4f5"
down_revision: Union[str, Sequence[str], None] = "b7c2f1d9a3e4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("oauth_provider", sa.String(length=30), nullable=True))
    op.add_column("users", sa.Column("oauth_id", sa.String(length=120), nullable=True))
    op.add_column("users", sa.Column("avatar_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "avatar_url")
    op.drop_column("users", "oauth_id")
    op.drop_column("users", "oauth_provider")
