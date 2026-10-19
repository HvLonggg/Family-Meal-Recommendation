from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, ValidationInfo, field_validator

from app.modules.auth.schemas import validate_password_strength

UserRole = Literal["user", "admin"]
UserStatus = Literal["active", "locked"]
RecipeStatus = Literal["published", "hidden", "draft"]


class OverviewCounts(BaseModel):
    users: int
    active_users: int
    admins: int
    new_users_7d: int
    recipes_published: int
    recipes_hidden: int
    plan_items: int
    planners: int
    articles_published: int
    articles_pending: int
    submissions_pending: int
    tickets_open: int


class RecentUser(BaseModel):
    id: UUID
    full_name: str
    email: str | None
    created_at: datetime


class AdminOverviewResponse(BaseModel):
    counts: OverviewCounts
    recent_users: list[RecentUser]


class AdminUserRow(BaseModel):
    id: UUID
    full_name: str
    email: str | None
    role: UserRole
    status: str
    avatar_url: str | None
    created_at: datetime
    last_login_at: datetime | None
    favorites: int
    plan_items: int
    stories: int


class AdminUserListResponse(BaseModel):
    data: list[AdminUserRow]
    total: int


class AdminUserUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: UserRole | None = None
    status: UserStatus | None = None


class AdminUserCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)
    role: UserRole = "user"

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()

    @field_validator("password")
    @classmethod
    def check_password(cls, value: str) -> str:
        return validate_password_strength(value)


class AdminPlanItem(BaseModel):
    id: UUID
    plan_date: date
    meal_type: str
    servings: int
    completion_status: str
    recipe_slug: str
    recipe_name: str
    image_path: str


class AdminUserPlansResponse(BaseModel):
    user: AdminUserRow
    data: list[AdminPlanItem]
    total: int


class AdminPlannerRow(BaseModel):
    user_id: UUID
    full_name: str
    email: str | None
    avatar_url: str | None
    total_items: int
    upcoming_items: int
    completed_items: int
    first_date: date | None
    last_date: date | None


class AdminPlannerListResponse(BaseModel):
    data: list[AdminPlannerRow]
    total: int


class AdminRecipeRow(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    slug: str
    catalog_id: str | None
    name: str
    excerpt: str
    region: str
    category: str
    difficulty: str
    prep_minutes: int
    cook_minutes: int
    base_servings: int
    image_path: str
    status: str
    tip: str
    serving: str
    updated_at: datetime


class AdminRecipeListResponse(BaseModel):
    data: list[AdminRecipeRow]
    total: int


class AdminRecipeUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=180)
    excerpt: str = Field(min_length=5, max_length=2000)
    region: Literal["Bắc", "Trung", "Nam", "Ba miền"]
    category: Literal[
        "Món mặn",
        "Món canh",
        "Món rau",
        "Món chay",
        "Món nước",
        "Món ăn sáng",
        "Món tráng miệng",
        "Món ăn kèm",
    ]
    difficulty: Literal["Dễ", "Vừa", "Trung bình", "Khó"]
    prep_minutes: int = Field(ge=0, le=1440)
    cook_minutes: int = Field(ge=0, le=1440)
    base_servings: int = Field(ge=1, le=30)
    status: RecipeStatus
    tip: str = Field(default="", max_length=2000)
    serving: str = Field(default="", max_length=2000)

    @field_validator("name", "excerpt", "tip", "serving")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return " ".join(value.strip().split())


IngredientGroup = Literal["Nguyên liệu chính", "Gia vị", "Nước và chất lỏng", "Hỗ trợ chế biến"]


class AdminRecipeIngredientInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    group_name: IngredientGroup = "Nguyên liệu chính"
    name: str = Field(min_length=1, max_length=180)
    amount: Decimal | None = Field(default=None, ge=0, le=100000)
    unit: str = Field(default="", max_length=60)
    note: str | None = Field(default=None, max_length=300)

    @field_validator("name", "unit")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("note")
    @classmethod
    def clean_note(cls, value: str | None) -> str | None:
        cleaned = " ".join((value or "").strip().split())
        return cleaned or None


class AdminRecipeCreate(AdminRecipeUpdate):
    """Món mới do quản trị viên nhập; ảnh bắt buộc là ảnh món đã tách nền."""

    image: str = Field(min_length=32, max_length=12_000_000)
    image_alt: str = Field(default="", max_length=300)
    ingredients: list[AdminRecipeIngredientInput] = Field(min_length=1, max_length=60)
    preparation_steps: list[str] = Field(default_factory=list, max_length=30)
    cooking_steps: list[str] = Field(min_length=1, max_length=30)

    @field_validator("image_alt")
    @classmethod
    def clean_alt(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("preparation_steps", "cooking_steps")
    @classmethod
    def clean_steps(cls, steps: list[str], info: ValidationInfo) -> list[str]:
        cleaned = [" ".join(step.strip().split()) for step in steps]
        if any(len(step) > 2000 for step in cleaned):
            raise ValueError("Mỗi bước tối đa 2000 ký tự.")
        cleaned = [step for step in cleaned if step]
        if info.field_name == "cooking_steps" and not cleaned:
            raise ValueError("Cần ít nhất một bước nấu.")
        return cleaned


class AdminRecipeImageUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    image: str = Field(min_length=32, max_length=12_000_000)


class AdminRecipeEngagement(BaseModel):
    favorites: int = 0
    planned: int = 0
    cooked: int = 0


class AdminRecipeEngagementRow(AdminRecipeRow, AdminRecipeEngagement):
    pass


class AdminRecipeEngagementListResponse(BaseModel):
    data: list[AdminRecipeEngagementRow]
    total: int


class DailyCount(BaseModel):
    day: date
    count: int


class RankedRecipe(BaseModel):
    slug: str
    name: str
    image_path: str
    region: str
    category: str
    favorites: int
    planned: int
    cooked: int


class AdminInsightsResponse(BaseModel):
    activity: list[DailyCount]
    signups: list[DailyCount]
    top_recipes: list[RankedRecipe]


class TasteSlice(BaseModel):
    label: str
    count: int


class AdminUserStats(BaseModel):
    plan_total: int
    plan_upcoming: int
    plan_completed: int
    plan_skipped: int
    cooked_recipes: int
    favorites: int
    stories: int
    submissions: int
    saved_meals: int
    tickets: int
    active_sessions: int


class AdminUserDetailResponse(BaseModel):
    user: AdminUserRow
    email_verified: bool
    providers: list[str]
    last_active_at: datetime | None
    stats: AdminUserStats
    regions: list[TasteSlice]
    categories: list[TasteSlice]
    activity: list[DailyCount]
    top_cooked: list["AdminCookedRecipe"]


class AdminFavoriteRecipe(BaseModel):
    slug: str
    name: str
    image_path: str
    region: str
    category: str
    status: str
    favorited_at: datetime
    cooked_times: int


class AdminCookedRecipe(BaseModel):
    slug: str
    name: str
    image_path: str
    region: str
    category: str
    times: int
    servings: int
    last_cooked: date


class AdminFavoriteListResponse(BaseModel):
    data: list[AdminFavoriteRecipe]
    total: int


class AdminCookedListResponse(BaseModel):
    data: list[AdminCookedRecipe]
    total: int


ActivityKind = Literal["plan", "favorite", "story", "submission", "saved_meal", "support"]


class AdminActivityEvent(BaseModel):
    id: str
    kind: ActivityKind
    action: str
    title: str
    occurred_at: datetime
    recipe_slug: str | None = None
    image_path: str | None = None
    status: str | None = None
    plan_date: date | None = None
    meal_type: str | None = None
    servings: int | None = None
    count: int | None = None


class AdminActivityResponse(BaseModel):
    data: list[AdminActivityEvent]
    next_before: datetime | None


class AdminRecipeFan(BaseModel):
    user_id: UUID
    full_name: str
    email: str | None
    avatar_url: str | None
    occurred_at: datetime
    times: int | None = None


class AdminRecipeInsightsResponse(BaseModel):
    recipe: AdminRecipeEngagementRow
    upcoming: int
    skipped: int
    recent_favorites: list[AdminRecipeFan]
    top_cooks: list[AdminRecipeFan]


AdminUserDetailResponse.model_rebuild()
