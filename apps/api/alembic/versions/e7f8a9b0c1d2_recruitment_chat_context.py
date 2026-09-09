"""add responsible_hr to offers + application context to chat_messages

Revision ID: e7f8a9b0c1d2
Revises: d5e6f7a8b9c0
Create Date: 2026-09-06 00:00:00.000000

- offers.responsible_hr_id (nullable FK users.id): the recruiter responsible
  for THIS offer's pipeline. Backfilled from created_by/recruiter_id so
  pre-existing offers keep a well-defined recruiter.
- chat_messages.application_id (nullable FK applications.id, CASCADE):
  recruitment context. NULL preserves existing general-chat rows.
"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "e7f8a9b0c1d2"
down_revision: Union[str, Sequence[str], None] = "d5e6f7a8b9c0"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("offers", sa.Column("responsible_hr_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_offers_responsible_hr_id", "offers", "users", ["responsible_hr_id"], ["id"]
    )
    op.create_index("ix_offers_responsible_hr_id", "offers", ["responsible_hr_id"])
    # Backfill: creator is the best-known recruiter for existing offers.
    op.execute(
        "UPDATE offers SET responsible_hr_id = COALESCE(created_by, recruiter_id) "
        "WHERE responsible_hr_id IS NULL"
    )

    op.add_column("chat_messages", sa.Column("application_id", sa.Uuid(), nullable=True))
    op.create_foreign_key(
        "fk_chat_messages_application_id",
        "chat_messages",
        "applications",
        ["application_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        "ix_chat_messages_application_id", "chat_messages", ["application_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_chat_messages_application_id", table_name="chat_messages")
    op.drop_constraint(
        "fk_chat_messages_application_id", "chat_messages", type_="foreignkey"
    )
    op.drop_column("chat_messages", "application_id")
    op.drop_index("ix_offers_responsible_hr_id", table_name="offers")
    op.drop_constraint("fk_offers_responsible_hr_id", "offers", type_="foreignkey")
    op.drop_column("offers", "responsible_hr_id")
