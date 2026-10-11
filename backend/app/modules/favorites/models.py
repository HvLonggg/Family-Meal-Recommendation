from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, Uuid, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class UserFavoriteRecipe(Base):
    __tablename__ = "user_favorite_recipes"
    __table_args__ = (UniqueConstraint("user_id", "recipe_id", name="uq_user_favorite_recipe"),)

    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    recipe_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("mon_an.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
