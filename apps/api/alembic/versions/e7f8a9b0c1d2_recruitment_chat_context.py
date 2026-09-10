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


def _column_exists(table: str, column: str) -> bool:
    from sqlalchemy import inspect

    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns(table)]
    return column in cols


def _index_exists(table: str, index: str) -> bool:
    from sqlalchemy import inspect

    bind = op.get_bind()
    return any(i["name"] == index for i in inspect(bind).get_indexes(table))


def _fk_exists(table: str, fk: str) -> bool:
    from sqlalchemy import inspect

    bind = op.get_bind()
    return any(f["name"] == fk for f in inspect(bind).get_foreign_keys(table))


def upgrade() -> None:
    # Idempotent: this revision was partially applied out-of-band in some
    # environments (columns/FKs/indexes exist but alembic_version was left at
    # d5e6f7a8b9c0). Guard each step so `alembic upgrade head` succeeds there
    # and on fresh databases.
    if not _column_exists("offers", "responsible_hr_id"):
        op.add_column("offers", sa.Column("responsible_hr_id", sa.Uuid(), nullable=True))
    if not _fk_exists("offers", "fk_offers_responsible_hr_id"):
        op.create_foreign_key(
            "fk_offers_responsible_hr_id", "offers", "users", ["responsible_hr_id"], ["id"]
        )
    if not _index_exists("offers", "ix_offers_responsible_hr_id"):
        op.create_index("ix_offers_responsible_hr_id", "offers", ["responsible_hr_id"])
    # Backfill: creator is the best-known recruiter for existing offers.
    op.execute(
        "UPDATE offers SET responsible_hr_id = COALESCE(created_by, recruiter_id) "
        "WHERE responsible_hr_id IS NULL"
    )

    if not _column_exists("chat_messages", "application_id"):
        op.add_column("chat_messages", sa.Column("application_id", sa.Uuid(), nullable=True))
    if not _fk_exists("chat_messages", "fk_chat_messages_application_id"):
        op.create_foreign_key(
            "fk_chat_messages_application_id",
            "chat_messages",
            "applications",
            ["application_id"],
            ["id"],
            ondelete="CASCADE",
        )
    if not _index_exists("chat_messages", "ix_chat_messages_application_id"):
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
