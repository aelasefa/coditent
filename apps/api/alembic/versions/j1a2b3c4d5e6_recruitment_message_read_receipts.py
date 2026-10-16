"""add persistent message read receipts

Revision ID: j1a2b3c4d5e6
Revises: i1a2b3c4d5e6
Create Date: 2026-09-29 00:00:00.000000
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "j1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "i1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("read_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_chat_messages_recruitment_unread",
        "chat_messages",
        ["application_id", "receiver_id", "read_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_recruitment_unread", table_name="chat_messages")
    op.drop_column("chat_messages", "read_at")
