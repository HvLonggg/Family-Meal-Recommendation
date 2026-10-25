"""Cooked-dish history, cook-mode timers and Web Push subscriptions.

Revision ID: 0022_cooking_logs_timers
Revises: 0021_assistant_memory_docs
"""

import sqlalchemy as sa

from alembic import op

revision = "0022_cooking_logs_timers"
down_revision = "0021_assistant_memory_docs"
branch_labels = None
depends_on = None


def _user_fk() -> sa.Column:
    return sa.Column(
        "user_id", sa.Uuid(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )


def upgrade() -> None:
    op.create_table(
        "user_cook_logs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _user_fk(),
        sa.Column("recipe_id", sa.Uuid(), sa.ForeignKey("mon_an.id", ondelete="SET NULL")),
        sa.Column(
            "plan_item_id",
            sa.Uuid(),
            sa.ForeignKey("user_meal_plan_items.id", ondelete="SET NULL"),
        ),
        sa.Column("recipe_slug", sa.String(180), nullable=False),
        sa.Column("recipe_name", sa.String(180), nullable=False),
        sa.Column("image_path", sa.String(500), nullable=False),
        sa.Column("servings", sa.Integer(), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column(
            "cooked_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("duration_seconds", sa.Integer()),
        sa.Column("note", sa.String(500)),
    )
    op.create_index("ix_user_cook_logs_user_id", "user_cook_logs", ["user_id"])
    op.create_index("ix_user_cook_logs_recipe_id", "user_cook_logs", ["recipe_id"])
    op.create_index("ix_user_cook_logs_plan_item_id", "user_cook_logs", ["plan_item_id"])
    op.create_index("ix_user_cook_logs_recipe_slug", "user_cook_logs", ["recipe_slug"])
    op.create_index("ix_user_cook_logs_user_time", "user_cook_logs", ["user_id", "cooked_at"])

    op.create_table(
        "user_cook_timers",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _user_fk(),
        sa.Column("label", sa.String(160), nullable=False),
        sa.Column("recipe_slug", sa.String(180), nullable=False),
        sa.Column("return_path", sa.String(500), nullable=False),
        sa.Column("status", sa.String(16), server_default="running", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("notified_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_user_cook_timers_user_id", "user_cook_timers", ["user_id"])
    op.create_index(
        "ix_user_cook_timers_due", "user_cook_timers", ["status", "notified_at", "due_at"]
    )

    op.create_table(
        "user_push_subscriptions",
        sa.Column("id", sa.Uuid(), primary_key=True),
        _user_fk(),
        sa.Column("endpoint", sa.String(1000), nullable=False, unique=True),
        sa.Column("p256dh", sa.String(200), nullable=False),
        sa.Column("auth", sa.String(64), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_user_push_subscriptions_user_id", "user_push_subscriptions", ["user_id"])


def downgrade() -> None:
    op.drop_table("user_push_subscriptions")
    op.drop_table("user_cook_timers")
    op.drop_table("user_cook_logs")
