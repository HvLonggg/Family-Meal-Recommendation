from datetime import datetime
from uuid import UUID

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


class AccountDeleteRequest(BaseModel):
    """Xác nhận xóa tài khoản: mật khẩu (nếu có) hoặc mã OTP email, kèm cụm xác nhận gõ tay."""

    model_config = ConfigDict(extra="forbid")

    confirmation: str = Field(min_length=1, max_length=16)
    password: str | None = Field(default=None, max_length=128)
    challenge_id: UUID | None = None
    code: str | None = Field(default=None, pattern=r"^\d{5}$")

    @field_validator("confirmation")
    @classmethod
    def require_phrase(cls, value: str) -> str:
        if value.strip().upper() not in {"XÓA", "XOA", "DELETE"}:
            raise ValueError("Hãy gõ XÓA để xác nhận.")
        return value
