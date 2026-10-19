"""Queue opt-in daily meal-plan reminder emails.

Revision ID: 0016_meal_plan_email_reminders
Revises: 0015_planner_vegetarian_days
"""

import sqlalchemy as sa

from alembic import op

revision = "0016_meal_plan_email_reminders"
down_revision = "0015_planner_vegetarian_days"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "meal_plan_email_reminders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("plan_date", sa.Date(), nullable=False),
        sa.Column("meal_type", sa.String(length=16), nullable=False),
        sa.Column("payload", sa.JSON(), server_default="{}", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "user_id", "plan_date", "meal_type", name="uq_meal_plan_email_reminder"
        ),
    )
    op.create_index(
        "ix_meal_plan_email_reminders_user_id", "meal_plan_email_reminders", ["user_id"]
    )
    op.create_index(
        "ix_meal_plan_email_reminders_plan_date", "meal_plan_email_reminders", ["plan_date"]
    )
    op.create_index(
        "ix_meal_plan_email_reminders_next_attempt_at",
        "meal_plan_email_reminders",
        ["next_attempt_at"],
    )
    op.create_index(
        "ix_meal_plan_email_reminders_sent_at", "meal_plan_email_reminders", ["sent_at"]
    )
    op.create_index(
        "ix_meal_plan_email_pending",
        "meal_plan_email_reminders",
        ["sent_at", "next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_meal_plan_email_pending", table_name="meal_plan_email_reminders")
    op.drop_index("ix_meal_plan_email_reminders_sent_at", table_name="meal_plan_email_reminders")
    op.drop_index(
        "ix_meal_plan_email_reminders_next_attempt_at", table_name="meal_plan_email_reminders"
    )
    op.drop_index("ix_meal_plan_email_reminders_plan_date", table_name="meal_plan_email_reminders")
    op.drop_index("ix_meal_plan_email_reminders_user_id", table_name="meal_plan_email_reminders")
    op.drop_table("meal_plan_email_reminders")
