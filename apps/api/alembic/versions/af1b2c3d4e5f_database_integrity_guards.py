"""align metadata and enforce remaining database integrity guards

Revision ID: af1b2c3d4e5f
Revises: ae1b2c3d4e5f
Create Date: 2026-10-15 00:00:00.000000

"""

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op


revision: str = "af1b2c3d4e5f"
down_revision: Union[str, Sequence[str], None] = "ae1b2c3d4e5f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Old tests and legacy admin flows could leave a role without its company.
    # Such users already have no membership access; normalize the incomplete
    # pair before enforcing the invariant for future writes.
    op.execute(
        "UPDATE users SET company_role = NULL "
        "WHERE company_id IS NULL AND company_role IS NOT NULL"
    )
    op.execute(
        "UPDATE users SET company_role = 'RECRUITER' "
        "WHERE company_id IS NOT NULL AND company_role IS NULL"
    )
    op.execute("UPDATE users SET auth_version = 0 WHERE auth_version < 0")
    op.execute(
        "UPDATE users SET pending_email_attempts = 0 "
        "WHERE pending_email_attempts < 0"
    )
    op.create_check_constraint(
        "ck_users_auth_version", "users", "auth_version >= 0"
    )
    op.create_check_constraint(
        "ck_users_pending_email_attempts",
        "users",
        "pending_email_attempts >= 0",
    )
    op.execute(
        "UPDATE users SET pending_email = NULL, pending_email_otp_hash = NULL, "
        "pending_email_expires_at = NULL, pending_email_attempts = 0 "
        "WHERE (pending_email IS NULL OR pending_email_otp_hash IS NULL "
        "OR pending_email_expires_at IS NULL) "
        "AND NOT (pending_email IS NULL AND pending_email_otp_hash IS NULL "
        "AND pending_email_expires_at IS NULL)"
    )
    op.create_check_constraint(
        "ck_users_pending_email_bundle",
        "users",
        "(pending_email IS NULL AND pending_email_otp_hash IS NULL "
        "AND pending_email_expires_at IS NULL) OR "
        "(pending_email IS NOT NULL AND pending_email_otp_hash IS NOT NULL "
        "AND pending_email_expires_at IS NOT NULL)",
    )
    op.create_check_constraint(
        "ck_users_company_membership_pair",
        "users",
        "(company_id IS NULL) = (company_role IS NULL)",
    )
    op.create_check_constraint(
        "ck_users_company_role",
        "users",
        "company_role IS NULL OR company_role IN "
        "('OWNER', 'ADMIN', 'HR', 'RECRUITER', 'HIRING_MANAGER')",
    )

    op.execute(
        "UPDATE candidate_profiles SET onboarding_step = "
        "LEAST(7, GREATEST(1, onboarding_step)) "
        "WHERE onboarding_step NOT BETWEEN 1 AND 7"
    )
    op.execute(
        "UPDATE candidate_profiles SET overall_score = NULL "
        "WHERE overall_score IS NOT NULL AND overall_score NOT BETWEEN 0 AND 100"
    )
    op.create_check_constraint(
        "ck_candidate_profiles_onboarding_step",
        "candidate_profiles",
        "onboarding_step BETWEEN 1 AND 7",
    )
    op.create_check_constraint(
        "ck_candidate_profiles_overall_score",
        "candidate_profiles",
        "overall_score IS NULL OR overall_score BETWEEN 0 AND 100",
    )

    op.execute("UPDATE offers SET salary_min = NULL WHERE salary_min < 0")
    op.execute("UPDATE offers SET salary_max = NULL WHERE salary_max < 0")
    op.execute(
        "UPDATE offers SET salary_max = salary_min "
        "WHERE salary_min IS NOT NULL AND salary_max IS NOT NULL "
        "AND salary_min > salary_max"
    )
    op.create_check_constraint(
        "ck_offers_salary_min", "offers", "salary_min IS NULL OR salary_min >= 0"
    )
    op.create_check_constraint(
        "ck_offers_salary_max", "offers", "salary_max IS NULL OR salary_max >= 0"
    )
    # Recommendations are derived data owned by an offer. Deleting an offer
    # with no retained application history must delete these rows atomically.
    op.drop_constraint(
        "saved_recommendations_offer_id_fkey",
        "saved_recommendations",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "fk_saved_recommendations_offer_id",
        "saved_recommendations",
        "offers",
        ["offer_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.execute(
        "UPDATE saved_recommendations SET updated_at = COALESCE(updated_at, created_at, now())"
    )
    op.execute(
        "UPDATE saved_recommendations SET ai_score = "
        "LEAST(100, GREATEST(0, ai_score)) "
        "WHERE ai_score NOT BETWEEN 0 AND 100"
    )
    op.alter_column(
        "saved_recommendations",
        "updated_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )
    op.create_check_constraint(
        "ck_saved_recommendations_ai_score",
        "saved_recommendations",
        "ai_score BETWEEN 0 AND 100",
    )
    op.execute(
        "UPDATE saved_recommendations SET status = 'failed' "
        "WHERE status NOT IN ('pending', 'processing', 'completed', 'failed')"
    )
    op.create_check_constraint(
        "ck_saved_recommendations_status",
        "saved_recommendations",
        "status IN ('pending', 'processing', 'completed', 'failed')",
    )

    op.execute(
        "UPDATE applications SET updated_at = COALESCE(updated_at, created_at, now())"
    )
    op.execute(
        "UPDATE applications SET ai_score = NULL "
        "WHERE ai_score IS NOT NULL AND ai_score NOT BETWEEN 0 AND 100"
    )
    op.alter_column(
        "applications",
        "updated_at",
        existing_type=sa.DateTime(),
        nullable=False,
    )
    op.create_check_constraint(
        "ck_applications_ai_score",
        "applications",
        "ai_score IS NULL OR ai_score BETWEEN 0 AND 100",
    )
    op.execute(
        "UPDATE applications SET status = 'applied' "
        "WHERE status NOT IN ('applied', 'under_review', 'shortlisted', "
        "'interview', 'accepted', 'rejected')"
    )
    op.execute(
        "UPDATE applications SET ai_status = 'failed' "
        "WHERE ai_status NOT IN ('pending', 'processing', 'completed', 'failed')"
    )
    op.create_check_constraint(
        "ck_applications_status",
        "applications",
        "status IN ('applied', 'under_review', 'shortlisted', 'interview', "
        "'accepted', 'rejected')",
    )
    op.create_check_constraint(
        "ck_applications_ai_status",
        "applications",
        "ai_status IN ('pending', 'processing', 'completed', 'failed')",
    )

    # Friendship lookups assume a canonical low/high pair. Unequal-but-reversed
    # rows would bypass the unordered-pair uniqueness constraint.
    op.execute(
        """
        WITH ranked AS (
            SELECT id,
                   row_number() OVER (
                       PARTITION BY LEAST(pair_low_id, pair_high_id),
                                    GREATEST(pair_low_id, pair_high_id)
                       ORDER BY CASE status
                                    WHEN 'BLOCKED' THEN 1
                                    WHEN 'ACCEPTED' THEN 2
                                    ELSE 3
                                END,
                                created_at,
                                id
                   ) AS row_number
            FROM friendships
        )
        DELETE FROM friendships AS friendship
        USING ranked
        WHERE friendship.id = ranked.id AND ranked.row_number > 1
        """
    )
    op.execute(
        "UPDATE friendships SET pair_low_id = LEAST(pair_low_id, pair_high_id), "
        "pair_high_id = GREATEST(pair_low_id, pair_high_id) "
        "WHERE pair_low_id > pair_high_id"
    )
    op.create_check_constraint(
        "ck_friendships_pair_ordered",
        "friendships",
        "pair_low_id < pair_high_id",
    )

    op.execute(
        "UPDATE pending_registrations SET otp_attempts = 0 WHERE otp_attempts < 0"
    )
    op.create_check_constraint(
        "ck_pending_registrations_otp_attempts",
        "pending_registrations",
        "otp_attempts >= 0",
    )
    op.create_check_constraint(
        "ck_company_invitations_status",
        "company_invitations",
        "status IN ('pending', 'accepted', 'expired', 'revoked')",
    )
    op.create_check_constraint(
        "ck_employee_invitations_status",
        "employee_invitations",
        "status IN ('pending', 'accepted', 'expired', 'revoked')",
    )
    op.create_check_constraint(
        "ck_employee_invitations_role",
        "employee_invitations",
        "role IN ('ADMIN', 'HR', 'RECRUITER', 'HIRING_MANAGER')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_employee_invitations_role", "employee_invitations", type_="check"
    )
    op.drop_constraint(
        "ck_employee_invitations_status", "employee_invitations", type_="check"
    )
    op.drop_constraint(
        "ck_company_invitations_status", "company_invitations", type_="check"
    )
    op.drop_constraint(
        "ck_pending_registrations_otp_attempts",
        "pending_registrations",
        type_="check",
    )
    op.drop_constraint(
        "ck_friendships_pair_ordered", "friendships", type_="check"
    )
    op.execute(
        "ALTER TABLE applications DROP CONSTRAINT IF EXISTS ck_applications_ai_status"
    )
    op.execute(
        "ALTER TABLE applications DROP CONSTRAINT IF EXISTS ck_applications_status"
    )
    op.drop_constraint("ck_applications_ai_score", "applications", type_="check")
    op.alter_column(
        "applications",
        "updated_at",
        existing_type=sa.DateTime(),
        nullable=True,
    )
    op.execute(
        "ALTER TABLE saved_recommendations "
        "DROP CONSTRAINT IF EXISTS ck_saved_recommendations_status"
    )
    op.drop_constraint(
        "ck_saved_recommendations_ai_score",
        "saved_recommendations",
        type_="check",
    )
    op.alter_column(
        "saved_recommendations",
        "updated_at",
        existing_type=sa.DateTime(),
        nullable=True,
    )
    op.drop_constraint(
        "fk_saved_recommendations_offer_id",
        "saved_recommendations",
        type_="foreignkey",
    )
    op.create_foreign_key(
        "saved_recommendations_offer_id_fkey",
        "saved_recommendations",
        "offers",
        ["offer_id"],
        ["id"],
    )
    op.drop_constraint("ck_offers_salary_max", "offers", type_="check")
    op.drop_constraint("ck_offers_salary_min", "offers", type_="check")
    op.drop_constraint(
        "ck_candidate_profiles_overall_score", "candidate_profiles", type_="check"
    )
    op.drop_constraint(
        "ck_candidate_profiles_onboarding_step",
        "candidate_profiles",
        type_="check",
    )
    op.drop_constraint("ck_users_company_role", "users", type_="check")
    op.drop_constraint(
        "ck_users_company_membership_pair", "users", type_="check"
    )
    op.drop_constraint(
        "ck_users_pending_email_attempts", "users", type_="check"
    )
    op.execute(
        "ALTER TABLE users DROP CONSTRAINT IF EXISTS ck_users_pending_email_bundle"
    )
    op.drop_constraint("ck_users_auth_version", "users", type_="check")
