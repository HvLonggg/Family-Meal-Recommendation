"""Thiết lập cá nhân của tài khoản, có phần chỉ dành cho quản trị viên."""

from decimal import ROUND_HALF_UP, Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator, model_validator

Language = Literal["vi", "en"]
Appetite = Literal["light", "normal", "big"]
DietaryTag = Literal[
    "vegetarian",
    "no_pork",
    "no_beef",
    "no_seafood",
    "low_salt",
    "low_sugar",
    "less_oil",
]
Region = Literal["Bắc", "Trung", "Nam"]

APPETITE_FACTORS: dict[str, float] = {"light": 0.8, "normal": 1.0, "big": 1.25}
ADMIN_ONLY_FIELDS = ("admin_notify_pending", "admin_landing")


def portion_factor(age: int, appetite: str = "normal") -> float:
    """Quy đổi một thành viên thành số suất ăn người lớn tương đương."""
    if age < 3:
        base = 0.3
    elif age <= 6:
        base = 0.5
    elif age <= 12:
        base = 0.7
    elif age < 65:
        base = 1.0
    else:
        base = 0.8
    return base * APPETITE_FACTORS.get(appetite, 1.0)


class HouseholdMember(BaseModel):
    model_config = ConfigDict(extra="ignore")

    label: str = Field(min_length=1, max_length=40)
    age: int = Field(ge=0, le=120)
    appetite: Appetite = "normal"

    @field_validator("label")
    @classmethod
    def clean_label(cls, value: str) -> str:
        return " ".join(value.strip().split())


def _sorted_in_range(value: list[int], low: int, high: int, label: str) -> list[int]:
    if any(item < low or item > high for item in value):
        raise ValueError(f"{label} phải nằm trong khoảng {low}–{high}.")
    return sorted(set(value))


class UserPreferences(BaseModel):
    """Giá trị đọc ra luôn đầy đủ mặc định để giao diện không phải đoán."""

    model_config = ConfigDict(extra="ignore")

    language: Language = "vi"
    household_description: str = Field(default="", max_length=300)
    household_members: list[HouseholdMember] = Field(default_factory=list, max_length=12)
    servings_mode: Literal["auto", "manual"] = "auto"
    manual_servings: int = Field(default=4, ge=1, le=20)
    dietary_tags: list[DietaryTag] = Field(default_factory=list, max_length=7)
    allergies: str = Field(default="", max_length=200)
    spice_level: Literal["mild", "medium", "hot"] = "medium"
    preferred_regions: list[Region] = Field(default_factory=list, max_length=3)
    max_cooking_minutes: int = Field(default=0, ge=0, le=240)
    week_start: Literal["monday", "sunday"] = "monday"
    calendar_mode: Literal["solar", "lunar"] = "solar"
    # Mặc định tắt: chỉ tự đánh dấu mùng 1/rằm khi người dùng tự bật.
    vegetarian_lunar_days: bool = False
    # Lịch ăn chay cố định. Ngày trong tuần theo ISO: 0 = Thứ Hai ... 6 = Chủ Nhật.
    vegetarian_month_days: list[int] = Field(default_factory=list, max_length=31)
    vegetarian_weekdays: list[int] = Field(default_factory=list, max_length=7)
    # Rỗng = áp dụng mọi tháng.
    vegetarian_months: list[int] = Field(default_factory=list, max_length=12)
    email_meal_plan_reminders: bool = True
    # Email nhắc lên kế hoạch tuần mới, gửi 21:00 tối Chủ nhật (giờ Việt Nam).
    weekly_reminder_email: bool = True
    text_size: Literal["normal", "large"] = "normal"
    reduce_motion: bool = False
    notify_weekly_plan: bool = True
    notify_story_updates: bool = True
    show_name_on_stories: bool = True
    # Chú Rồng trả treo, cà khịa (vẫn trả lời đúng); tắt thì dí dỏm bình thường.
    assistant_sassy: bool = False
    # Số hàng món mỗi trang ở kho món; None = theo thiết bị hoặc mặc định của giao diện.
    catalog_rows: int | None = Field(default=None, ge=3, le=5)
    admin_notify_pending: bool = True
    admin_landing: Literal["home", "admin"] = "admin"

    @model_validator(mode="before")
    @classmethod
    def inherit_legacy_weekly_toggle(cls, data: Any) -> Any:
        # Nút "Nhắc kế hoạch tuần" cũ (notify_weekly_plan) chưa từng gửi email; ai đã tắt nút
        # đó thì vẫn coi là không muốn nhận email tuần cho đến khi tự bật lại.
        if (
            isinstance(data, dict)
            and "weekly_reminder_email" not in data
            and data.get("notify_weekly_plan") is False
        ):
            return {**data, "weekly_reminder_email": False}
        return data

    @field_validator("household_description", "allergies")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("dietary_tags", "preferred_regions")
    @classmethod
    def unique_items(cls, value: list[str]) -> list[str]:
        return list(dict.fromkeys(value))

    @field_validator("vegetarian_month_days")
    @classmethod
    def valid_month_days(cls, value: list[int]) -> list[int]:
        return _sorted_in_range(value, 1, 31, "Ngày trong tháng")

    @field_validator("vegetarian_weekdays")
    @classmethod
    def valid_weekdays(cls, value: list[int]) -> list[int]:
        return _sorted_in_range(value, 0, 6, "Thứ trong tuần")

    @field_validator("vegetarian_months")
    @classmethod
    def valid_months(cls, value: list[int]) -> list[int]:
        return _sorted_in_range(value, 1, 12, "Tháng")

    def household_portions(self) -> float:
        return sum(portion_factor(member.age, member.appetite) for member in self.household_members)

    def default_servings(self) -> int:
        if self.servings_mode == "manual" or not self.household_members:
            return self.manual_servings
        rounded = Decimal(str(self.household_portions())).quantize(Decimal("1"), ROUND_HALF_UP)
        return max(1, min(20, int(rounded)))


class PreferencesResponse(UserPreferences):
    computed_portions: float = 0
    computed_servings: int = 4


def to_response(preferences: UserPreferences) -> PreferencesResponse:
    return PreferencesResponse(
        **preferences.model_dump(),
        computed_portions=round(preferences.household_portions(), 2),
        computed_servings=preferences.default_servings(),
    )


def read_preferences(raw: dict[str, Any] | None) -> UserPreferences:
    """Đọc dữ liệu đã lưu; trường cũ không còn hợp lệ sẽ quay về giá trị mặc định."""
    raw = raw or {}
    try:
        return UserPreferences.model_validate(raw)
    except ValidationError:
        cleaned: dict[str, Any] = {}
        for key, value in raw.items():
            if key not in UserPreferences.model_fields:
                continue
            try:
                UserPreferences.model_validate({key: value})
            except ValidationError:
                continue
            cleaned[key] = value
        return UserPreferences.model_validate(cleaned)


def scope_preferences_for_role(
    incoming: UserPreferences, current: UserPreferences, role: str
) -> UserPreferences:
    """Người dùng thường không thể ghi các thiết lập của khu quản trị."""
    if role == "admin":
        return incoming
    protected = {field: getattr(current, field) for field in ADMIN_ONLY_FIELDS}
    return incoming.model_copy(update=protected)
