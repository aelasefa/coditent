"""add database guards for multi-user request and invitation races

Revision ID: ag1b2c3d4e5f
Revises: af1b2c3d4e5f
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op


revision: str = "ag1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "af1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Keep the newest live row if historical data already contains duplicates.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY candidate_id, company_id
                       ORDER BY created_at DESC, id DESC
                   ) AS position
            FROM candidate_requests
            WHERE status = 'pending'
        )
        UPDATE candidate_requests AS request
        SET status = 'rejected'
        FROM ranked
        WHERE request.id = ranked.id AND ranked.position > 1
        """
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY lower(email)
                       ORDER BY created_at DESC, id DESC
                   ) AS position
            FROM company_invitations
            WHERE status = 'pending'
        )
        UPDATE company_invitations AS invitation
        SET status = 'revoked', revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
        FROM ranked
        WHERE invitation.id = ranked.id AND ranked.position > 1
        """
    )
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY company_id, lower(email)
                       ORDER BY created_at DESC, id DESC
                   ) AS position
            FROM employee_invitations
            WHERE status = 'pending'
        )
        UPDATE employee_invitations AS invitation
        SET status = 'revoked'
        FROM ranked
        WHERE invitation.id = ranked.id AND ranked.position > 1
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_candidate_requests_pending_candidate_company
        ON candidate_requests (candidate_id, company_id)
        WHERE status = 'pending'
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_company_invitations_pending_email
        ON company_invitations (lower(email))
        WHERE status = 'pending'
        """
    )
    op.execute(
        """
        CREATE UNIQUE INDEX uq_employee_invitations_pending_company_email
        ON employee_invitations (company_id, lower(email))
        WHERE status = 'pending'
        """
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS uq_employee_invitations_pending_company_email")
    op.execute("DROP INDEX IF EXISTS uq_company_invitations_pending_email")
    op.execute("DROP INDEX IF EXISTS uq_candidate_requests_pending_candidate_company")
