"""enrich company, opportunity, application

Revision ID: b3c4d5e6f7a8
Revises: a1b2c3d4e5f6
Create Date: 2026-08-29 19:20:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b3c4d5e6f7a8"
down_revision: Union[str, Sequence[str], None] = "a1b2c3d4e5f6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # companies enrichment per spec §1
    op.add_column("companies", sa.Column("logo_url", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("industry", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("location", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("website", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("company_size", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("contact_email", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("contact_phone", sa.String(), nullable=True))
    op.add_column("companies", sa.Column("status", sa.String(), nullable=False, server_default="active"))
    op.add_column("companies", sa.Column("owner_id", sa.Uuid(), nullable=True))
    op.create_foreign_key("fk_companies_owner_id", "companies", "users", ["owner_id"], ["id"])

    # users.company_role per spec §2
    op.add_column("users", sa.Column("company_role", sa.String(), nullable=True))

    # offers enrichment per spec §3 — keep table name offers for compatibility
    op.add_column("offers", sa.Column("company_id", sa.Uuid(), nullable=True))
    op.add_column("offers", sa.Column("created_by", sa.Uuid(), nullable=True))
    op.add_column("offers", sa.Column("location", sa.String(), nullable=True))
    op.add_column("offers", sa.Column("work_mode", sa.String(), nullable=True))
    op.add_column("offers", sa.Column("required_skills", sa.Text(), nullable=True))
    op.add_column("offers", sa.Column("required_experience", sa.String(), nullable=True))
    op.add_column("offers", sa.Column("education_requirements", sa.String(), nullable=True))
    op.add_column("offers", sa.Column("salary_min", sa.Integer(), nullable=True))
    op.add_column("offers", sa.Column("salary_max", sa.Integer(), nullable=True))
    op.add_column("offers", sa.Column("deadline", sa.DateTime(), nullable=True))
    op.add_column("offers", sa.Column("opportunity_status", sa.String(), nullable=False, server_default="active"))
    op.create_index("ix_offers_company_id", "offers", ["company_id"])
    op.create_foreign_key("fk_offers_company_id", "offers", "companies", ["company_id"], ["id"])
    op.create_foreign_key("fk_offers_created_by", "offers", "users", ["created_by"], ["id"])

    # candidate_profiles enrichment per spec §4
    op.add_column("candidate_profiles", sa.Column("languages", sa.Text(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("cv_url", sa.String(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("desired_opportunity_type", sa.String(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("desired_location", sa.String(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("overall_score", sa.Integer(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("validated_skills", sa.Text(), nullable=True))

    # applications per spec §5
    op.create_table(
        "applications",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("opportunity_id", sa.Uuid(), nullable=False),
        sa.Column("company_id", sa.Uuid(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="applied"),
        sa.Column("cv_url", sa.String(), nullable=True),
        sa.Column("cover_letter", sa.Text(), nullable=True),
        sa.Column("ai_score", sa.Integer(), nullable=True),
        sa.Column("ai_report", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["opportunity_id"], ["offers.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["company_id"], ["companies.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("candidate_id", "opportunity_id", name="uq_applications_candidate_opportunity"),
    )
    op.create_index("ix_applications_candidate_id", "applications", ["candidate_id"])
    op.create_index("ix_applications_company_id", "applications", ["company_id"])
    op.create_index("ix_applications_opportunity_id", "applications", ["opportunity_id"])

    # assessments per spec
    op.create_table(
        "assessments",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("application_id", sa.Uuid(), nullable=False),
        sa.Column("candidate_id", sa.Uuid(), nullable=False),
        sa.Column("created_by", sa.Uuid(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending"),
        sa.Column("score", sa.Integer(), nullable=True),
        sa.Column("report", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["application_id"], ["applications.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["candidate_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assessments_application_id", "assessments", ["application_id"])
    op.create_index("ix_assessments_candidate_id", "assessments", ["candidate_id"])


def downgrade() -> None:
    op.drop_index("ix_assessments_candidate_id", table_name="assessments")
    op.drop_index("ix_assessments_application_id", table_name="assessments")
    op.drop_table("assessments")
    op.drop_index("ix_applications_opportunity_id", table_name="applications")
    op.drop_index("ix_applications_company_id", table_name="applications")
    op.drop_index("ix_applications_candidate_id", table_name="applications")
    op.drop_table("applications")
    op.drop_column("candidate_profiles", "validated_skills")
    op.drop_column("candidate_profiles", "overall_score")
    op.drop_column("candidate_profiles", "desired_location")
    op.drop_column("candidate_profiles", "desired_opportunity_type")
    op.drop_column("candidate_profiles", "cv_url")
    op.drop_column("candidate_profiles", "languages")
    op.drop_constraint("fk_offers_created_by", "offers", type_="foreignkey")
    op.drop_constraint("fk_offers_company_id", "offers", type_="foreignkey")
    op.drop_index("ix_offers_company_id", table_name="offers")
    op.drop_column("offers", "opportunity_status")
    op.drop_column("offers", "deadline")
    op.drop_column("offers", "salary_max")
    op.drop_column("offers", "salary_min")
    op.drop_column("offers", "education_requirements")
    op.drop_column("offers", "required_experience")
    op.drop_column("offers", "required_skills")
    op.drop_column("offers", "work_mode")
    op.drop_column("offers", "location")
    op.drop_column("offers", "created_by")
    op.drop_column("offers", "company_id")
    op.drop_column("users", "company_role")
    op.drop_constraint("fk_companies_owner_id", "companies", type_="foreignkey")
    op.drop_column("companies", "owner_id")
    op.drop_column("companies", "status")
    op.drop_column("companies", "contact_phone")
    op.drop_column("companies", "contact_email")
    op.drop_column("companies", "company_size")
    op.drop_column("companies", "website")
    op.drop_column("companies", "location")
    op.drop_column("companies", "industry")
    op.drop_column("companies", "logo_url")
