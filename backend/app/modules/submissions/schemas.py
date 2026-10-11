from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

SubmissionStatus = Literal["draft", "pending", "approved", "rejected"]
SubmissionRegion = Literal["Bắc", "Trung", "Nam", "Ba miền"]
SubmissionCategory = Literal[
    "Món mặn",
    "Món canh",
    "Món rau",
    "Món chay",
    "Món nước",
    "Món ăn sáng",
    "Món tráng miệng",
    "Món ăn kèm",
]


def _clean_multiline(value: str) -> str:
    return "\n".join(
        line.strip() for line in value.replace("\r\n", "\n").split("\n") if line.strip()
    )


class SubmissionWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=180)
    region: SubmissionRegion = "Ba miền"
    category: SubmissionCategory = "Món mặn"
    servings: int = Field(default=4, ge=1, le=30)
    total_minutes: int = Field(default=0, ge=0, le=1440)
    story: str = Field(min_length=10, max_length=3000)
    ingredients: str = Field(min_length=5, max_length=5000)
    steps: str = Field(min_length=10, max_length=8000)
    submit: bool = True

    @field_validator("name", "story")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("ingredients", "steps")
    @classmethod
    def clean_lines(cls, value: str) -> str:
        cleaned = _clean_multiline(value)
        if len(cleaned) < 5:
            raise ValueError("Vui lòng nhập nội dung chi tiết hơn.")
        return cleaned


class SubmissionSubmitter(BaseModel):
    id: UUID
    full_name: str
    email: str | None


class SubmissionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    region: SubmissionRegion
    category: SubmissionCategory
    servings: int
    total_minutes: int
    story: str
    ingredients: str
    steps: str
    status: SubmissionStatus
    admin_note: str | None
    created_at: datetime
    updated_at: datetime


class AdminSubmissionResponse(SubmissionResponse):
    submitter: SubmissionSubmitter


class SubmissionListResponse(BaseModel):
    data: list[SubmissionResponse]
    total: int


class AdminSubmissionListResponse(BaseModel):
    data: list[AdminSubmissionResponse]
    total: int


class SubmissionReviewRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: Literal["pending", "approved", "rejected"]
    admin_note: str | None = Field(default=None, max_length=300)
