"""add retry-safe interview chat events

Revision ID: za1b2c3d4e5f
Revises: ai1b2c3d4e5f
"""
from alembic import op
import sqlalchemy as sa

revision = "za1b2c3d4e5f"
down_revision = "ai1b2c3d4e5f"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("chat_messages", sa.Column("message_kind", sa.String(32), nullable=False, server_default="human"))
    op.add_column("chat_messages", sa.Column("event_key", sa.String(255), nullable=True))
    op.create_unique_constraint("uq_chat_messages_event_key", "chat_messages", ["event_key"])
    op.add_column("applications", sa.Column("interview_timezone", sa.String(100), nullable=True))
    op.add_column("applications", sa.Column("interview_meeting_link", sa.String(2048), nullable=True))
    op.add_column("applications", sa.Column("interview_location", sa.String(500), nullable=True))
    op.add_column("applications", sa.Column("interview_status", sa.String(20), nullable=True))

def downgrade() -> None:
    for column in ("interview_status", "interview_location", "interview_meeting_link", "interview_timezone"):
        op.drop_column("applications", column)
    op.drop_constraint("uq_chat_messages_event_key", "chat_messages", type_="unique")
    op.drop_column("chat_messages", "event_key")
    op.drop_column("chat_messages", "message_kind")
