from datetime import datetime
from typing import Literal, cast
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.saved_meals.models import SavedMeal

MealProfile = Literal["balanced", "light", "quick", "family"]
LEGACY_PROFILES: dict[str, MealProfile] = {
    "can_bang": "balanced",
    "thanh_nhe": "light",
    "nhanh_gon": "quick",
    "ca_nha": "family",
}


class SavedMealCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    profile: MealProfile
    dish_ids: list[str] = Field(min_length=3, max_length=6)

    @field_validator("dish_ids")
    @classmethod
    def validate_unique_dishes(cls, value: list[str]) -> list[str]:
        cleaned = [item.strip() for item in value if item.strip()]
        if len(cleaned) != len(value) or len(set(cleaned)) != len(cleaned):
            raise ValueError("Mỗi món trong mâm phải có mã hợp lệ và không trùng nhau.")
        return cleaned


class SavedMealResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    profile: MealProfile
    dish_ids: list[str]
    created_at: datetime

    @classmethod
    def from_saved_meal(cls, meal: SavedMeal) -> "SavedMealResponse":
        return cls(
            id=meal.id,
            profile=LEGACY_PROFILES.get(meal.profile, cast(MealProfile, meal.profile)),
            dish_ids=meal.dish_ids,
            created_at=meal.created_at,
        )
