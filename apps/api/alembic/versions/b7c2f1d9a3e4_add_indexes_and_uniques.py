"""add indexes and unique constraints

Revision ID: b7c2f1d9a3e4
Revises: c2f4a7db9012
Create Date: 2026-05-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b7c2f1d9a3e4"
down_revision: Union[str, Sequence[str], None] = "c2f4a7db9012"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index("ix_users_email", "users", ["email"], unique=False)
    op.create_index("ix_users_role", "users", ["role"], unique=False)
    op.create_index("ix_offers_recruiter_id", "offers", ["recruiter_id"], unique=False)
    op.create_index(
        "ix_saved_recommendations_candidate_id",
        "saved_recommendations",
        ["candidate_id"],
        unique=False,
    )
    op.create_index(
        "ix_saved_recommendations_offer_id",
        "saved_recommendations",
        ["offer_id"],
        unique=False,
    )
    op.create_unique_constraint(
        "uq_saved_recommendations_candidate_offer",
        "saved_recommendations",
        ["candidate_id", "offer_id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "uq_saved_recommendations_candidate_offer",
        "saved_recommendations",
        type_="unique",
    )
    op.drop_index("ix_saved_recommendations_offer_id", table_name="saved_recommendations")
    op.drop_index("ix_saved_recommendations_candidate_id", table_name="saved_recommendations")
    op.drop_index("ix_offers_recruiter_id", table_name="offers")
    op.drop_index("ix_users_role", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
