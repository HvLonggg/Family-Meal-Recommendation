"""Store per-day vegetarian marks for the meal planner.

Revision ID: 0015_planner_vegetarian_days
Revises: 0014_admin_support_meal_email
"""

import sqlalchemy as sa

from alembic import op

revision = "0015_planner_vegetarian_days"
down_revision = "0014_admin_support_meal_email"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "user_vegetarian_days",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("is_vegetarian", sa.Boolean(), server_default="true", nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "day", name="uq_user_vegetarian_day"),
    )


def downgrade() -> None:
    op.drop_table("user_vegetarian_days")
