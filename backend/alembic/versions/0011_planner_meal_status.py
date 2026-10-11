"""Track completion status for meals in a personal plan.

Revision ID: 0011_planner_meal_status
Revises: 0010_user_meal_planner
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0011_planner_meal_status"
down_revision: str | Sequence[str] | None = "0010_user_meal_planner"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_meal_plan_items",
        sa.Column(
            "completion_status",
            sa.String(length=16),
            server_default="planned",
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("user_meal_plan_items", "completion_status")
