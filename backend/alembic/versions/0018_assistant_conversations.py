"""Store Rồng Con assistant conversations for signed-in members.

Revision ID: 0018_assistant_conversations
Revises: 0017_admin_recipe_images
"""

import sqlalchemy as sa

from alembic import op

revision = "0018_assistant_conversations"
down_revision = "0017_admin_recipe_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_conversations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_assistant_conversations_user_id", "assistant_conversations", ["user_id"])
    op.create_index(
        "ix_assistant_conversations_user_updated",
        "assistant_conversations",
        ["user_id", "updated_at"],
    )
    op.create_table(
        "assistant_messages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("conversation_id", sa.Uuid(), nullable=False),
        sa.Column("role", sa.String(length=16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(
            ["conversation_id"], ["assistant_conversations.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_assistant_messages_conversation_id", "assistant_messages", ["conversation_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_assistant_messages_conversation_id", table_name="assistant_messages")
    op.drop_table("assistant_messages")
    op.drop_index("ix_assistant_conversations_user_updated", table_name="assistant_conversations")
    op.drop_index("ix_assistant_conversations_user_id", table_name="assistant_conversations")
    op.drop_table("assistant_conversations")
