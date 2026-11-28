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
    """Chỉ bắt buộc tên món; các phần còn lại để trống được, ban nội dung bổ sung khi duyệt."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=2, max_length=180)
    region: SubmissionRegion = "Ba miền"
    category: SubmissionCategory = "Món mặn"
    servings: int = Field(default=4, ge=1, le=30)
    # 0 = người gửi chưa rõ thời gian nấu.
    total_minutes: int = Field(default=0, ge=0, le=1440)
    story: str = Field(default="", max_length=3000)
    ingredients: str = Field(default="", max_length=5000)
    steps: str = Field(default="", max_length=8000)
    submit: bool = True

    @field_validator("name", "story")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return " ".join(value.strip().split())

    @field_validator("name")
    @classmethod
    def require_name(cls, value: str) -> str:
        if len(value) < 2:
            raise ValueError("Tên món cần ít nhất 2 ký tự.")
        return value

    @field_validator("ingredients", "steps")
    @classmethod
    def clean_lines(cls, value: str) -> str:
        return _clean_multiline(value)


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
    # Đường dẫn món trong kho khi đề xuất đã được duyệt và xuất bản.
    recipe_slug: str | None = None
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
