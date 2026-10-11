"""Track credential versions and retryable security email notifications.

Revision ID: 0009_auth_security_email
Revises: 0008_email_otp
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0009_auth_security_email"
down_revision: str | Sequence[str] | None = "0008_email_otp"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("auth_version", sa.Integer(), server_default="0", nullable=False),
    )
    op.create_table(
        "security_email_outbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("recipient", sa.String(length=320), nullable=False),
        sa.Column("event", sa.String(length=32), nullable=False),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column(
            "next_attempt_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_security_email_outbox_user_id", "security_email_outbox", ["user_id"]
    )
    op.create_index(
        "ix_security_email_outbox_next_attempt_at", "security_email_outbox", ["next_attempt_at"]
    )
    op.create_index("ix_security_email_outbox_sent_at", "security_email_outbox", ["sent_at"])
    op.create_index(
        "ix_security_email_outbox_pending",
        "security_email_outbox",
        ["sent_at", "next_attempt_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_security_email_outbox_pending", table_name="security_email_outbox")
    op.drop_index("ix_security_email_outbox_sent_at", table_name="security_email_outbox")
    op.drop_index(
        "ix_security_email_outbox_next_attempt_at", table_name="security_email_outbox"
    )
    op.drop_index("ix_security_email_outbox_user_id", table_name="security_email_outbox")
    op.drop_table("security_email_outbox")
    op.drop_column("users", "auth_version")
