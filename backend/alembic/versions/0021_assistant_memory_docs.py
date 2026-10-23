"""Per-user assistant memories and admin-taught knowledge documents.

Revision ID: 0021_assistant_memory_docs
Revises: 0020_assistant_knowledge_chunks
"""

import sqlalchemy as sa

from alembic import op

revision = "0021_assistant_memory_docs"
down_revision = "0020_assistant_knowledge_chunks"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_memories",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "user_id",
            sa.Uuid(),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("content", sa.String(200), nullable=False),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index("ix_assistant_memories_user_id", "assistant_memories", ["user_id"])
    op.create_index(
        "ix_assistant_memories_user_created", "assistant_memories", ["user_id", "created_at"]
    )
    op.create_table(
        "assistant_knowledge_documents",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("source", sa.String(16), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=True),
        sa.Column("content_type", sa.String(120), nullable=True),
        sa.Column("size_bytes", sa.Integer(), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.Column(
            "created_by", sa.Uuid(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
    )
    op.create_index(
        "ix_assistant_knowledge_documents_active", "assistant_knowledge_documents", ["active"]
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_knowledge_documents_active", table_name="assistant_knowledge_documents"
    )
    op.drop_table("assistant_knowledge_documents")
    op.drop_index("ix_assistant_memories_user_created", table_name="assistant_memories")
    op.drop_index("ix_assistant_memories_user_id", table_name="assistant_memories")
    op.drop_table("assistant_memories")
