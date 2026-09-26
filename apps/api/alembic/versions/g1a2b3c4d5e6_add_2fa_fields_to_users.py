"""add 2fa fields to users

Revision ID: g1a2b3c4d5e6
Revises: f9e1d2c3b4a5
Create Date: 2026-09-24 07:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "g1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "f9e1d2c3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("is_2fa_enabled", sa.Boolean(), nullable=False, server_default=sa.text("false")))
    op.add_column("users", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("backup_codes", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "backup_codes")
    op.drop_column("users", "totp_secret")
    op.drop_column("users", "is_2fa_enabled")
