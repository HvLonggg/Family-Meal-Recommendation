from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.auth.models import User

ARTICLE_KINDS = ("editorial", "story")
ARTICLE_STATUSES = ("draft", "pending", "published", "rejected", "hidden")


class Article(Base):
    """Bài viết của ban biên tập (editorial) hoặc câu chuyện căn bếp của người dùng (story)."""

    __tablename__ = "articles"
    __table_args__ = (
        Index("ix_articles_status_published", "status", "published_at"),
        Index("ix_articles_author_updated", "author_id", "updated_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    author_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16), default="story", index=True)
    slug: Mapped[str] = mapped_column(String(220), unique=True, index=True)
    title: Mapped[str] = mapped_column(String(200))
    excerpt: Mapped[str] = mapped_column(String(400))
    body: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(60), index=True)
    recipe_slug: Mapped[str | None] = mapped_column(String(180))
    cover_data: Mapped[bytes | None] = mapped_column(LargeBinary, deferred=True)
    cover_content_type: Mapped[str | None] = mapped_column(String(32))
    cover_updated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(String(16), default="draft", index=True)
    moderation_note: Mapped[str | None] = mapped_column(String(300))
    reading_minutes: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    author: Mapped[User | None] = relationship()

    @property
    def cover_url(self) -> str | None:
        if self.cover_updated_at is None:
            return None
        return f"/articles/{self.id}/cover?v={int(self.cover_updated_at.timestamp())}"
