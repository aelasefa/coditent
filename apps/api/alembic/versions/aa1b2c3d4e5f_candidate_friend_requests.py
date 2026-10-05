"""replace directed friends with durable candidate friend requests

Revision ID: aa1b2c3d4e5f
Revises: z1a2b3c4d5e6
Create Date: 2026-10-05 21:30:00.000000
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "aa1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "z1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _create_friendships() -> None:
    op.create_table(
        "friendships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("requester_id", sa.Uuid(), nullable=False),
        sa.Column("addressee_id", sa.Uuid(), nullable=False),
        sa.Column("pair_low_id", sa.Uuid(), nullable=False),
        sa.Column("pair_high_id", sa.Uuid(), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="PENDING"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("requester_id <> addressee_id", name="ck_friendships_not_self"),
        sa.CheckConstraint("pair_low_id <> pair_high_id", name="ck_friendships_pair_not_self"),
        sa.CheckConstraint(
            "status IN ('PENDING', 'ACCEPTED', 'BLOCKED')",
            name="ck_friendships_status",
        ),
        sa.ForeignKeyConstraint(["requester_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["addressee_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pair_low_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["pair_high_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "pair_low_id", "pair_high_id", name="uq_friendships_unordered_pair"
        ),
    )
    op.create_index(
        "ix_friendships_requester_status", "friendships", ["requester_id", "status"]
    )
    op.create_index(
        "ix_friendships_addressee_status", "friendships", ["addressee_id", "status"]
    )
    op.create_index(
        "ix_friendships_pair", "friendships", ["pair_low_id", "pair_high_id"]
    )


def upgrade() -> None:
    # The current table stores accepted friendships as two directed rows.
    # Rename it, create the new request-aware shape, and collapse both
    # directions into one deterministic unordered pair without touching chat
    # history or user rows.
    op.rename_table("friendships", "friendships_legacy")
    op.drop_index("ix_friendships_user_id", table_name="friendships_legacy")
    op.drop_index("ix_friendships_friend_id", table_name="friendships_legacy")
    _create_friendships()
    op.execute(
        """
        INSERT INTO friendships (
            id, requester_id, addressee_id, pair_low_id, pair_high_id,
            status, created_at, updated_at, responded_at
        )
        SELECT DISTINCT ON (
            LEAST(user_id, friend_id), GREATEST(user_id, friend_id)
        )
            id,
            user_id,
            friend_id,
            LEAST(user_id, friend_id),
            GREATEST(user_id, friend_id),
            'ACCEPTED',
            created_at,
            created_at,
            created_at
        FROM friendships_legacy
        WHERE user_id <> friend_id
        ORDER BY LEAST(user_id, friend_id), GREATEST(user_id, friend_id), created_at, id
        """
    )
    op.drop_table("friendships_legacy")


def downgrade() -> None:
    op.rename_table("friendships", "friendships_request_state")
    op.drop_index("ix_friendships_pair", table_name="friendships_request_state")
    op.drop_index("ix_friendships_addressee_status", table_name="friendships_request_state")
    op.drop_index("ix_friendships_requester_status", table_name="friendships_request_state")
    op.create_table(
        "friendships",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("friend_id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("user_id <> friend_id", name="ck_friendships_not_self"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["friend_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "friend_id", name="uq_friendships_pair"),
    )
    op.create_index("ix_friendships_user_id", "friendships", ["user_id"])
    op.create_index("ix_friendships_friend_id", "friendships", ["friend_id"])
    op.execute(
        """
        INSERT INTO friendships (id, user_id, friend_id, created_at)
        SELECT id, requester_id, addressee_id, created_at
        FROM friendships_request_state
        WHERE status = 'ACCEPTED'
        """
    )
    op.execute(
        """
        INSERT INTO friendships (id, user_id, friend_id, created_at)
        SELECT md5(id::text || chr(58) || 'reverse')::uuid, addressee_id, requester_id, created_at
        FROM friendships_request_state
        WHERE status = 'ACCEPTED'
        """
    )
    op.drop_table("friendships_request_state")
