"""separate platform and company roles — preserve offers

Revision ID: c4d5e6f7a8b9
Revises: b3c4d5e6f7a8
Create Date: 2026-08-29 19:30:00.000000

Why:
- User.role was CANDIDATE|RECRUITER|ADMIN. New spec requires
  PLATFORM_ADMIN vs CANDIDATE vs COMPANY_USER with company_role
  OWNER|ADMIN|HR|RECRUITER|HIRING_MANAGER. To avoid breaking
  existing 5 RECRUITER + 1 ADMIN rows and `offers`/`recommendations`
  FKs, we keep old enum values as deprecated, add new values,
  then migrate data in-place. No table rename, no FK break.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c4d5e6f7a8b9"
down_revision: Union[str, Sequence[str], None] = "b3c4d5e6f7a8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Extend PG enum in place — keeps existing rows, no table rewrite
    #    PG requires new enum values to be committed before use, so run in autocommit
    with op.get_context().autocommit_block():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN'")
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'COMPANY_USER'")

    # 2. Migrate data: ADMIN -> PLATFORM_ADMIN, RECRUITER -> COMPANY_USER
    #    Keep CANDIDATE as is.
    op.execute("UPDATE users SET role = 'PLATFORM_ADMIN' WHERE role = 'ADMIN'")
    op.execute("UPDATE users SET role = 'COMPANY_USER' WHERE role = 'RECRUITER'")

    # 3. Backfill company_role for migrated COMPANY_USER rows that had no company_role
    #    Default to RECRUITER (most common), OWNER will be set when company created
    op.execute("UPDATE users SET company_role = 'RECRUITER' WHERE role = 'COMPANY_USER' AND company_role IS NULL")

    # 4. Enforce invariant for PLATFORM_ADMIN / CANDIDATE: company_id must be NULL
    #    (not a hard DB constraint to allow transition, but clean existing)
    op.execute("UPDATE users SET company_id = NULL, company_role = NULL WHERE role = 'PLATFORM_ADMIN' OR role = 'CANDIDATE'")


def downgrade() -> None:
    # Reverse data migration — keep enum values (cannot drop PG enum values safely)
    op.execute("UPDATE users SET role = 'RECRUITER' WHERE role = 'COMPANY_USER'")
    op.execute("UPDATE users SET role = 'ADMIN' WHERE role = 'PLATFORM_ADMIN'")
    # company_role stays as String, no need to revert
