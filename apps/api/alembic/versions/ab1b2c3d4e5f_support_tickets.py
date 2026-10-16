"""Add support reports for candidates and company users.

Revision ID: ab1b2c3d4e5f
Revises: aa1b2c3d4e5f
"""
from alembic import op
import sqlalchemy as sa

revision = "ab1b2c3d4e5f"
down_revision = "aa1b2c3d4e5f"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "support_tickets",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("reporter_id", sa.UUID(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_id", sa.UUID(), sa.ForeignKey("companies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("subject", sa.String(160), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("category", sa.String(30), nullable=False),
        sa.Column("page_path", sa.String(500), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("response", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('open', 'in_progress', 'resolved')", name="ck_support_tickets_status"),
    )
    op.create_index("ix_support_tickets_reporter_created", "support_tickets", ["reporter_id", "created_at"])
    op.create_index("ix_support_tickets_status_created", "support_tickets", ["status", "created_at"])


def downgrade() -> None:
    op.drop_table("support_tickets")
