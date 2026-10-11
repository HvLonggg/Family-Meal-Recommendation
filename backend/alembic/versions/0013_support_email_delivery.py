"""Queue support request emails for reliable delivery."""

import sqlalchemy as sa

from alembic import op

revision = "0013_support_email_delivery"
down_revision = "0012_community_admin_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "support_tickets",
        sa.Column("notification_attempts", sa.Integer(), server_default="0", nullable=False),
    )
    op.add_column(
        "support_tickets",
        sa.Column(
            "notification_next_attempt_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.add_column(
        "support_tickets",
        sa.Column("notification_sent_at", sa.DateTime(timezone=True), nullable=True),
    )
    # Only future requests are mailed; historical tickets are already in the admin inbox.
    op.execute(
        sa.text("UPDATE support_tickets SET notification_sent_at = created_at")
    )
    op.create_index(
        "ix_support_tickets_email_delivery",
        "support_tickets",
        ["notification_sent_at", "notification_next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_support_tickets_email_delivery", table_name="support_tickets")
    op.drop_column("support_tickets", "notification_sent_at")
    op.drop_column("support_tickets", "notification_next_attempt_at")
    op.drop_column("support_tickets", "notification_attempts")
