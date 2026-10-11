from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

ArticleKind = Literal["editorial", "story"]
ArticleStatus = Literal["draft", "pending", "published", "rejected", "hidden"]
ArticleCategory = Literal["kitchen_story", "tips", "ingredients", "culture", "events"]
ModerationStatus = Literal["pending", "published", "rejected", "hidden"]


def _clean_text(value: str) -> str:
    return " ".join(value.strip().split())


def _clean_body(value: str) -> str:
    lines = [line.rstrip() for line in value.replace("\r\n", "\n").strip().split("\n")]
    cleaned: list[str] = []
    for line in lines:
        if not line and cleaned and not cleaned[-1]:
            continue
        cleaned.append(line)
    return "\n".join(cleaned)


class ArticleAuthor(BaseModel):
    """`display` cho phép giao diện tự dịch tên hiển thị của ban biên tập hoặc tác giả ẩn danh."""

    id: UUID | None
    full_name: str
    avatar_url: str | None = None
    display: Literal["member", "editorial", "anonymous"] = "member"


class ArticleSummary(BaseModel):
    id: UUID
    slug: str
    kind: ArticleKind
    title: str
    excerpt: str
    category: ArticleCategory
    recipe_slug: str | None
    cover_url: str | None
    status: ArticleStatus
    moderation_note: str | None
    reading_minutes: int
    published_at: datetime | None
    created_at: datetime
    updated_at: datetime
    author: ArticleAuthor


class ArticleDetail(ArticleSummary):
    body: str


class ArticleListResponse(BaseModel):
    data: list[ArticleSummary]
    total: int


class ArticleWriteBase(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=5, max_length=200)
    excerpt: str = Field(min_length=10, max_length=400)
    body: str = Field(min_length=50, max_length=20_000)
    category: ArticleCategory = "kitchen_story"
    recipe_slug: str | None = Field(default=None, max_length=180)
    cover_image: str | None = Field(default=None, max_length=1_200_000)
    kind: ArticleKind = "story"
    submit: bool = True
    # Giao diện dùng chung một biểu mẫu cho tạo mới và chỉnh sửa; khi tạo mới trường này bị bỏ qua.
    remove_cover: bool = False

    @field_validator("title", "excerpt")
    @classmethod
    def clean_text(cls, value: str) -> str:
        return _clean_text(value)

    @field_validator("body")
    @classmethod
    def clean_body(cls, value: str) -> str:
        cleaned = _clean_body(value)
        if len(cleaned) < 50:
            raise ValueError("Nội dung cần ít nhất 50 ký tự.")
        return cleaned

    @field_validator("recipe_slug")
    @classmethod
    def clean_slug(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None


class ArticleCreate(ArticleWriteBase):
    pass


class ArticleUpdate(ArticleWriteBase):
    pass


class ArticleModerationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    status: ModerationStatus
    note: str | None = Field(default=None, max_length=300)
