from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, Index, Integer, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserCookLog(Base):
    """Một lần người dùng nấu xong một món; giữ ảnh chụp tên/ảnh để lịch sử không đổi theo món."""

    __tablename__ = "user_cook_logs"
    __table_args__ = (Index("ix_user_cook_logs_user_time", "user_id", "cooked_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipe_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("mon_an.id", ondelete="SET NULL"), index=True
    )
    plan_item_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("user_meal_plan_items.id", ondelete="SET NULL"), index=True
    )
    recipe_slug: Mapped[str] = mapped_column(String(180), index=True)
    recipe_name: Mapped[str] = mapped_column(String(180))
    image_path: Mapped[str] = mapped_column(String(500))
    servings: Mapped[int] = mapped_column(Integer)
    # manual: đánh dấu ở trang món; planner: tick trong kế hoạch; cook_mode: xong khi vào bếp.
    source: Mapped[str] = mapped_column(String(16))
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cooked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    duration_seconds: Mapped[int | None] = mapped_column(Integer)
    note: Mapped[str | None] = mapped_column(String(500))


class UserCookTimer(Base):
    """Chuông hẹn giờ khi vào bếp; máy chủ gửi thông báo đẩy đúng hạn kể cả khi tắt màn hình."""

    __tablename__ = "user_cook_timers"
    __table_args__ = (Index("ix_user_cook_timers_due", "status", "notified_at", "due_at"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    label: Mapped[str] = mapped_column(String(160))
    recipe_slug: Mapped[str] = mapped_column(String(180))
    # Đường dẫn trang vào bếp để mở lại đúng phiên khi bấm thông báo (chỉ đường dẫn nội bộ).
    return_path: Mapped[str] = mapped_column(String(500))
    status: Mapped[str] = mapped_column(String(16), default="running", server_default="running")
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    due_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class UserPushSubscription(Base):
    __tablename__ = "user_push_subscriptions"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    endpoint: Mapped[str] = mapped_column(String(1000), unique=True)
    p256dh: Mapped[str] = mapped_column(String(200))
    auth: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
