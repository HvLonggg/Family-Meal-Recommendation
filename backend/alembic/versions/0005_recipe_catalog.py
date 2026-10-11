"""Store stable catalog IDs and complete editorial recipe data.

Revision ID: 0005_recipe_catalog
Revises: 0004_saved_meals
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0005_recipe_catalog"
down_revision: str | Sequence[str] | None = "0004_saved_meals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("mon_an", sa.Column("catalog_id", sa.String(16), nullable=True))
    op.create_index("ix_mon_an_catalog_id", "mon_an", ["catalog_id"], unique=True)
    op.add_column("mon_an", sa.Column("content", sa.JSON(), nullable=False, server_default="{}"))
    op.add_column("mon_an", sa.Column("search_text", sa.Text(), nullable=False, server_default=""))


def downgrade() -> None:
    op.drop_column("mon_an", "search_text")
    op.drop_column("mon_an", "content")
    op.drop_index("ix_mon_an_catalog_id", table_name="mon_an")
    op.drop_column("mon_an", "catalog_id")
