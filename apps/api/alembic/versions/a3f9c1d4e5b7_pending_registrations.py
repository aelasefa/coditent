"""add pending_registrations for email OTP verification

Revision ID: a3f9c1d4e5b7
Revises: f1a2b3c4d5e6
Create Date: 2026-09-14 00:00:00.000000

Why:
- Email/password signup must verify the address before any user account
  or access token exists. Pending data (hashed password + hashed OTP)
  lives here until verification succeeds, then the row is deleted and
  the real user is created atomically.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a3f9c1d4e5b7"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "pending_registrations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("full_name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("otp_hash", sa.String(), nullable=False),
        sa.Column("otp_expires_at", sa.DateTime(), nullable=False),
        sa.Column("otp_attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_otp_sent_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_pending_registrations_email", "pending_registrations", ["email"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_pending_registrations_email", table_name="pending_registrations")
    op.drop_table("pending_registrations")
