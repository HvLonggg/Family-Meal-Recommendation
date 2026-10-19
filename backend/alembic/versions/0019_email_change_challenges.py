"""Bind email OTP challenges to the account that requested an email change.

Revision ID: 0019_email_change_challenges
Revises: 0018_assistant_conversations
"""

import sqlalchemy as sa

from alembic import op

revision = "0019_email_change_challenges"
down_revision = "0018_assistant_conversations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("email_otp_challenges") as batch:
        batch.add_column(sa.Column("user_id", sa.Uuid(), nullable=True))
        batch.create_foreign_key(
            "fk_email_otp_challenges_user_id_users",
            "users",
            ["user_id"],
            ["id"],
            ondelete="CASCADE",
        )
    op.create_index("ix_email_otp_challenges_user_id", "email_otp_challenges", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_email_otp_challenges_user_id", table_name="email_otp_challenges")
    with op.batch_alter_table("email_otp_challenges") as batch:
        batch.drop_constraint("fk_email_otp_challenges_user_id_users", type_="foreignkey")
        batch.drop_column("user_id")
