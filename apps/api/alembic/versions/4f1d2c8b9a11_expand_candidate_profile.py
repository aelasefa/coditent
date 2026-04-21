"""expand candidate profile fields

Revision ID: 4f1d2c8b9a11
Revises: e86276e3bf00
Create Date: 2026-04-10 12:00:00.000000

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "4f1d2c8b9a11"
down_revision: Union[str, Sequence[str], None] = "e86276e3bf00"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("candidate_profiles", sa.Column("headline", sa.String(length=120), nullable=True))
    op.add_column("candidate_profiles", sa.Column("bio", sa.Text(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("skills", sa.Text(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("years_of_experience", sa.Integer(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("linkedin_url", sa.String(), nullable=True))
    op.add_column("candidate_profiles", sa.Column("portfolio_url", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("candidate_profiles", "portfolio_url")
    op.drop_column("candidate_profiles", "linkedin_url")
    op.drop_column("candidate_profiles", "years_of_experience")
    op.drop_column("candidate_profiles", "skills")
    op.drop_column("candidate_profiles", "bio")
    op.drop_column("candidate_profiles", "headline")
