from datetime import date, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.modules.recipes.models import Recipe


class UserMealPlanItem(Base):
    __tablename__ = "user_meal_plan_items"
    __table_args__ = (
        UniqueConstraint(
            "user_id", "recipe_id", "plan_date", "meal_type", name="uq_user_meal_plan_recipe"
        ),
        Index("ix_user_meal_plan_user_date", "user_id", "plan_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipe_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("mon_an.id", ondelete="CASCADE"), index=True
    )
    plan_date: Mapped[date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(16))
    servings: Mapped[int] = mapped_column(Integer, default=4, server_default="4")
    completion_status: Mapped[str] = mapped_column(
        String(16), default="planned", server_default="planned"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    recipe: Mapped[Recipe] = relationship()


class UserMealPlanEvent(Base):
    __tablename__ = "user_meal_plan_events"
    __table_args__ = (
        Index("ix_user_meal_plan_events_user_time", "user_id", "occurred_at"),
        Index("ix_user_meal_plan_events_user_date", "user_id", "plan_date"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    item_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), index=True)
    action: Mapped[str] = mapped_column(String(16))
    recipe_slug: Mapped[str] = mapped_column(String(180))
    recipe_name: Mapped[str] = mapped_column(String(180))
    image_path: Mapped[str] = mapped_column(String(500))
    plan_date: Mapped[date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(16))
    servings: Mapped[int] = mapped_column(Integer)
    occurred_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class MealPlanEmailReminder(Base):
    """Durable, deduplicated delivery record for a planned meal reminder."""

    __tablename__ = "meal_plan_email_reminders"
    __table_args__ = (
        UniqueConstraint("user_id", "plan_date", "meal_type", name="uq_meal_plan_email_reminder"),
        Index("ix_meal_plan_email_pending", "sent_at", "next_attempt_at"),
    )

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    plan_date: Mapped[date] = mapped_column(Date, index=True)
    meal_type: Mapped[str] = mapped_column(String(16))
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict, server_default="{}")
    attempts: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserVegetarianDay(Base):
    """Lựa chọn ăn chay của người dùng cho một ngày; ghi đè cả quy tắc mùng 1 và rằm."""

    __tablename__ = "user_vegetarian_days"
    # Ràng buộc duy nhất (user_id, day) cũng là chỉ mục cho truy vấn theo khoảng ngày.
    __table_args__ = (UniqueConstraint("user_id", "day", name="uq_user_vegetarian_day"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE")
    )
    day: Mapped[date] = mapped_column(Date)
    is_vegetarian: Mapped[bool] = mapped_column(Boolean, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
