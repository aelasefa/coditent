"""add invitation tables for company and employee onboarding

Revision ID: d5e6f7a8b9c0
Revises: c4d5e6f7a8b9
Create Date: 2026-08-29 19:35:00.000000

Why:
- Companies cannot self-register. Platform Admin invites Company Owner via
  company_invitations (email-bound, token_hash, expires, single-use).
- Company Owner/Admin invites HR/Recruiter/Hiring Manager via
  employee_invitations (email+role+company bound).
- Tokens are stored as sha256 hash, never raw, with status lifecycle.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d5e6f7a8b9c0"
down_revision: Union[str, Sequence[str], None] = "c4d5e6f7a8b9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "company_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("company_name", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("invited_by", sa.Uuid(), nullable=True),
        sa.Column("company_id", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_company_invitations_email", "company_invitations", ["email"])
    op.create_index("ix_company_invitations_token_hash", "company_invitations", ["token_hash"], unique=True)

    op.create_table(
        "employee_invitations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("invited_by", sa.Uuid(), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("accepted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invited_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_employee_invitations_email", "employee_invitations", ["email"])
    op.create_index("ix_employee_invitations_token_hash", "employee_invitations", ["token_hash"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_employee_invitations_token_hash", table_name="employee_invitations")
    op.drop_index("ix_employee_invitations_email", table_name="employee_invitations")
    op.drop_table("employee_invitations")
    op.drop_index("ix_company_invitations_token_hash", table_name="company_invitations")
    op.drop_index("ix_company_invitations_email", table_name="company_invitations")
    op.drop_table("company_invitations")
