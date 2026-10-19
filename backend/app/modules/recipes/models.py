from datetime import datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    Uuid,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class Recipe(Base):
    __tablename__ = "mon_an"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    slug: Mapped[str] = mapped_column("duong_dan", String(180), unique=True, index=True)
    name: Mapped[str] = mapped_column("ten", String(180), index=True)
    excerpt: Mapped[str] = mapped_column("mo_ta_ngan", Text)
    region: Mapped[str] = mapped_column("vung_mien", String(32), index=True)
    category: Mapped[str] = mapped_column("loai_mon", String(48), index=True)
    difficulty: Mapped[str] = mapped_column("do_kho", String(24), index=True)
    prep_minutes: Mapped[int] = mapped_column("phut_so_che", Integer)
    cook_minutes: Mapped[int] = mapped_column("phut_nau", Integer)
    base_servings: Mapped[int] = mapped_column("khau_phan_goc", Integer)
    image_path: Mapped[str] = mapped_column("duong_dan_anh", String(500))
    image_alt: Mapped[str] = mapped_column("mo_ta_anh", String(300))
    # Ảnh tách nền do quản trị viên tải lên cho món mới (WebP nền trong suốt).
    image_data: Mapped[bytes | None] = mapped_column("anh_du_lieu", LargeBinary, deferred=True)
    image_content_type: Mapped[str | None] = mapped_column("anh_dinh_dang", String(32))
    serving: Mapped[str] = mapped_column("cach_dung", Text)
    tip: Mapped[str] = mapped_column("mach_nho", Text)
    source_name: Mapped[str] = mapped_column("ten_nguon", String(120))
    source_url: Mapped[str] = mapped_column("duong_dan_nguon", String(500))
    status: Mapped[str] = mapped_column("trang_thai", String(24), default="published", index=True)
    catalog_id: Mapped[str | None] = mapped_column(String(16), unique=True, index=True)
    content: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    search_text: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(
        "ngay_tao", DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        "ngay_cap_nhat", DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    ingredients: Mapped[list["RecipeIngredient"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeIngredient.position",
    )
    steps: Mapped[list["RecipeStep"]] = relationship(
        back_populates="recipe",
        cascade="all, delete-orphan",
        order_by="RecipeStep.position",
    )


class RecipeIngredient(Base):
    __tablename__ = "nguyen_lieu_mon_an"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    recipe_id: Mapped[UUID] = mapped_column(
        "mon_an_id",
        Uuid(as_uuid=True),
        ForeignKey("mon_an.id", ondelete="CASCADE"),
        index=True,
    )
    group_name: Mapped[str] = mapped_column("nhom_nguyen_lieu", String(120))
    name: Mapped[str] = mapped_column("ten_nguyen_lieu", String(180))
    amount: Mapped[Decimal | None] = mapped_column("so_luong", Numeric(10, 2))
    unit: Mapped[str] = mapped_column("don_vi", String(60))
    note: Mapped[str | None] = mapped_column("ghi_chu", String(300))
    scalable: Mapped[bool] = mapped_column("co_the_dieu_chinh", Boolean, default=True)
    position: Mapped[int] = mapped_column("thu_tu", Integer)

    recipe: Mapped[Recipe] = relationship(back_populates="ingredients")


class RecipeStep(Base):
    __tablename__ = "buoc_nau_mon_an"

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    recipe_id: Mapped[UUID] = mapped_column(
        "mon_an_id",
        Uuid(as_uuid=True),
        ForeignKey("mon_an.id", ondelete="CASCADE"),
        index=True,
    )
    step_type: Mapped[str] = mapped_column("loai_buoc", String(24), index=True)
    content: Mapped[str] = mapped_column("noi_dung", Text)
    position: Mapped[int] = mapped_column("thu_tu", Integer)

    recipe: Mapped[Recipe] = relationship(back_populates="steps")
