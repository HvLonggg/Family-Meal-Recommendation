"""Persist favorite recipes per account.

Revision ID: 0007_user_favorites
Revises: 0006_auth_hardening
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0007_user_favorites"
down_revision: str | Sequence[str] | None = "0006_auth_hardening"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_favorite_recipes",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["recipe_id"], ["mon_an.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "recipe_id", name="uq_user_favorite_recipe"),
    )
    op.create_index("ix_user_favorite_recipes_user_id", "user_favorite_recipes", ["user_id"])
    op.create_index("ix_user_favorite_recipes_recipe_id", "user_favorite_recipes", ["recipe_id"])


def downgrade() -> None:
    op.drop_index("ix_user_favorite_recipes_recipe_id", table_name="user_favorite_recipes")
    op.drop_index("ix_user_favorite_recipes_user_id", table_name="user_favorite_recipes")
    op.drop_table("user_favorite_recipes")
