"""add friendships and last_seen

Revision ID: f9e1d2c3b4a5
Revises: d8a1b2c3e4f5
Create Date: 2026-08-29 19:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f9e1d2c3b4a5"
down_revision: Union[str, Sequence[str], None] = "d8a1b2c3e4f5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("users", sa.Column("last_seen", sa.DateTime(), nullable=True))
    op.create_table(
        "friendships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("friend_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["friend_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "friend_id", name="uq_friendships_pair"),
    )
    op.create_index("ix_friendships_friend_id", "friendships", ["friend_id"])
    op.create_index("ix_friendships_user_id", "friendships", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_friendships_user_id", table_name="friendships")
    op.drop_index("ix_friendships_friend_id", table_name="friendships")
    op.drop_table("friendships")
    op.drop_column("users", "last_seen")
