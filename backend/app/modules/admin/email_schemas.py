from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

MealType = Literal["breakfast", "lunch", "dinner"]
MealEmailStatus = Literal["sending", "sent", "failed"]
RecipientSource = Literal["user", "support", "new"]


class MealSuggestionSendRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    recipient_emails: list[EmailStr] = Field(min_length=1, max_length=10)
    # Tên lời chào cho email chưa có tài khoản; để trống thì email chào “bạn”.
    recipient_names: dict[str, str] = Field(default_factory=dict, max_length=10)
    meal_type: MealType
    recipe_slugs: list[str] = Field(min_length=1, max_length=4)
    subject: str = Field(min_length=4, max_length=180)
    intro_message: str = Field(min_length=10, max_length=1200)
    closing_message: str = Field(default="", max_length=500)

    @field_validator("recipient_emails")
    @classmethod
    def normalize_recipients(cls, value: list[EmailStr]) -> list[str]:
        normalized = [str(email).strip().casefold() for email in value]
        if len(set(normalized)) != len(normalized):
            raise ValueError("Email người nhận không được lặp lại.")
        return normalized

    @field_validator("recipient_names")
    @classmethod
    def clean_recipient_names(cls, value: dict[str, str]) -> dict[str, str]:
        cleaned: dict[str, str] = {}
        for email, name in value.items():
            display_name = " ".join(name.strip().split())
            if len(display_name) > 80:
                raise ValueError("Tên người nhận tối đa 80 ký tự.")
            if display_name:
                cleaned[email.strip().casefold()] = display_name
        return cleaned

    @model_validator(mode="after")
    def names_match_recipients(self) -> "MealSuggestionSendRequest":
        unknown = set(self.recipient_names) - set(self.recipient_emails)
        if unknown:
            raise ValueError("Tên người nhận phải gắn với một email trong danh sách gửi.")
        return self

    @field_validator("recipe_slugs")
    @classmethod
    def unique_recipes(cls, value: list[str]) -> list[str]:
        cleaned = [slug.strip() for slug in value]
        if any(not slug for slug in cleaned) or len(set(cleaned)) != len(cleaned):
            raise ValueError("Danh sách món không hợp lệ hoặc có món bị lặp.")
        return cleaned

    @field_validator("subject")
    @classmethod
    def clean_subject(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("intro_message", "closing_message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return value.replace("\r\n", "\n").strip()


class MealSuggestionEmailResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    recipient_email: EmailStr
    recipient_name: str
    meal_type: MealType
    subject: str
    intro_message: str
    closing_message: str
    recipe_data: list[dict[str, str]]
    status: MealEmailStatus
    attempts: int
    error_message: str | None
    sent_at: datetime | None
    created_at: datetime


class MealSuggestionEmailListResponse(BaseModel):
    data: list[MealSuggestionEmailResponse]
    total: int


class MealSuggestionSendResponse(BaseModel):
    data: list[MealSuggestionEmailResponse]
    sent: int
    failed: int
    # Số email đã xếp hàng gửi ở nền; trạng thái cuối xem trong lịch sử.
    queued: int = 0


class MealSuggestionRecipient(BaseModel):
    email: EmailStr
    name: str
    last_sent_at: datetime | None
    sent_count: int


class MealSuggestionRecipientListResponse(BaseModel):
    data: list[MealSuggestionRecipient]
    total: int


class MealSuggestionRecipientLookup(BaseModel):
    email: EmailStr
    name: str | None
    source: RecipientSource
