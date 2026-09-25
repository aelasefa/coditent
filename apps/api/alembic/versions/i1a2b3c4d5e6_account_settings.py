"""add verified email-change state

Revision ID: i1a2b3c4d5e6
Revises: h1a2b3c4d5e6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "i1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "h1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("pending_email", sa.String(), nullable=True))
    op.add_column("users", sa.Column("pending_email_otp_hash", sa.String(length=64), nullable=True))
    op.add_column("users", sa.Column("pending_email_expires_at", sa.DateTime(), nullable=True))
    op.add_column("users", sa.Column("pending_email_attempts", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    op.drop_column("users", "pending_email_attempts")
    op.drop_column("users", "pending_email_expires_at")
    op.drop_column("users", "pending_email_otp_hash")
    op.drop_column("users", "pending_email")
