from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import (
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
