from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

SupportTopic = Literal["general", "account", "recipe", "planner", "bug", "partnership"]
SupportStatus = Literal["open", "in_progress", "resolved"]


class SupportTicketCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=120)
    email: EmailStr
    topic: SupportTopic = "general"
    subject: str = Field(min_length=4, max_length=160)
    message: str = Field(min_length=20, max_length=4000)
    # Trường bẫy: người thật không nhìn thấy nên luôn để trống.
    website: str = Field(default="", max_length=200)

    @field_validator("name", "subject")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: EmailStr) -> str:
        return str(value).strip().casefold()

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return value.replace("\r\n", "\n").strip()


class SupportTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    email: str
    topic: SupportTopic
    subject: str
    message: str
    status: SupportStatus
    admin_note: str | None
    created_at: datetime
    updated_at: datetime


class SupportTicketListResponse(BaseModel):
    data: list[SupportTicketResponse]
    total: int


class SupportTicketReceipt(BaseModel):
    id: UUID
    reference: str
    message: str


class SupportTicketUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: SupportStatus
    admin_note: str | None = Field(default=None, max_length=500)
