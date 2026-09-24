"""merge heads

Revision ID: h1a2b3c4d5e6
Revises: c7d8e9f0a1b2, g1a2b3c4d5e6
Create Date: 2026-09-24 07:48:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h1a2b3c4d5e6"
down_revision: Union[str, Sequence[str], None] = ("c7d8e9f0a1b2", "g1a2b3c4d5e6")
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# def upgrade() -> None:
#     pass


# def downgrade() -> None:
#     pass
