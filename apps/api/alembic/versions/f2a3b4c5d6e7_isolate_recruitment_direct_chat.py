"""isolate recruitment vs direct chat + canonical per-application conversation

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-09-18 00:00:00.000000

Why:
- Recruitment messages (chat_messages.application_id NOT NULL) were leaking
  into the direct/general inbox (GET /chat/conversations, GET /chat/with/{id}),
  so the same peer appeared twice with the same preview ("ccc"): once as
  "Oracle · Interview" recruitment entry, once as "Career connection" direct
  entry. The fix is query isolation (application_id IS NULL for direct), plus
  indexes documenting the split.
- Exactly ONE recruitment conversation per application_id: the application row
  itself is the conversation identity (no separate conversation table). This
  migration adds a composite index for canonical per-application ordering and
  a partial index for direct-only lookups. It intentionally does NOT add
  UNIQUE(application_id) on chat_messages — one conversation HOLDS MANY
  messages; uniqueness lives on applications.id (PK) + dedupe by
  application_id in list_recruitment_chats.
- Data cleanup: no row deletion required. Pre-existing recruitment messages
  stay attached to their application_id with timestamps/senders preserved;
  they simply stop appearing in the direct inbox after the backend filter.
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "f2a3b4c5d6e7"
down_revision: Union[str, Sequence[str], None] = "e1f2a3b4c5d6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _index_exists(table: str, index: str) -> bool:
    from sqlalchemy import inspect

    bind = op.get_bind()
    return any(i["name"] == index for i in inspect(bind).get_indexes(table))


def upgrade() -> None:
    if not _index_exists("chat_messages", "ix_chat_messages_application_created"):
        op.create_index(
            "ix_chat_messages_application_created",
            "chat_messages",
            ["application_id", "created_at"],
        )
    if not _index_exists("chat_messages", "ix_chat_messages_direct_pair"):
        # Partial index: direct/general messages only.
        op.execute(
            sa.text(
                "CREATE INDEX IF NOT EXISTS ix_chat_messages_direct_pair "
                "ON chat_messages (sender_id, receiver_id, created_at) "
                "WHERE application_id IS NULL"
            )
        )


def downgrade() -> None:
    op.execute(sa.text("DROP INDEX IF EXISTS ix_chat_messages_direct_pair"))
    op.execute(sa.text("DROP INDEX IF EXISTS ix_chat_messages_application_created"))
