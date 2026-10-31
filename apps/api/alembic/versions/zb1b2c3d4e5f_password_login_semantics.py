"""Track whether a user has a usable local password.

Revision ID: zb1b2c3d4e5f
Revises: za1b2c3d4e5f
"""

from alembic import op
import sqlalchemy as sa


revision = "zb1b2c3d4e5f"
down_revision = "za1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "password_login_enabled",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true(),
        ),
    )
    # Legacy OAuth registrations used an unknowable random password. Mark
    # accounts carrying only the legacy provider fields conservatively. Users
    # can establish a local password through the existing recovery flow.
    op.execute(
        """
        UPDATE users
        SET password_login_enabled = FALSE
        WHERE oauth_provider IS NOT NULL
          AND oauth_id IS NOT NULL
        """
    )


def downgrade() -> None:
    op.drop_column("users", "password_login_enabled")
