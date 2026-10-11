from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import JSON, DateTime, ForeignKey, String, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedMeal(Base):
    __tablename__ = "mam_com_da_luu"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        "nguoi_dung_id",
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        index=True,
    )
    profile: Mapped[str] = mapped_column("tieu_chuan", String(24), index=True)
    dish_ids: Mapped[list[str]] = mapped_column("ma_mon_an", JSON)
    created_at: Mapped[datetime] = mapped_column(
        "ngay_tao", DateTime(timezone=True), server_default=func.now(), index=True
    )
