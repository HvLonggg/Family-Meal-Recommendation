from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.modules.auth.schemas import UserResponse


class ProfileUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    full_name: str = Field(min_length=2, max_length=120)

    @field_validator("full_name")
    @classmethod
    def clean_full_name(cls, value: str) -> str:
        cleaned = " ".join(value.strip().split())
        if len(cleaned) < 2:
            raise ValueError("Họ tên cần ít nhất 2 ký tự.")
        return cleaned


class AvatarUploadRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Giao diện đã thu nhỏ ảnh trước khi gửi; giới hạn thô chặn payload bất thường.
    data_url: str = Field(min_length=32, max_length=700_000)


class AccountStats(BaseModel):
    favorites: int
    planned_meals: int
    cooked_meals: int
    stories: int
    published_stories: int
    submissions: int


class AccountOverviewResponse(BaseModel):
    user: UserResponse
    stats: AccountStats
    has_password: bool
    last_login_at: datetime | None
    linked_providers: list[str]
