"""Store personal meal plans and immutable change history.

Revision ID: 0010_user_meal_planner
Revises: 0009_auth_security_email
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0010_user_meal_planner"
down_revision: str | Sequence[str] | None = "0009_auth_security_email"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_meal_plan_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipe_id", sa.Uuid(), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(length=16), nullable=False),
        sa.Column("servings", sa.Integer(), server_default="4", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["recipe_id"], ["mon_an.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "recipe_id", "plan_date", "meal_type", name="uq_user_meal_plan_recipe"
        ),
    )
    op.create_index("ix_user_meal_plan_items_user_id", "user_meal_plan_items", ["user_id"])
    op.create_index("ix_user_meal_plan_items_recipe_id", "user_meal_plan_items", ["recipe_id"])
    op.create_index("ix_user_meal_plan_items_plan_date", "user_meal_plan_items", ["plan_date"])
    op.create_index("ix_user_meal_plan_user_date", "user_meal_plan_items", ["user_id", "plan_date"])

    op.create_table(
        "user_meal_plan_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("item_id", sa.Uuid(), nullable=False),
        sa.Column("action", sa.String(length=16), nullable=False),
        sa.Column("recipe_slug", sa.String(length=180), nullable=False),
        sa.Column("recipe_name", sa.String(length=180), nullable=False),
        sa.Column("image_path", sa.String(length=500), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(length=16), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column(
            "occurred_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_user_meal_plan_events_user_id", "user_meal_plan_events", ["user_id"])
    op.create_index("ix_user_meal_plan_events_item_id", "user_meal_plan_events", ["item_id"])
    op.create_index("ix_user_meal_plan_events_plan_date", "user_meal_plan_events", ["plan_date"])
    op.create_index(
        "ix_user_meal_plan_events_occurred_at", "user_meal_plan_events", ["occurred_at"]
    )
    op.create_index(
        "ix_user_meal_plan_events_user_time",
        "user_meal_plan_events",
        ["user_id", "occurred_at"],
    )
    op.create_index(
        "ix_user_meal_plan_events_user_date",
        "user_meal_plan_events",
        ["user_id", "plan_date"],
    )


def downgrade() -> None:
    op.drop_index("ix_user_meal_plan_events_user_date", table_name="user_meal_plan_events")
    op.drop_index("ix_user_meal_plan_events_user_time", table_name="user_meal_plan_events")
    op.drop_index("ix_user_meal_plan_events_occurred_at", table_name="user_meal_plan_events")
    op.drop_index("ix_user_meal_plan_events_plan_date", table_name="user_meal_plan_events")
    op.drop_index("ix_user_meal_plan_events_item_id", table_name="user_meal_plan_events")
    op.drop_index("ix_user_meal_plan_events_user_id", table_name="user_meal_plan_events")
    op.drop_table("user_meal_plan_events")
    op.drop_index("ix_user_meal_plan_user_date", table_name="user_meal_plan_items")
    op.drop_index("ix_user_meal_plan_items_plan_date", table_name="user_meal_plan_items")
    op.drop_index("ix_user_meal_plan_items_recipe_id", table_name="user_meal_plan_items")
    op.drop_index("ix_user_meal_plan_items_user_id", table_name="user_meal_plan_items")
    op.drop_table("user_meal_plan_items")
