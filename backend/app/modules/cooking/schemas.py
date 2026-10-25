from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CookSource = Literal["manual", "planner", "cook_mode"]
COMPANION_CONTEXT_LIMIT = 16_000
TimerStatus = Literal["running", "done", "cancelled"]


class CookLogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipe_slug: str = Field(min_length=1, max_length=180)
    servings: int | None = Field(default=None, ge=1, le=30)
    source: CookSource = "manual"
    plan_item_id: UUID | None = None
    started_at: datetime | None = None
    duration_seconds: int | None = Field(default=None, ge=0, le=86_400)
    note: str | None = Field(default=None, max_length=500)

    @field_validator("note")
    @classmethod
    def strip_note(cls, value: str | None) -> str | None:
        return value.strip() or None if value is not None else None


class CookLogResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recipe_slug: str
    recipe_name: str
    image_path: str
    servings: int
    source: CookSource
    plan_item_id: UUID | None
    started_at: datetime | None
    cooked_at: datetime
    duration_seconds: int | None
    note: str | None


class CookStats(BaseModel):
    total: int
    dishes: int
    last_7_days: int
    total_minutes: int


class CookLogList(BaseModel):
    data: list[CookLogResponse]
    total: int
    stats: CookStats


class RecipeCookSummary(BaseModel):
    recipe_slug: str
    count: int
    last_cooked_at: datetime | None
    last_log_id: UUID | None


class TimerCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Máy khách tự sinh id để chuông vẫn chạy và đồng bộ lại được khi mạng chập chờn.
    id: UUID
    label: str = Field(min_length=1, max_length=160)
    recipe_slug: str = Field(min_length=1, max_length=180)
    seconds: int = Field(ge=5, le=86_400)
    return_path: str = Field(default="/cook", max_length=500)

    @field_validator("return_path")
    @classmethod
    def internal_path(cls, value: str) -> str:
        # Chỉ cho phép đường dẫn trang vào bếp nội bộ: thông báo không thể mở trang lạ.
        if not value.startswith("/cook") or "//" in value or "\\" in value:
            raise ValueError("Đường dẫn không hợp lệ.")
        return value


class TimerUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    action: Literal["snooze", "done", "cancel"]
    # "snooze" đặt lại thời gian còn lại (hoãn chuông hoặc chỉnh "thêm/bớt/đổi thành").
    seconds: int | None = Field(default=None, ge=5, le=86_400)


class TimerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    label: str
    recipe_slug: str
    status: TimerStatus
    started_at: datetime
    due_at: datetime


class PushConfig(BaseModel):
    enabled: bool
    public_key: str | None


class PushKeys(BaseModel):
    p256dh: str = Field(min_length=20, max_length=200)
    auth: str = Field(min_length=8, max_length=64)


class PushSubscriptionIn(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)
    keys: PushKeys


class PushSubscriptionDelete(BaseModel):
    endpoint: str = Field(min_length=10, max_length=1000)


class CompanionStep(BaseModel):
    kind: Literal["ingredients", "preparation", "cooking", "finish"]
    text: str = Field(max_length=1200)


class CompanionTimer(BaseModel):
    # Mã chuông của máy khách: AI chọn theo số thứ tự, máy chủ trả lại đúng mã để nhắm chuông.
    id: str | None = Field(default=None, max_length=64)
    label: str = Field(max_length=160)
    remaining_seconds: int = Field(ge=-86_400, le=86_400)


class CompanionTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(max_length=1000)


class CompanionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    utterance: str = Field(min_length=1, max_length=500)
    language: Literal["vi", "en"] = "vi"
    recipe_name: str = Field(min_length=1, max_length=180)
    servings: int = Field(default=4, ge=1, le=30)
    ingredients: list[str] = Field(default_factory=list, max_length=60)
    steps: list[CompanionStep] = Field(min_length=1, max_length=60)
    step_index: int = Field(ge=0, le=59)
    timers: list[CompanionTimer] = Field(default_factory=list, max_length=6)
    history: list[CompanionTurn] = Field(default_factory=list, max_length=8)
    # Giờ trên máy người dùng (giây kể từ nửa đêm): quy "lúc 7 giờ tối" ra số giây còn lại.
    local_seconds: int | None = Field(default=None, ge=0, le=86_399)

    @field_validator("ingredients")
    @classmethod
    def short_ingredients(cls, value: list[str]) -> list[str]:
        return [item[:200] for item in value]

    @model_validator(mode="after")
    def bounded_context(self) -> "CompanionRequest":
        if self.step_index >= len(self.steps):
            raise ValueError("Bước hiện tại không hợp lệ.")
        # Trần tổng ngữ cảnh gửi cho AI: một công thức thật chỉ vài nghìn ký tự.
        total = sum(len(step.text) for step in self.steps) + sum(map(len, self.ingredients))
        total += sum(len(turn.content) for turn in self.history)
        if total > COMPANION_CONTEXT_LIMIT:
            raise ValueError("Nội dung công thức quá dài.")
        return self


class CompanionAction(BaseModel):
    type: Literal[
        "none",
        "next",
        "back",
        "repeat",
        "goto",
        "wait",
        "set_timer",
        "snooze_timer",
        "stop_timer",
        "cancel_timer",
        "adjust_timer",
        "ingredients",
        "finish",
        "pause_listening",
    ] = "none"
    # set_timer/snooze_timer: số giây; adjust_timer: lượng thêm/bớt hoặc thời gian mới theo `mode`.
    seconds: int | None = None
    step: int | None = None
    label: str | None = None
    mode: Literal["add", "subtract", "set"] | None = None
    # Chuông được nhắm (mã máy khách gửi lên); None khi chỉ có một chuông hoặc máy khách cũ.
    timer_id: str | None = None
    all_timers: bool = False


class CompanionReply(BaseModel):
    # False: AI tắt/lỗi — máy khách tự hiểu câu bằng bộ lệnh cục bộ.
    handled: bool
    reply: str = ""
    action: CompanionAction = Field(default_factory=CompanionAction)
    off_topic: bool = False
