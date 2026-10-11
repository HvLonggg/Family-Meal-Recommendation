from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.auth.models import User

SUBMISSION_STATUSES = ("draft", "pending", "approved", "rejected")


class RecipeSubmission(Base):
    """Món ăn do người dùng đề xuất, chờ ban nội dung duyệt trước khi đưa vào kho món."""

    __tablename__ = "recipe_submissions"
    __table_args__ = (Index("ix_recipe_submissions_status_created", "status", "created_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(180))
    region: Mapped[str] = mapped_column(String(32))
    category: Mapped[str] = mapped_column(String(48))
    servings: Mapped[int] = mapped_column(Integer, default=4)
    total_minutes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    story: Mapped[str] = mapped_column(Text)
    ingredients: Mapped[str] = mapped_column(Text)
    steps: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="pending", index=True)
    admin_note: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship()
