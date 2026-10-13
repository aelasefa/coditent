"""Recognize the orphaned revision already recorded by an existing database.

Revision ID: ac1b2c3d4e5f
Revises: ab1b2c3d4e5f

The original migration file could not be recovered from repository history.
Before adding this compatibility marker, the live schema was compared with a
fresh PostgreSQL database upgraded through ab1b2c3d4e5f: all 27 application
tables and required columns exist, with matching indexes and check constraints.
Observed legacy differences (user-deletion foreign-key actions, nullable offer
recruiter_id, and a retained totp_secret column) are deliberately left intact.

This is NOT a reconstruction of unknown historical DDL. Neither direction
changes application schema or data. It preserves the existing version marker
without stamping the database backwards or replaying already-applied migrations.
New databases continue to receive the complete known predecessor chain.
"""

revision = "ac1b2c3d4e5f"
down_revision = "ab1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
