from datetime import datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    LargeBinary,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class AssistantConversation(Base):
    """Cuộc trò chuyện với Chú Rồng của người dùng đã đăng nhập (khách lưu trên trình duyệt)."""

    __tablename__ = "assistant_conversations"
    __table_args__ = (Index("ix_assistant_conversations_user_updated", "user_id", "updated_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    title: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    messages: Mapped[list["AssistantMessage"]] = relationship(
        back_populates="conversation",
        cascade="all, delete-orphan",
        order_by="AssistantMessage.created_at",
    )


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    conversation_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("assistant_conversations.id", ondelete="CASCADE"),
        index=True,
    )
    role: Mapped[str] = mapped_column(String(16))
    content: Mapped[str] = mapped_column(Text)
    # Thẻ món, gợi ý, liên kết, tệp đính kèm (chỉ tên + ảnh thu nhỏ), chế độ trả lời.
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    conversation: Mapped[AssistantConversation] = relationship(back_populates="messages")


class AssistantKnowledgeChunk(Base):
    """Đoạn tri thức công khai (món, bài viết, hướng dẫn website) đã lập chỉ mục cho RAG."""

    __tablename__ = "assistant_knowledge_chunks"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    chunk_key: Mapped[str] = mapped_column(String(260), unique=True, index=True)
    source_type: Mapped[str] = mapped_column(String(16), index=True)
    source_key: Mapped[str] = mapped_column(String(220))
    title: Mapped[str] = mapped_column(String(220))
    url: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    content_hash: Mapped[str] = mapped_column(String(64))
    # Vector float32 đã chuẩn hóa L2; None khi chưa có API key hoặc chưa kịp tạo.
    embedding: Mapped[bytes | None] = mapped_column(LargeBinary)
    embedding_model: Mapped[str | None] = mapped_column(String(80))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AssistantMemory(Base):
    """Ghi nhớ riêng của một người dùng (khẩu vị, dị ứng, gia đình); chỉ dùng cho chính họ."""

    __tablename__ = "assistant_memories"
    __table_args__ = (Index("ix_assistant_memories_user_created", "user_id", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    content: Mapped[str] = mapped_column(String(200))
    kind: Mapped[str] = mapped_column(String(16), default="note")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AssistantKnowledgeDocument(Base):
    """Tài liệu quản trị viên dạy cho Chú Rồng (ghi chú hoặc tệp .docx/.pptx/.txt đã trích chữ)."""

    __tablename__ = "assistant_knowledge_documents"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    title: Mapped[str] = mapped_column(String(200))
    source: Mapped[str] = mapped_column(String(16), default="note")
    file_name: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(120))
    size_bytes: Mapped[int] = mapped_column(default=0)
    text: Mapped[str] = mapped_column(Text)
    active: Mapped[bool] = mapped_column(default=True, index=True)
    created_by: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
