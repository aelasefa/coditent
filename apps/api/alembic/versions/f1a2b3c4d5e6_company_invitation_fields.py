"""add contact fields + revoked_at to company_invitations

Revision ID: f1a2b3c4d5e6
Revises: e7f8a9b0c1d2
Create Date: 2026-09-14 00:00:00.000000

Why:
- Admin company invitations need contact person context shown in UI.
- Revocation timestamp supports audit and honest status display.
- Nullable: existing rows keep working.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "e7f8a9b0c1d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("company_invitations", sa.Column("contact_name", sa.String(), nullable=True))
    op.add_column("company_invitations", sa.Column("contact_role", sa.String(), nullable=True))
    op.add_column("company_invitations", sa.Column("revoked_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("company_invitations", "revoked_at")
    op.drop_column("company_invitations", "contact_role")
    op.drop_column("company_invitations", "contact_name")
