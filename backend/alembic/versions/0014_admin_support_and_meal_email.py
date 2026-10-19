"""Track admin support inbox activity and meal suggestion email delivery.

Revision ID: 0014_admin_support_meal_email
Revises: 0013_support_email_delivery
"""

import sqlalchemy as sa

from alembic import op

revision = "0014_admin_support_meal_email"
down_revision = "0013_support_email_delivery"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("support_tickets", sa.Column("viewed_at", sa.DateTime(timezone=True)))
    op.add_column(
        "support_tickets",
        sa.Column("reply_status", sa.String(length=16), server_default="not_sent", nullable=False),
    )
    op.add_column(
        "support_tickets",
        sa.Column("reply_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column("support_tickets", sa.Column("reply_last_attempt_at", sa.DateTime(timezone=True)))
    op.add_column("support_tickets", sa.Column("reply_sent_at", sa.DateTime(timezone=True)))
    op.add_column("support_tickets", sa.Column("reply_last_error", sa.String(length=300)))
    op.add_column("support_tickets", sa.Column("reply_subject", sa.String(length=180)))
    op.add_column("support_tickets", sa.Column("reply_message", sa.Text()))

    op.create_table(
        "admin_meal_suggestion_emails",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("admin_user_id", sa.Uuid(), nullable=True),
        sa.Column("recipient_user_id", sa.Uuid(), nullable=True),
        sa.Column("recipient_email", sa.String(length=320), nullable=False),
        sa.Column("recipient_name", sa.String(length=120), server_default="bạn", nullable=False),
        sa.Column("meal_type", sa.String(length=16), nullable=False),
        sa.Column("subject", sa.String(length=180), nullable=False),
        sa.Column("intro_message", sa.Text(), nullable=False),
        sa.Column("closing_message", sa.Text(), server_default="", nullable=False),
        sa.Column("recipe_data", sa.JSON(), nullable=False),
        sa.Column("status", sa.String(length=16), server_default="sending", nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="1", nullable=False),
        sa.Column("error_message", sa.String(length=300)),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["admin_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["recipient_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_admin_meal_suggestion_emails_admin_user_id",
        "admin_meal_suggestion_emails",
        ["admin_user_id"],
    )
    op.create_index(
        "ix_admin_meal_suggestion_emails_recipient_user_id",
        "admin_meal_suggestion_emails",
        ["recipient_user_id"],
    )
    op.create_index(
        "ix_admin_meal_suggestion_emails_recipient_email",
        "admin_meal_suggestion_emails",
        ["recipient_email"],
    )
    op.create_index(
        "ix_admin_meal_suggestion_emails_status",
        "admin_meal_suggestion_emails",
        ["status"],
    )
    op.create_index(
        "ix_admin_meal_suggestion_created",
        "admin_meal_suggestion_emails",
        ["created_at"],
    )
    op.create_index(
        "ix_admin_meal_suggestion_status",
        "admin_meal_suggestion_emails",
        ["status", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_admin_meal_suggestion_status", table_name="admin_meal_suggestion_emails")
    op.drop_index("ix_admin_meal_suggestion_created", table_name="admin_meal_suggestion_emails")
    op.drop_index(
        "ix_admin_meal_suggestion_emails_status", table_name="admin_meal_suggestion_emails"
    )
    op.drop_index(
        "ix_admin_meal_suggestion_emails_recipient_email",
        table_name="admin_meal_suggestion_emails",
    )
    op.drop_index(
        "ix_admin_meal_suggestion_emails_recipient_user_id",
        table_name="admin_meal_suggestion_emails",
    )
    op.drop_index(
        "ix_admin_meal_suggestion_emails_admin_user_id",
        table_name="admin_meal_suggestion_emails",
    )
    op.drop_table("admin_meal_suggestion_emails")
    op.drop_column("support_tickets", "reply_message")
    op.drop_column("support_tickets", "reply_subject")
    op.drop_column("support_tickets", "reply_last_error")
    op.drop_column("support_tickets", "reply_sent_at")
    op.drop_column("support_tickets", "reply_last_attempt_at")
    op.drop_column("support_tickets", "reply_attempts")
    op.drop_column("support_tickets", "reply_status")
    op.drop_column("support_tickets", "viewed_at")
