from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class IngredientResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    group_name: str
    name: str
    amount: Decimal | None
    unit: str
    note: str | None
    scalable: bool
    position: int


class StepResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    step_type: str
    content: str
    position: int


class RecipeSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    name: str
    excerpt: str
    region: str
    category: str
    difficulty: str
    prep_minutes: int
    cook_minutes: int
    base_servings: int
    image_path: str
    image_alt: str


class RecipeDetailResponse(RecipeSummaryResponse):
    serving: str
    tip: str
    source_name: str
    source_url: str
    ingredients: list[IngredientResponse]
    steps: list[StepResponse]


class RecipeListResponse(BaseModel):
    data: list[RecipeSummaryResponse]
    total: int
