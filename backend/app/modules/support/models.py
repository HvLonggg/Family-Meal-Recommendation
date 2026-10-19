from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, Index, Integer, String, Text, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base

SUPPORT_TOPICS = ("general", "account", "recipe", "planner", "bug", "partnership")
SUPPORT_STATUSES = ("open", "in_progress", "resolved")


class SupportTicket(Base):
    __tablename__ = "support_tickets"
    __table_args__ = (
        Index("ix_support_tickets_status_created", "status", "created_at"),
        Index(
            "ix_support_tickets_email_delivery",
            "notification_sent_at",
            "notification_next_attempt_at",
        ),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(320))
    topic: Mapped[str] = mapped_column(String(24))
    subject: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)
    admin_note: Mapped[str | None] = mapped_column(String(500))
    requester_key: Mapped[str | None] = mapped_column(String(64), index=True)
    notification_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    notification_next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    notification_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reply_status: Mapped[str] = mapped_column(
        String(16), default="not_sent", server_default="not_sent"
    )
    reply_attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reply_last_attempt_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reply_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    reply_last_error: Mapped[str | None] = mapped_column(String(300))
    reply_subject: Mapped[str | None] = mapped_column(String(180))
    reply_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class AdminMealSuggestionEmail(Base):
    __tablename__ = "admin_meal_suggestion_emails"
    __table_args__ = (
        Index("ix_admin_meal_suggestion_created", "created_at"),
        Index("ix_admin_meal_suggestion_status", "status", "created_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    admin_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    recipient_user_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), index=True
    )
    recipient_email: Mapped[str] = mapped_column(String(320), index=True)
    recipient_name: Mapped[str] = mapped_column(String(120), default="bạn")
    meal_type: Mapped[str] = mapped_column(String(16))
    subject: Mapped[str] = mapped_column(String(180))
    intro_message: Mapped[str] = mapped_column(Text)
    closing_message: Mapped[str] = mapped_column(Text)
    recipe_data: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    status: Mapped[str] = mapped_column(String(16), default="sending", index=True)
    attempts: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    error_message: Mapped[str | None] = mapped_column(String(300))
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
