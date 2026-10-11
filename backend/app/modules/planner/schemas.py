from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

MealType = Literal["breakfast", "lunch", "dinner"]
PlanAction = Literal["added", "updated", "removed", "completed", "skipped", "reopened"]
MealCompletionStatus = Literal["planned", "completed", "skipped"]
ShoppingPeriod = Literal["day", "week", "month"]


class PlanItemCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipe_slug: str = Field(min_length=1, max_length=180)
    plan_date: date
    meal_type: MealType
    servings: int = Field(default=4, ge=1, le=30)


class PlanItemUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    servings: int = Field(ge=1, le=30)


class PlanMealCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipe_slugs: list[str] = Field(min_length=1, max_length=30)
    plan_date: date
    meal_type: MealType
    servings: int = Field(default=4, ge=1, le=30)

    @field_validator("recipe_slugs")
    @classmethod
    def validate_unique_slugs(cls, value: list[str]) -> list[str]:
        if len(set(value)) != len(value):
            raise ValueError("Danh sách món không được có món trùng lặp.")
        return value


class PlanMealStatusUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    plan_date: date
    meal_type: MealType
    completion_status: MealCompletionStatus


class PlanIngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    amount: Decimal | None
    unit: str
    note: str | None
    scalable: bool


class PlanRecipeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    slug: str
    name: str
    image_path: str
    image_alt: str
    base_servings: int
    ingredients: list[PlanIngredientResponse]


class PlanItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    plan_date: date
    meal_type: MealType
    servings: int
    completion_status: MealCompletionStatus
    created_at: datetime
    updated_at: datetime
    recipe: PlanRecipeResponse


class PlanEventResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    action: PlanAction
    recipe_slug: str
    recipe_name: str
    image_path: str
    plan_date: date
    meal_type: MealType
    servings: int
    occurred_at: datetime


class PlanHistoryResponse(BaseModel):
    data: list[PlanEventResponse]
    total: int


class PlanMealCreateResponse(BaseModel):
    items: list[PlanItemResponse]
    already_planned: int


class PlanMealHistoryGroup(BaseModel):
    plan_date: date
    meal_type: MealType
    completion_status: MealCompletionStatus
    items: list[PlanItemResponse]


class PlanMealHistoryResponse(BaseModel):
    data: list[PlanMealHistoryGroup]
    total: int


class ShoppingListItemResponse(BaseModel):
    name: str
    category: Literal["ingredient", "seasoning"]
    amount: Decimal | None
    unit: str
    notes: list[str]
    recipe_names: list[str]


class ShoppingDishResponse(BaseModel):
    slug: str
    name: str
    image_path: str
    image_alt: str
    plan_date: date
    meal_type: MealType
    servings: int


class ShoppingListResponse(BaseModel):
    period: ShoppingPeriod
    from_date: date
    to_date: date
    recipe_count: int
    dishes: list[ShoppingDishResponse]
    items: list[ShoppingListItemResponse]
