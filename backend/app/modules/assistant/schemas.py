from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

AssistantLanguage = Literal["vi", "en"]
AttachmentKind = Literal["image", "text", "pdf"]
ReplyMode = Literal["ai", "local"]


class AttachmentIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1, max_length=160)
    content_type: str = Field(max_length=80)
    # Data URL của tệp gốc; chỉ dùng cho lượt trả lời này, máy chủ không lưu nội dung tệp.
    data: str = Field(min_length=16, max_length=7_200_000)
    # Ảnh thu nhỏ (tạo ở trình duyệt) để hiển thị lại trong lịch sử trò chuyện.
    thumbnail: str | None = Field(default=None, max_length=160_000)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        return " ".join(value.replace("/", " ").replace("\\", " ").split())[:160]

    @field_validator("thumbnail")
    @classmethod
    def check_thumbnail(cls, value: str | None) -> str | None:
        if value and not value.startswith(("data:image/jpeg;base64,", "data:image/webp;base64,")):
            raise ValueError("Ảnh thu nhỏ không hợp lệ.")
        return value


class HistoryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(max_length=6000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    message: str = Field(default="", max_length=2000)
    conversation_id: UUID | None = None
    language: AssistantLanguage = "vi"
    # Khách chưa đăng nhập gửi kèm vài lượt gần nhất vì máy chủ không lưu hội thoại của họ.
    history: list[HistoryItem] = Field(default_factory=list, max_length=20)
    attachments: list[AttachmentIn] = Field(default_factory=list, max_length=3)
    recent_recipes: list[str] = Field(default_factory=list, max_length=40)

    @field_validator("message")
    @classmethod
    def clean_message(cls, value: str) -> str:
        return value.strip()

    @model_validator(mode="after")
    def needs_content(self) -> "ChatRequest":
        if not self.message and not self.attachments:
            raise ValueError("Hãy nhập tin nhắn hoặc đính kèm tệp.")
        return self


class RecipeCard(BaseModel):
    slug: str
    name: str
    image_path: str
    region: str
    category: str
    minutes: int
    difficulty: str


class ActionLink(BaseModel):
    label: str
    to: str


class AttachmentMeta(BaseModel):
    name: str
    content_type: str
    size: int
    kind: AttachmentKind
    thumbnail: str | None = None


class MessageOut(BaseModel):
    id: str
    role: Literal["user", "assistant"]
    content: str
    created_at: datetime
    recipes: list[RecipeCard] = Field(default_factory=list)
    suggestions: list[str] = Field(default_factory=list)
    actions: list[ActionLink] = Field(default_factory=list)
    attachments: list[AttachmentMeta] = Field(default_factory=list)
    mode: ReplyMode | None = None


class ChatResponse(BaseModel):
    conversation_id: UUID | None
    title: str | None
    user_message: MessageOut
    reply: MessageOut


class ConversationSummary(BaseModel):
    id: UUID
    title: str
    preview: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class ConversationList(BaseModel):
    data: list[ConversationSummary]


class ConversationDetail(BaseModel):
    id: UUID
    title: str
    created_at: datetime
    updated_at: datetime
    messages: list[MessageOut]


class ConversationRename(BaseModel):
    model_config = ConfigDict(extra="forbid")

    title: str = Field(min_length=1, max_length=120)

    @field_validator("title")
    @classmethod
    def clean_title(cls, value: str) -> str:
        cleaned = " ".join(value.split())
        if not cleaned:
            raise ValueError("Tên cuộc trò chuyện không được để trống.")
        return cleaned


class AssistantStatus(BaseModel):
    mode: ReplyMode
    name: str
    accepts: list[str]
    max_attachments: int
