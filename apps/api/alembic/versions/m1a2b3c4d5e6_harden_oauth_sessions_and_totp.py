"""harden OAuth identities, sessions, and TOTP secrets

Revision ID: m1a2b3c4d5e6
Revises: l1a2b3c4d5e6
Create Date: 2026-10-02 00:10:00.000000
"""

from __future__ import annotations

import os
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from cryptography.fernet import Fernet, InvalidToken


revision: str = "m1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = "l1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _configured_fernet(*, required: bool) -> Fernet | None:
    value = os.environ.get("TOTP_ENCRYPTION_KEY", "").strip()
    if not value:
        if required:
            raise RuntimeError(
                "TOTP_ENCRYPTION_KEY is required to migrate existing TOTP secrets"
            )
        return None
    try:
        return Fernet(value.encode("ascii"))
    except (ValueError, UnicodeEncodeError) as exc:
        raise RuntimeError("TOTP_ENCRYPTION_KEY is not a valid Fernet key") from exc


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_version", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column("users", sa.Column("totp_secret_encrypted", sa.Text(), nullable=True))
    op.add_column("users", sa.Column("totp_last_used_step", sa.BigInteger(), nullable=True))

    connection = op.get_bind()
    plaintext_rows = connection.execute(
        sa.text("SELECT id, totp_secret FROM users WHERE totp_secret IS NOT NULL")
    ).mappings().all()
    fernet = _configured_fernet(required=bool(plaintext_rows))
    if fernet is not None:
        for row in plaintext_rows:
            encrypted = "v1:" + fernet.encrypt(row["totp_secret"].encode("utf-8")).decode("ascii")
            connection.execute(
                sa.text(
                    "UPDATE users SET totp_secret_encrypted=:encrypted WHERE id=:user_id"
                ),
                {"encrypted": encrypted, "user_id": row["id"]},
            )
    op.drop_column("users", "totp_secret")

    op.create_table(
        "oauth_accounts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("issuer", sa.String(length=255), nullable=False),
        sa.Column("email_at_link", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider", "subject", name="uq_oauth_accounts_provider_subject"
        ),
        sa.UniqueConstraint("user_id", "provider", name="uq_oauth_accounts_user_provider"),
    )
    op.create_index("ix_oauth_accounts_user_id", "oauth_accounts", ["user_id"])

    # Preserve valid legacy links. The unique constraint deliberately makes
    # ambiguous duplicate subjects fail the migration instead of silently
    # assigning an external identity to the wrong local account.
    connection.execute(
        sa.text(
            """
            INSERT INTO oauth_accounts
                (id, user_id, provider, subject, issuer, email_at_link, created_at)
            SELECT
                gen_random_uuid(), id, lower(oauth_provider), oauth_id,
                CASE lower(oauth_provider)
                    WHEN 'google' THEN 'https://accounts.google.com'
                    WHEN 'linkedin' THEN 'https://www.linkedin.com'
                    ELSE 'legacy:' || lower(oauth_provider)
                END,
                email, created_at
            FROM users
            WHERE oauth_provider IS NOT NULL
              AND oauth_id IS NOT NULL
              AND trim(oauth_provider) <> ''
              AND trim(oauth_id) <> ''
            """
        )
    )


def downgrade() -> None:
    op.add_column("users", sa.Column("totp_secret", sa.String(length=64), nullable=True))
    connection = op.get_bind()
    encrypted_rows = connection.execute(
        sa.text(
            "SELECT id, totp_secret_encrypted FROM users "
            "WHERE totp_secret_encrypted IS NOT NULL"
        )
    ).mappings().all()
    fernet = _configured_fernet(required=bool(encrypted_rows))
    if fernet is not None:
        for row in encrypted_rows:
            value = row["totp_secret_encrypted"]
            if not value.startswith("v1:"):
                raise RuntimeError("Unsupported encrypted TOTP secret version")
            try:
                plaintext = fernet.decrypt(value[3:].encode("ascii")).decode("utf-8")
            except (InvalidToken, UnicodeError) as exc:
                raise RuntimeError("Unable to decrypt an existing TOTP secret") from exc
            connection.execute(
                sa.text("UPDATE users SET totp_secret=:secret WHERE id=:user_id"),
                {"secret": plaintext, "user_id": row["id"]},
            )

    op.drop_index("ix_oauth_accounts_user_id", table_name="oauth_accounts")
    op.drop_table("oauth_accounts")
    op.drop_column("users", "totp_last_used_step")
    op.drop_column("users", "totp_secret_encrypted")
    op.drop_column("users", "auth_version")
