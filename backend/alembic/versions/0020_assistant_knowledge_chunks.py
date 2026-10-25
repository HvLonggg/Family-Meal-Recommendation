"""Knowledge chunks (with optional embeddings) for the assistant's RAG retrieval.

Revision ID: 0020_assistant_knowledge_chunks
Revises: 0019_email_change_challenges
"""

import sqlalchemy as sa

from alembic import op

revision = "0020_assistant_knowledge_chunks"
down_revision = "0019_email_change_challenges"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "assistant_knowledge_chunks",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("chunk_key", sa.String(260), nullable=False),
        sa.Column("source_type", sa.String(16), nullable=False),
        sa.Column("source_key", sa.String(220), nullable=False),
        sa.Column("title", sa.String(220), nullable=False),
        sa.Column("url", sa.String(300), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("content_hash", sa.String(64), nullable=False),
        sa.Column("embedding", sa.LargeBinary(), nullable=True),
        sa.Column("embedding_model", sa.String(80), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )
    op.create_index(
        "ix_assistant_knowledge_chunks_chunk_key",
        "assistant_knowledge_chunks",
        ["chunk_key"],
        unique=True,
    )
    op.create_index(
        "ix_assistant_knowledge_chunks_source_type",
        "assistant_knowledge_chunks",
        ["source_type"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_assistant_knowledge_chunks_source_type", table_name="assistant_knowledge_chunks"
    )
    op.drop_index(
        "ix_assistant_knowledge_chunks_chunk_key", table_name="assistant_knowledge_chunks"
    )
    op.drop_table("assistant_knowledge_chunks")
