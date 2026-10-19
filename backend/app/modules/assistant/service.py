from __future__ import annotations

import base64
import binascii
import re
import threading
import time
from collections import defaultdict, deque
from datetime import UTC, datetime
from uuid import UUID, uuid4

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.core.images import InvalidImageError, decode_image_data_url
from app.modules.assistant import ai, engine
from app.modules.assistant.models import AssistantConversation, AssistantMessage
from app.modules.assistant.schemas import (
    ActionLink,
    AttachmentIn,
    AttachmentMeta,
    ChatRequest,
    ChatResponse,
    ConversationDetail,
    ConversationSummary,
    MessageOut,
    RecipeCard,
)
from app.modules.auth.models import User
from app.modules.recipes.search import normalize_search

IMAGE_MAX_BYTES = 5 * 1024 * 1024
PDF_MAX_BYTES = 5 * 1024 * 1024
TEXT_MAX_BYTES = 200 * 1024
TEXT_CONTEXT_CHARS = 6000
RATE_PER_MINUTE = 15
RATE_PER_DAY = 300
ACCEPTS = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "application/pdf",
    "text/plain",
    "text/csv",
    "text/markdown",
]
_DATA_URL = re.compile(r"^data:([\w.+-]+/[\w.+-]+)(?:;[\w=-]+)*;base64,([A-Za-z0-9+/=\s]+)$")


class AssistantRateLimitError(DomainError):
    code = "ASSISTANT_RATE_LIMITED"
    status_code = status.HTTP_429_TOO_MANY_REQUESTS


class AssistantAttachmentError(DomainError):
    code = "ASSISTANT_ATTACHMENT_INVALID"


class ConversationNotFoundError(DomainError):
    code = "RESOURCE_NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Giới hạn tần suất trong bộ nhớ tiến trình (đủ cho một máy chủ nhỏ).
# ---------------------------------------------------------------------------
_rate_lock = threading.Lock()
_rate_hits: dict[str, deque[float]] = defaultdict(deque)


def check_rate_limit(key: str, *, now: float | None = None) -> None:
    moment = now if now is not None else time.monotonic()
    with _rate_lock:
        hits = _rate_hits[key]
        while hits and moment - hits[0] > 86_400:
            hits.popleft()
        last_minute = sum(1 for stamp in hits if moment - stamp <= 60)
        if last_minute >= RATE_PER_MINUTE or len(hits) >= RATE_PER_DAY:
            raise AssistantRateLimitError(
                "Chú Rồng cần nghỉ một chút, bạn chờ ít giây rồi hỏi tiếp nhé."
            )
        hits.append(moment)


def reset_rate_limits() -> None:
    with _rate_lock:
        _rate_hits.clear()


# ---------------------------------------------------------------------------
# Tệp đính kèm: chỉ đọc trong lượt hiện tại, không lưu nội dung gốc.
# ---------------------------------------------------------------------------
def _process_attachment(item: AttachmentIn) -> tuple[AttachmentMeta, ai.AttachmentPayload]:
    match = _DATA_URL.match(item.data.strip())
    if match is None:
        raise AssistantAttachmentError(f"Không đọc được tệp {item.name}.")
    media_type = match.group(1).lower()
    if media_type.startswith("image/"):
        try:
            image = decode_image_data_url(item.data, max_bytes=IMAGE_MAX_BYTES)
        except InvalidImageError as exc:
            raise AssistantAttachmentError(f"{item.name}: {exc}") from exc
        meta = AttachmentMeta(
            name=item.name,
            content_type=image.content_type,
            size=len(image.data),
            kind="image",
            thumbnail=item.thumbnail,
        )
        payload = ai.AttachmentPayload(
            kind="image",
            media_type=image.content_type,
            base64_data=base64.standard_b64encode(image.data).decode("ascii"),
            name=item.name,
        )
        return meta, payload
    try:
        raw = base64.b64decode(match.group(2), validate=False)
    except (binascii.Error, ValueError) as exc:
        raise AssistantAttachmentError(f"Không đọc được tệp {item.name}.") from exc
    if media_type == "application/pdf":
        if len(raw) > PDF_MAX_BYTES or not raw.startswith(b"%PDF"):
            raise AssistantAttachmentError(f"{item.name}: PDF tối đa 5 MB và phải đúng định dạng.")
        meta = AttachmentMeta(name=item.name, content_type=media_type, size=len(raw), kind="pdf")
        payload = ai.AttachmentPayload(
            kind="pdf",
            media_type=media_type,
            base64_data=base64.standard_b64encode(raw).decode("ascii"),
            name=item.name,
        )
        return meta, payload
    if media_type in ("text/plain", "text/csv", "text/markdown", "text/x-markdown"):
        if len(raw) > TEXT_MAX_BYTES:
            raise AssistantAttachmentError(f"{item.name}: tệp văn bản tối đa 200 KB.")
        text = raw.decode("utf-8", errors="replace").replace("\x00", "")[:TEXT_CONTEXT_CHARS]
        meta = AttachmentMeta(name=item.name, content_type="text/plain", size=len(raw), kind="text")
        return meta, ai.AttachmentPayload(
            kind="text", media_type="text/plain", base64_data="", text=text, name=item.name
        )
    raise AssistantAttachmentError(
        f"{item.name}: Chú Rồng nhận ảnh (JPG, PNG, WebP), PDF hoặc tệp văn bản (.txt, .csv, .md)."
    )


# ---------------------------------------------------------------------------
# Chuyển đổi.
# ---------------------------------------------------------------------------
def _card(entry: engine.RecipeEntry) -> RecipeCard:
    return RecipeCard(
        slug=entry.slug,
        name=entry.name,
        image_path=entry.image_path,
        region=entry.region,
        category=entry.category,
        minutes=entry.minutes,
        difficulty=entry.difficulty,
    )


def _message_out(message: AssistantMessage) -> MessageOut:
    payload = message.payload or {}
    return MessageOut(
        id=str(message.id),
        role="assistant" if message.role == "assistant" else "user",
        content=message.content,
        created_at=message.created_at,
        recipes=[RecipeCard.model_validate(item) for item in payload.get("recipes", [])],
        suggestions=list(payload.get("suggestions", [])),
        actions=[ActionLink.model_validate(item) for item in payload.get("actions", [])],
        attachments=[
            AttachmentMeta.model_validate(item) for item in payload.get("attachments", [])
        ],
        mode=payload.get("mode"),
    )


def _title_from(message: str, attachments: list[AttachmentMeta], language: str) -> str:
    text = " ".join(message.split())
    if not text and attachments:
        text = ("Tệp: " if language == "vi" else "File: ") + attachments[0].name
    if len(text) > 60:
        text = text[:57].rstrip() + "…"
    return text or ("Cuộc trò chuyện mới" if language == "vi" else "New chat")


def _mentioned(reply_text: str, candidates: list[engine.RecipeEntry]) -> list[engine.RecipeEntry]:
    text = normalize_search(reply_text)
    found: list[tuple[int, engine.RecipeEntry]] = []
    for entry in candidates:
        position = text.find(entry.name_norm)
        if entry.name_norm and position >= 0:
            found.append((position, entry))
    found.sort(key=lambda item: item[0])
    seen: set[str] = set()
    ordered: list[engine.RecipeEntry] = []
    for _, entry in found:
        if entry.slug not in seen:
            seen.add(entry.slug)
            ordered.append(entry)
    return ordered[:4]


# ---------------------------------------------------------------------------
# Hội thoại.
# ---------------------------------------------------------------------------
def _get_conversation(session: Session, user: User, conversation_id: UUID) -> AssistantConversation:
    conversation = session.get(AssistantConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise ConversationNotFoundError("Không tìm thấy cuộc trò chuyện.")
    return conversation


def chat(session: Session, *, payload: ChatRequest, user: User | None) -> ChatResponse:
    processed = [_process_attachment(item) for item in payload.attachments]
    metas = [meta for meta, _ in processed]
    files = [file for _, file in processed]
    attachment_text = "\n".join(file.text for file in files if file.kind == "text")

    conversation: AssistantConversation | None = None
    history: list[tuple[str, str]]
    avoid = set(payload.recent_recipes)
    if user is not None:
        if payload.conversation_id:
            conversation = _get_conversation(session, user, payload.conversation_id)
        else:
            conversation = AssistantConversation(
                user_id=user.id, title=_title_from(payload.message, metas, payload.language)
            )
            session.add(conversation)
            session.flush()
        previous = list(
            session.scalars(
                select(AssistantMessage)
                .where(AssistantMessage.conversation_id == conversation.id)
                .order_by(AssistantMessage.created_at.desc())
                .limit(12)
            )
        )[::-1]
        history = [(item.role, item.content) for item in previous]
        for item in previous:
            avoid.update(card.get("slug", "") for card in (item.payload or {}).get("recipes", []))
    else:
        history = [(item.role, item.content) for item in payload.history]

    catalog = engine.load_catalog(session)
    local = engine.reply(
        payload.message,
        catalog,
        language=payload.language,
        avoid=avoid,
        attachment_text=attachment_text,
        has_images=any(file.kind in ("image", "pdf") for file in files),
    )
    content = local.content
    recipes = local.recipes
    mode: str = "local"
    if ai.ai_enabled():
        candidates = engine.candidate_recipes(
            f"{payload.message}\n{attachment_text}", catalog, avoid=avoid
        )
        for entry in local.recipes:
            if entry not in candidates:
                candidates.append(entry)
        ai_text = ai.generate_reply(
            message=payload.message,
            history=history,
            candidates=candidates,
            attachments=files,
            language=payload.language,
        )
        if ai_text:
            content = ai_text
            recipes = _mentioned(ai_text, candidates)
            mode = "ai"

    now = datetime.now(UTC)
    user_payload = {"attachments": [meta.model_dump() for meta in metas]}
    reply_payload = {
        "recipes": [_card(entry).model_dump() for entry in recipes],
        "suggestions": local.suggestions[:4],
        "actions": local.actions,
        "mode": mode,
    }
    if conversation is not None:
        user_message = AssistantMessage(
            conversation_id=conversation.id,
            role="user",
            content=payload.message,
            payload=user_payload,
            created_at=now,
        )
        assistant_message = AssistantMessage(
            conversation_id=conversation.id,
            role="assistant",
            content=content,
            payload=reply_payload,
            created_at=datetime.fromtimestamp(now.timestamp() + 0.001, UTC),
        )
        session.add_all([user_message, assistant_message])
        conversation.updated_at = now
        session.commit()
        session.refresh(user_message)
        session.refresh(assistant_message)
        return ChatResponse(
            conversation_id=conversation.id,
            title=conversation.title,
            user_message=_message_out(user_message),
            reply=_message_out(assistant_message),
        )

    transient_user = AssistantMessage(
        id=uuid4(), role="user", content=payload.message, payload=user_payload, created_at=now
    )
    transient_reply = AssistantMessage(
        id=uuid4(), role="assistant", content=content, payload=reply_payload, created_at=now
    )
    return ChatResponse(
        conversation_id=None,
        title=_title_from(payload.message, metas, payload.language),
        user_message=_message_out(transient_user),
        reply=_message_out(transient_reply),
    )


def list_conversations(
    session: Session, user: User, *, limit: int = 50
) -> list[ConversationSummary]:
    counts = (
        select(AssistantMessage.conversation_id, func.count().label("total"))
        .group_by(AssistantMessage.conversation_id)
        .subquery()
    )
    rows = session.execute(
        select(AssistantConversation, func.coalesce(counts.c.total, 0))
        .outerjoin(counts, counts.c.conversation_id == AssistantConversation.id)
        .where(AssistantConversation.user_id == user.id)
        .order_by(AssistantConversation.updated_at.desc())
        .limit(limit)
    ).all()
    previews: dict[UUID, str] = {}
    ids = [conversation.id for conversation, _ in rows]
    if ids:
        latest = session.execute(
            select(AssistantMessage.conversation_id, AssistantMessage.content)
            .where(AssistantMessage.conversation_id.in_(ids), AssistantMessage.role == "assistant")
            .order_by(AssistantMessage.created_at.desc())
        ).all()
        for conversation_id, content in latest:
            if conversation_id not in previews:
                plain = re.sub(r"[*_`#>-]", "", content)
                previews[conversation_id] = " ".join(plain.split())[:120]
    return [
        ConversationSummary(
            id=conversation.id,
            title=conversation.title,
            preview=previews.get(conversation.id, ""),
            message_count=int(total),
            created_at=conversation.created_at,
            updated_at=conversation.updated_at,
        )
        for conversation, total in rows
    ]


def conversation_detail(session: Session, user: User, conversation_id: UUID) -> ConversationDetail:
    conversation = _get_conversation(session, user, conversation_id)
    return ConversationDetail(
        id=conversation.id,
        title=conversation.title,
        created_at=conversation.created_at,
        updated_at=conversation.updated_at,
        messages=[_message_out(message) for message in conversation.messages],
    )


def rename_conversation(
    session: Session, user: User, conversation_id: UUID, title: str
) -> ConversationSummary:
    conversation = _get_conversation(session, user, conversation_id)
    conversation.title = title
    session.commit()
    return next(item for item in list_conversations(session, user) if item.id == conversation.id)


def delete_conversation(session: Session, user: User, conversation_id: UUID) -> None:
    conversation = _get_conversation(session, user, conversation_id)
    session.delete(conversation)
    session.commit()


def clear_conversations(session: Session, user: User) -> None:
    for conversation in session.scalars(
        select(AssistantConversation).where(AssistantConversation.user_id == user.id)
    ):
        session.delete(conversation)
    session.commit()
