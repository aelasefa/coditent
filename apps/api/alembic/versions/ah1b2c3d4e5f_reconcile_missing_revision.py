"""Recognize the orphaned revision recorded by the shared database.

Revision ID: ah1b2c3d4e5f
Revises: ag1b2c3d4e5f

The original migration file is absent from every available repository ref and
local Git object.  Before adding this compatibility marker, the shared database
was inspected read-only: its version marker is ah1b2c3d4e5f and all three
partial unique indexes introduced by ag1b2c3d4e5f are present.

This marker deliberately performs no schema or data operations.  It makes the
existing database version resolvable without stamping it backwards, replaying
already-applied migrations, or weakening the constraints added by the known
predecessor.  Fresh databases still apply the complete known chain through
ag1b2c3d4e5f before reaching this marker.
"""

revision = "ah1b2c3d4e5f"
down_revision = "ag1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
