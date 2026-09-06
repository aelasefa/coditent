"""add companies, requests, chat; drop friendships

Revision ID: a1b2c3d4e5f6
Revises: f9e1d2c3b4a5
Create Date: 2026-08-29 19:10:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f9e1d2c3b4a5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # drop friendships
    op.drop_index("ix_friendships_user_id", table_name="friendships")
    op.drop_index("ix_friendships_friend_id", table_name="friendships")
    op.drop_table("friendships")
    op.drop_column("users", "last_seen")

    # companies
    op.create_table(
        "companies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("region", sa.String(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index("ix_companies_name", "companies", ["name"])

    # users.company_id
    op.add_column("users", sa.Column("company_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_users_company_id", "users", "companies", ["company_id"], ["id"])

    # candidate_requests
    op.create_table(
        "candidate_requests",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=False),
        sa.Column("recruiter_id", sa.Uuid(), nullable=True),
        sa.Column("message", sa.Text(), nullable=True),
        sa.Column("status", sa.Enum("pending", "accepted", "rejected", name="requeststatus"), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recruiter_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_candidate_requests_candidate_id", "candidate_requests", ["candidate_id"])
    op.create_index("ix_candidate_requests_company_id", "candidate_requests", ["company_id"])

    # chat_messages
    op.create_table(
        "chat_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("sender_id", sa.Uuid(), nullable=False),
        sa.Column("receiver_id", sa.Uuid(), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["receiver_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_chat_messages_receiver", "chat_messages", ["receiver_id"])
    op.create_index("ix_chat_messages_sender", "chat_messages", ["sender_id"])


def downgrade() -> None:
    op.drop_index("ix_chat_messages_sender", table_name="chat_messages")
    op.drop_index("ix_chat_messages_receiver", table_name="chat_messages")
    op.drop_table("chat_messages")
    op.drop_index("ix_candidate_requests_company_id", table_name="candidate_requests")
    op.drop_index("ix_candidate_requests_candidate_id", table_name="candidate_requests")
    op.drop_table("candidate_requests")
    op.drop_constraint("fk_users_company_id", "users", type_="foreignkey")
    op.drop_column("users", "company_id")
    op.drop_index("ix_companies_name", table_name="companies")
    op.drop_table("companies")
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
