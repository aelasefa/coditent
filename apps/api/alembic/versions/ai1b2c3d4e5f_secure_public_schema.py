"""secure the public schema and remove duplicate indexes

Revision ID: ai1b2c3d4e5f
Revises: ah1b2c3d4e5f
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "ai1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "ah1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Coditent never queries application tables from a browser Supabase client.
# FastAPI owns authorization and connects with the server-only postgres role,
# which has BYPASSRLS in Supabase. No anon/authenticated policies are needed.
APPLICATION_TABLES = (
    "account_deletion_requests",
    "admin_activity_logs",
    "ai_jobs",
    "applications",
    "candidate_profiles",
    "candidate_requests",
    "chat_messages",
    "companies",
    "company_interest_requests",
    "company_invitations",
    "cv_assets",
    "email_deliveries",
    "employee_invitations",
    "friendships",
    "institution_memberships",
    "institutions",
    "interview_feedback",
    "mission_attempts",
    "notification_preferences",
    "notifications",
    "oauth_accounts",
    "offers",
    "password_recoveries",
    "pending_registrations",
    "practice_missions",
    "revoked_sessions",
    "revoked_trusted_devices",
    "saved_recommendations",
    "support_tickets",
    "users",
)

# These tables had RLS disabled before this migration. The others were already
# protected manually in Supabase; downgrade restores that prior state exactly.
PREVIOUSLY_UNPROTECTED_TABLES = (
    "account_deletion_requests",
    "company_interest_requests",
    "cv_assets",
    "email_deliveries",
    "friendships",
    "institution_memberships",
    "institutions",
    "interview_feedback",
    "mission_attempts",
    "notification_preferences",
    "notifications",
    "oauth_accounts",
    "password_recoveries",
    "practice_missions",
    "revoked_sessions",
    "revoked_trusted_devices",
    "support_tickets",
)

DUPLICATE_INDEXES = (
    "ix_companies_name",
    "ix_company_invitations_token_hash",
    "ix_employee_invitations_token_hash",
    "ix_friendships_pair",
    "ix_pending_registrations_email",
    "ix_users_email",
)


def _quoted_table_list(tables: tuple[str, ...]) -> str:
    return ", ".join(f'public."{table}"' for table in tables)


def _existing_data_api_roles() -> tuple[str, ...]:
    """Return Supabase Data API roles present in the current database.

    Production Supabase provides both roles. CI uses plain PostgreSQL, where
    neither role exists; privilege statements naming absent roles fail the
    entire transactional migration.
    """
    rows = op.get_bind().execute(
        sa.text(
            "SELECT rolname FROM pg_roles "
            "WHERE rolname IN ('anon', 'authenticated') ORDER BY rolname"
        )
    )
    return tuple(str(role) for role in rows.scalars())


def upgrade() -> None:
    for table in APPLICATION_TABLES:
        op.execute(f'ALTER TABLE public."{table}" ENABLE ROW LEVEL SECURITY')

    # Existing Supabase projects can grant every table privilege to both Data
    # API roles. RLS is the row boundary; revoking grants is defense in depth
    # and makes the intended server-only data path explicit.
    tables = _quoted_table_list(APPLICATION_TABLES)
    data_api_roles = _existing_data_api_roles()
    if data_api_roles:
        roles = ", ".join(data_api_roles)
        op.execute(f"REVOKE ALL PRIVILEGES ON TABLE {tables} FROM {roles}")
        op.execute(
            "REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public "
            f"FROM {roles}"
        )
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"REVOKE ALL PRIVILEGES ON TABLES FROM {roles}"
        )
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"REVOKE ALL PRIVILEGES ON SEQUENCES FROM {roles}"
        )

    for index in DUPLICATE_INDEXES:
        op.execute(f'DROP INDEX IF EXISTS public."{index}"')


def downgrade() -> None:
    op.execute("CREATE INDEX ix_users_email ON public.users (email)")
    op.execute(
        "CREATE UNIQUE INDEX ix_pending_registrations_email "
        "ON public.pending_registrations (email)"
    )
    op.execute(
        "CREATE INDEX ix_friendships_pair "
        "ON public.friendships (pair_low_id, pair_high_id)"
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_employee_invitations_token_hash "
        "ON public.employee_invitations (token_hash)"
    )
    op.execute(
        "CREATE UNIQUE INDEX ix_company_invitations_token_hash "
        "ON public.company_invitations (token_hash)"
    )
    op.execute("CREATE INDEX ix_companies_name ON public.companies (name)")

    data_api_roles = _existing_data_api_roles()
    if data_api_roles:
        roles = ", ".join(data_api_roles)
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"GRANT ALL PRIVILEGES ON TABLES TO {roles}"
        )
        op.execute(
            "ALTER DEFAULT PRIVILEGES IN SCHEMA public "
            f"GRANT ALL PRIVILEGES ON SEQUENCES TO {roles}"
        )
        op.execute(
            "GRANT ALL PRIVILEGES ON TABLE "
            f"{_quoted_table_list(APPLICATION_TABLES)} TO {roles}"
        )
        op.execute(
            "GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public "
            f"TO {roles}"
        )

    for table in PREVIOUSLY_UNPROTECTED_TABLES:
        op.execute(f'ALTER TABLE public."{table}" DISABLE ROW LEVEL SECURITY')
