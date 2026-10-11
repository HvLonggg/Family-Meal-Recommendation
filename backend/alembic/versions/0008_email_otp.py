"""Use short-lived email OTP challenges for account verification and recovery.

Revision ID: 0008_email_otp
Revises: 0007_user_favorites
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0008_email_otp"
down_revision: str | Sequence[str] | None = "0007_user_favorites"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "email_otp_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("email", sa.String(length=320), nullable=False),
        sa.Column("purpose", sa.String(length=32), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("pending_full_name", sa.String(length=120), nullable=True),
        sa.Column("pending_password_hash", sa.String(length=512), nullable=True),
        sa.Column("account_exists", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("remembered", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("requester_key", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_email_otp_challenges_email", "email_otp_challenges", ["email"])
    op.create_index("ix_email_otp_challenges_purpose", "email_otp_challenges", ["purpose"])
    op.create_index(
        "ix_email_otp_challenges_requester_key", "email_otp_challenges", ["requester_key"]
    )
    op.create_index("ix_email_otp_challenges_expires_at", "email_otp_challenges", ["expires_at"])
    op.create_index(
        "ix_email_otp_email_purpose_created",
        "email_otp_challenges",
        ["email", "purpose", "created_at"],
    )
    op.drop_index("ix_phone_otp_challenges_requester_key", table_name="phone_otp_challenges")
    op.drop_index("ix_phone_otp_challenges_purpose", table_name="phone_otp_challenges")
    op.drop_index("ix_phone_otp_challenges_phone_e164", table_name="phone_otp_challenges")
    op.drop_index("ix_phone_otp_challenges_expires_at", table_name="phone_otp_challenges")
    op.drop_table("phone_otp_challenges")


def downgrade() -> None:
    op.drop_index("ix_email_otp_email_purpose_created", table_name="email_otp_challenges")
    op.drop_index("ix_email_otp_challenges_expires_at", table_name="email_otp_challenges")
    op.drop_index("ix_email_otp_challenges_requester_key", table_name="email_otp_challenges")
    op.drop_index("ix_email_otp_challenges_purpose", table_name="email_otp_challenges")
    op.drop_index("ix_email_otp_challenges_email", table_name="email_otp_challenges")
    op.drop_table("email_otp_challenges")
    op.create_table(
        "phone_otp_challenges",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("phone_e164", sa.String(length=16), nullable=False),
        sa.Column("purpose", sa.String(length=32), server_default="phone_login", nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.Integer(), nullable=False),
        sa.Column("pending_full_name", sa.String(length=120), nullable=True),
        sa.Column("pending_email", sa.String(length=320), nullable=True),
        sa.Column("pending_password_hash", sa.String(length=512), nullable=True),
        sa.Column("account_exists", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("remembered", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("requester_key", sa.String(length=64), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_phone_otp_challenges_phone_e164", "phone_otp_challenges", ["phone_e164"])
    op.create_index("ix_phone_otp_challenges_expires_at", "phone_otp_challenges", ["expires_at"])
    op.create_index("ix_phone_otp_challenges_purpose", "phone_otp_challenges", ["purpose"])
    op.create_index(
        "ix_phone_otp_challenges_requester_key", "phone_otp_challenges", ["requester_key"]
    )
