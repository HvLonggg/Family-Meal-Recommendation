"""Add phone-verified registration data and bounded SMS challenges.

Revision ID: 0006_auth_hardening
Revises: 0005_recipe_catalog
"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

revision: str = "0006_auth_hardening"
down_revision: str | Sequence[str] | None = "0005_recipe_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("users", sa.Column("phone_verified_at", sa.DateTime(timezone=True)))
    op.add_column(
        "refresh_sessions",
        sa.Column("remembered", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column(
        "phone_otp_challenges",
        sa.Column("purpose", sa.String(length=32), server_default="phone_login", nullable=False),
    )
    op.add_column("phone_otp_challenges", sa.Column("pending_full_name", sa.String(length=120)))
    op.add_column("phone_otp_challenges", sa.Column("pending_email", sa.String(length=320)))
    op.add_column("phone_otp_challenges", sa.Column("pending_password_hash", sa.String(length=512)))
    op.add_column(
        "phone_otp_challenges",
        sa.Column("account_exists", sa.Boolean(), server_default=sa.true(), nullable=False),
    )
    op.add_column(
        "phone_otp_challenges",
        sa.Column("remembered", sa.Boolean(), server_default=sa.false(), nullable=False),
    )
    op.add_column("phone_otp_challenges", sa.Column("requester_key", sa.String(length=64)))
    op.create_index(
        "ix_phone_otp_challenges_purpose", "phone_otp_challenges", ["purpose"], unique=False
    )
    op.create_index(
        "ix_phone_otp_challenges_requester_key",
        "phone_otp_challenges",
        ["requester_key"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_phone_otp_challenges_requester_key", table_name="phone_otp_challenges")
    op.drop_index("ix_phone_otp_challenges_purpose", table_name="phone_otp_challenges")
    op.drop_column("phone_otp_challenges", "requester_key")
    op.drop_column("phone_otp_challenges", "remembered")
    op.drop_column("phone_otp_challenges", "account_exists")
    op.drop_column("phone_otp_challenges", "pending_password_hash")
    op.drop_column("phone_otp_challenges", "pending_email")
    op.drop_column("phone_otp_challenges", "pending_full_name")
    op.drop_column("phone_otp_challenges", "purpose")
    op.drop_column("refresh_sessions", "remembered")
    op.drop_column("users", "phone_verified_at")
