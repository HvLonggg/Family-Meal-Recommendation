from __future__ import annotations

import base64
import binascii
import json
import logging
import re
import threading
import time
from collections import defaultdict, deque
from collections.abc import Iterator
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from fastapi import status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.core.images import InvalidImageError, decode_image_data_url
from app.modules.account.preferences import read_preferences
from app.modules.assistant import (
    ai,
    engine,
    identity,
    knowledge,
    memory,
    persona,
    rag,
    smalltalk,
    traits,
)
from app.modules.assistant.models import AssistantConversation, AssistantMessage
from app.modules.assistant.phrases import SUGGESTIONS
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
    SourceRef,
)
from app.modules.auth.models import User
from app.modules.bepviet_ai import router as bepviet_ai
from app.modules.bepviet_ai import settings as bepviet_settings
from app.modules.bepviet_ai.catalog import SessionRecipeSource
from app.modules.recipes.search import normalize_search

logger = logging.getLogger("bep_viet.assistant")

IMAGE_MAX_BYTES = 5 * 1024 * 1024
PDF_MAX_BYTES = 5 * 1024 * 1024
TEXT_MAX_BYTES = 200 * 1024
TEXT_CONTEXT_CHARS = 6000
RATE_PER_MINUTE = 15
# Cứ mỗi bấy nhiêu lượt trả lời mới kèm chip gợi ý tiếp.
HINT_EVERY = 4
RATE_PER_DAY = 300
# Trần chung cho mọi khách chưa đăng nhập: chặn kẻ đổi IP liên tục để gọi AI miễn phí.
GUEST_BUDGET_PER_DAY = 1000
GUEST_BUDGET_KEY = "guest:all"
MAX_RATE_KEYS = 20_000
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
        if len(_rate_hits) > MAX_RATE_KEYS:
            # Dọn khóa đã im lặng quá một giờ để bộ đếm không phình bộ nhớ.
            for stale in [k for k, d in _rate_hits.items() if not d or moment - d[-1] > 3600]:
                del _rate_hits[stale]
        if not key.startswith("user:"):
            budget = _rate_hits[GUEST_BUDGET_KEY]
            while budget and moment - budget[0] > 86_400:
                budget.popleft()
            if len(budget) >= GUEST_BUDGET_PER_DAY:
                raise AssistantRateLimitError(
                    "Chú Rồng đang quá bận, bạn đăng nhập để trò chuyện tiếp nhé."
                )
        hits = _rate_hits[key]
        while hits and moment - hits[0] > 86_400:
            hits.popleft()
        last_minute = sum(1 for stamp in hits if moment - stamp <= 60)
        if last_minute >= RATE_PER_MINUTE or len(hits) >= RATE_PER_DAY:
            raise AssistantRateLimitError(
                "Chú Rồng cần nghỉ một chút, bạn chờ ít giây rồi hỏi tiếp nhé."
            )
        hits.append(moment)
        if not key.startswith("user:"):
            _rate_hits[GUEST_BUDGET_KEY].append(moment)


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
        sources=[SourceRef.model_validate(item) for item in payload.get("sources", [])],
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


def _sources(hits: list[rag.Hit]) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []
    for hit in hits:
        if all(
            (ref["url"], ref["title"]) != (hit.chunk.url, hit.chunk.title.split(" — ")[0])
            for ref in refs
        ):
            title = hit.chunk.title.split(" — ")[0]
            refs.append({"title": title, "url": hit.chunk.url, "kind": hit.chunk.source_type})
    return refs[:4]


# ---------------------------------------------------------------------------
# Hội thoại.
# ---------------------------------------------------------------------------
def _get_conversation(session: Session, user: User, conversation_id: UUID) -> AssistantConversation:
    conversation = session.get(AssistantConversation, conversation_id)
    if conversation is None or conversation.user_id != user.id:
        raise ConversationNotFoundError("Không tìm thấy cuộc trò chuyện.")
    return conversation


def tone_for(user: User | None) -> persona.Persona:
    """Giọng trả lời theo cài đặt tài khoản; khách luôn dùng giọng thân thiện."""
    if user is None:
        return "friendly"
    return "sassy" if read_preferences(user.preferences).assistant_sassy else "friendly"


_tone = tone_for


def _wants_block(intent: engine.Intent, language: str) -> str:
    """Báo cho AI yêu cầu vị/cách nấu đã nhận ra; <kho_mon> đã xếp theo mức phù hợp."""
    if not intent.traits:
        return ""
    wants = ", ".join(traits.labels(intent.traits, "vi"))
    return (
        f"<yeu_cau_mon>Người dùng muốn món: {wants}. Các món trong <kho_mon> đã xếp từ phù hợp "
        "nhất; chọn món khớp nhất, nếu chỉ gần giống thì nói rõ điểm khác.</yeu_cau_mon>\n"
    )


def _quip(kind: str, intent: engine.Intent, payload: ChatRequest) -> str:
    language = payload.language
    return persona.contextual_quip(
        kind,
        language,
        message=payload.message,
        recipe=intent.recipe.name if intent.kind == "recipe" and intent.recipe else None,
        wants=traits.labels(intent.traits, language),
        avoid=[engine.ingredient_label(word, language) for word in intent.exclude],
        minutes=intent.max_minutes,
        have=[engine.ingredient_label(word, language) for word in intent.include],
        meal=engine.MEAL_LABEL[intent.meal][language] if intent.meal else None,
    )


@dataclass(slots=True)
class _Draft:
    """Câu trả lời dự phòng của bộ máy nội bộ cùng tham số gọi AI (nếu AI đang bật)."""

    fallback: dict[str, Any]
    ai_args: dict[str, Any] | None = None
    hits: list[rag.Hit] = field(default_factory=list)
    candidates: list[engine.RecipeEntry] = field(default_factory=list)


def _draft_reply(
    session: Session,
    *,
    payload: ChatRequest,
    user: User | None,
    history: list[tuple[str, str]],
    avoid: set[str],
    files: list[ai.AttachmentPayload],
    attachment_text: str,
    tone: persona.Persona,
) -> _Draft:
    notes = memory.notes(session, user)
    prefs = engine.preferences_from(notes) if notes else None
    catalog = engine.load_catalog(session)
    # Gợi ý tiếp (chip, lời mời đổi món) chỉ thỉnh thoảng: lượt đầu, khi chưa hiểu câu hỏi,
    # hoặc mỗi vài lượt, để cuộc trò chuyện không lặp đi lặp lại.
    turns = sum(role == "assistant" for role, _ in history)
    periodic = turns == 0 or turns % HINT_EVERY == HINT_EVERY - 1
    local = engine.reply(
        payload.message,
        catalog,
        language=payload.language,
        avoid=avoid,
        attachment_text=attachment_text,
        has_images=any(file.kind in ("image", "pdf") for file in files),
        preferences=prefs,
        hints=periodic,
    )
    show_hints = periodic or local.intent.kind == "fallback"
    content = local.content
    recipes = local.recipes
    sources: list[dict[str, str]] = []
    kind = local.intent.kind
    query = rag.build_query(f"{payload.message}\n{attachment_text}".strip(), history)
    use_ai = ai.ai_enabled()
    talk = smalltalk.detect(payload.message) if not files and not use_ai else None
    if talk is not None:
        chatter = smalltalk.reply(talk, payload.language, sassy=tone == "sassy")
        if talk.strong or kind in ("fallback", "greeting", "thanks", "help"):
            # Chuyện ngoài lề: đáp như người với người, không chèn gợi ý món hay chip.
            return _Draft(
                fallback={
                    "content": chatter,
                    "recipes": [],
                    "suggestions": [],
                    "actions": [],
                    "sources": [],
                    "mode": "local",
                }
            )
        # Chủ đề nhẹ ("buồn quá, ăn gì cho vui?"): một câu đồng cảm rồi mới gợi ý.
        content = f"{chatter}\n\n{content}"
        tone = "friendly"
    hits: list[rag.Hit] = []
    # Không có AI: dùng kho tri thức khi bộ máy nội bộ chưa hiểu, hoặc khi người dùng hỏi
    # chi tiết về một món/tài liệu cụ thể ("phở bò hầm bao lâu?") mà bộ máy chỉ gợi ý chung.
    fallback = local.intent.kind == "fallback"
    specific = local.intent.kind in ("suggest", "pick") and rag.is_question(payload.message)
    if use_ai or ((fallback or specific) and not files):
        hits = rag.retrieve(session, query, k=get_settings().rag_top_k)
    ai_args: dict[str, Any] | None = None
    candidates: list[engine.RecipeEntry] = []
    if use_ai:
        by_slug = {entry.slug: entry for entry in catalog}
        for hit in hits:
            entry = by_slug.get(hit.chunk.source_key) if hit.chunk.source_type == "recipe" else None
            if entry is not None and entry not in candidates:
                candidates.append(entry)
        for entry in [
            *engine.candidate_recipes(query, catalog, avoid=avoid, preferences=prefs),
            *local.recipes,
        ]:
            if entry not in candidates:
                candidates.append(entry)
        # Món vi phạm dị ứng/kiêng trong ghi nhớ không bao giờ được đưa cho AI gợi ý.
        candidates = [entry for entry in candidates if engine.allowed(entry, prefs)][:14]
        ai_args = {
            # Câu nhắc ngôn ngữ chỉ gửi cho AI, không lưu vào lịch sử trò chuyện.
            "message": payload.message + identity.language_note(payload.message, payload.language)
            if payload.message.strip()
            else payload.message,
            "history": history,
            "candidates": candidates,
            "attachments": files,
            "language": payload.language,
            "knowledge": _wants_block(local.intent, payload.language) + rag.context_block(hits),
            "memories": memory.context_block(notes),
            # Bản sắc đã nằm trong prompt hệ thống; ở đây chỉ thêm giọng điệu.
            "persona": persona.tone_block(tone),
            "moment": engine.moment_block(),
        }
    elif hits:
        # Không có AI: trích câu trả lời từ tài liệu khớp nhất thay vì câu "chưa hiểu".
        answer = rag.extractive_answer(query, hits, payload.language, must_name_source=not fallback)
        if answer:
            content, used = answer
            sources = _sources([used])
            top = used.chunk
            entry = next((item for item in catalog if item.slug == top.source_key), None)
            allowed = top.source_type == "recipe" and entry and engine.allowed(entry, prefs)
            recipes = [entry] if allowed and entry else []
            kind = "knowledge"
    if tone == "sassy":
        # Chỉ dùng khi trả lời bằng bộ máy nội bộ (AI đã tự nói giọng trả treo).
        content = persona.decorate(content, _quip(kind, local.intent, payload))
    return _Draft(
        fallback={
            "content": content,
            "recipes": [_card(entry).model_dump() for entry in recipes],
            "suggestions": local.suggestions[:4] if show_hints else [],
            "actions": local.actions,
            "sources": sources,
            "mode": "local",
        },
        ai_args=ai_args,
        hits=hits,
        candidates=candidates,
    )


_BRACKET = re.compile(r"\s?\[([^\[\]\n]{2,80})\](?!\()")


def _drop_name_brackets(content: str, draft: _Draft) -> str:
    """Mô hình đôi khi "trích nguồn" bằng tên món trong ngoặc vuông thay vì số đoạn: bỏ đi."""
    names = {entry.name_norm for entry in draft.candidates}
    names.update(normalize_search(hit.chunk.title.split(" — ")[0]) for hit in draft.hits)

    def replace(match: re.Match[str]) -> str:
        return "" if normalize_search(match.group(1)) in names else match.group(0)

    return _BRACKET.sub(replace, content)


def _final_reply(draft: _Draft, ai_text: str | None) -> dict[str, Any]:
    """Ghép câu trả lời AI (nếu có) với chip/thao tác của bộ máy nội bộ."""
    if not ai_text:
        return dict(draft.fallback)
    language = str((draft.ai_args or {}).get("language", "vi"))
    # Hậu kiểm bản sắc: không để câu tự nhận là mô hình/hãng khác hay thẻ nội bộ lọt ra ngoài.
    content, cited = rag.extract_citations(identity.scrub(ai_text, language), draft.hits)
    content = _drop_name_brackets(content, draft)
    return {
        **draft.fallback,
        "content": content,
        "recipes": [_card(entry).model_dump() for entry in _mentioned(content, draft.candidates)],
        "sources": _sources(cited),
        "mode": "ai",
    }


@dataclass(slots=True)
class Turn:
    """Một lượt chat đã chuẩn bị xong (đọc CSDL, chọn món, tìm tài liệu), chỉ còn chờ AI viết."""

    payload: ChatRequest
    user_id: UUID | None
    conversation_id: UUID | None
    new_title: str | None
    metas: list[AttachmentMeta]
    reply: dict[str, Any] | None = None
    draft: _Draft | None = None


def begin_turn(session: Session, *, payload: ChatRequest, user: User | None) -> Turn:
    processed = [_process_attachment(item) for item in payload.attachments]
    metas = [meta for meta, _ in processed]
    files = [file for _, file in processed]
    attachment_text = "\n".join(file.text for file in files if file.kind == "text")
    # Kiểm tra kho tri thức trước mọi thao tác ghi; việc đồng bộ thật sự chạy ở nền.
    knowledge.ensure_fresh(session.get_bind())

    conversation_id: UUID | None = None
    new_title: str | None = None
    history: list[tuple[str, str]]
    avoid = set(payload.recent_recipes)
    if user is not None:
        if payload.conversation_id:
            conversation = _get_conversation(session, user, payload.conversation_id)
            conversation_id = conversation.id
            previous = list(
                session.scalars(
                    select(AssistantMessage)
                    .where(AssistantMessage.conversation_id == conversation.id)
                    .order_by(AssistantMessage.created_at.desc())
                    .limit(12)
                )
            )[::-1]
        else:
            new_title = _title_from(payload.message, metas, payload.language)
            previous = []
        history = [(item.role, item.content) for item in previous]
        for item in previous:
            avoid.update(card.get("slug", "") for card in (item.payload or {}).get("recipes", []))
    else:
        history = [(item.role, item.content) for item in payload.history]

    turn = Turn(
        payload=payload,
        user_id=user.id if user else None,
        conversation_id=conversation_id,
        new_title=new_title,
        metas=metas,
    )
    tone = _tone(user)
    command = memory.parse_command(payload.message) if not files else None
    if command is not None:
        # Lệnh ghi nhớ trả lời xác định, không cần AI và không gửi đi đâu.
        content, actions, suggestions = memory.handle(session, user, command, payload.language)
        if tone == "sassy" and user is not None:
            content = persona.decorate(content, persona.quip("memory", payload.language))
        turn.reply = {
            "content": content,
            "recipes": [],
            "suggestions": suggestions,
            "actions": actions,
            "sources": [],
            "mode": "local",
        }
        return turn
    probe = identity.detect(payload.message, payload.language) if not files else None
    if probe is not None:
        # Hỏi danh tính/mô hình/hướng dẫn hệ thống: câu trả lời thương hiệu cố định, tức thì,
        # không gửi tới AI nên không thể bị dụ tiết lộ.
        content, actions = identity.answer(probe, sassy=tone == "sassy")
        turn.reply = {
            "content": content,
            "recipes": [],
            "suggestions": SUGGESTIONS[probe.language][:3],
            "actions": actions,
            "sources": [],
            "mode": "local",
        }
        return turn
    inhouse = (
        None
        if files
        else _inhouse_reply(session, payload=payload, user=user, history=history, avoid=avoid)
    )
    if inhouse is not None:
        turn.reply = inhouse
        return turn
    draft = _draft_reply(
        session,
        payload=payload,
        user=user,
        history=history,
        avoid=avoid,
        files=files,
        attachment_text=attachment_text,
        tone=tone,
    )
    if draft.ai_args is None:
        turn.reply = draft.fallback
    else:
        turn.draft = draft
    return turn


def _inhouse_reply(
    session: Session,
    *,
    payload: ChatRequest,
    user: User | None,
    history: list[tuple[str, str]],
    avoid: set[str],
) -> dict[str, Any] | None:
    """AI riêng của Bếp Việt: trả lời ngay các ý định đã qua cổng chấm điểm (chế độ auto).

    Chế độ shadow (mặc định) chỉ ghi log dự đoán để đo trên lưu lượng thật, luôn trả None.
    """
    if bepviet_settings.current().mode == "off":
        return None
    notes = memory.notes(session, user)
    decision = bepviet_ai.decide(
        payload.message,
        language=payload.language,
        context=bepviet_ai.Context(
            source=SessionRecipeSource(session),
            history=history,
            avoid=avoid,
            preferences=engine.preferences_from(notes) if notes else None,
        ),
    )
    if decision.route != "inhouse" or decision.answer is None:
        return None
    answer = decision.answer
    by_slug = {entry.slug: entry for entry in engine.load_catalog(session)}
    return {
        "content": answer.content,
        "recipes": [
            _card(by_slug[slug]).model_dump() for slug in answer.recipes if slug in by_slug
        ],
        "suggestions": answer.followups[:4],
        "actions": answer.actions,
        "sources": [],
        "mode": "local",
    }


def finish_turn(session: Session, turn: Turn, reply: dict[str, Any]) -> ChatResponse:
    """Lưu cặp tin nhắn (thành viên) và trả về câu trả lời hoàn chỉnh."""
    payload = turn.payload
    reply_payload = dict(reply)
    content = reply_payload.pop("content")
    now = datetime.now(UTC)
    user_payload = {"attachments": [meta.model_dump() for meta in turn.metas]}
    if turn.user_id is not None:
        conversation: AssistantConversation | None = None
        if turn.conversation_id is not None:
            conversation = session.get(AssistantConversation, turn.conversation_id)
        if conversation is None or conversation.user_id != turn.user_id:
            conversation = AssistantConversation(
                user_id=turn.user_id,
                title=turn.new_title or _title_from(payload.message, turn.metas, payload.language),
            )
            session.add(conversation)
            session.flush()
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
        title=_title_from(payload.message, turn.metas, payload.language),
        user_message=_message_out(transient_user),
        reply=_message_out(transient_reply),
    )


def chat(session: Session, *, payload: ChatRequest, user: User | None) -> ChatResponse:
    turn = begin_turn(session, payload=payload, user=user)
    reply = turn.reply
    if reply is None:
        assert turn.draft is not None and turn.draft.ai_args is not None
        reply = _final_reply(turn.draft, ai.generate_reply(**turn.draft.ai_args))
    return finish_turn(session, turn, reply)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def stream_turn(turn: Turn, factory: sessionmaker[Session]) -> Iterator[str]:
    """Sự kiện SSE: `delta` (từng đoạn chữ AI vừa viết) rồi `done` (câu trả lời đã lưu)."""
    try:
        reply = turn.reply
        if reply is None:
            assert turn.draft is not None and turn.draft.ai_args is not None
            # Báo ngay cho giao diện biết đã nhận câu hỏi, trước cả khi AI viết chữ đầu tiên.
            yield _sse("start", {})
            parts: list[str] = []
            guard = identity.StreamGuard(turn.payload.language)
            for chunk in ai.stream_reply(**turn.draft.ai_args):
                text = guard.feed(chunk)
                if text:
                    parts.append(text)
                    yield _sse("delta", {"text": text})
            tail = guard.close()
            if tail:
                parts.append(tail)
                yield _sse("delta", {"text": tail})
            reply = _final_reply(turn.draft, "".join(parts).strip() or None)
        with factory() as session:
            response = finish_turn(session, turn, reply)
        yield _sse("done", response.model_dump(mode="json"))
    except Exception as exc:  # Không để lộ chi tiết lỗi qua luồng đã mở.
        logger.error("Assistant stream failed (%s).", type(exc).__name__)
        yield _sse("error", {"message": "Đã có lỗi xảy ra. Vui lòng thử lại."})


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


def warm_up() -> None:
    """Khởi động: nạp sẵn danh mục món và chỉ mục tài liệu để câu chat đầu tiên trả lời ngay,
    xong rồi mới đồng bộ kho tri thức (việc nặng) để hai việc không tranh CPU với nhau."""
    from app.db.session import SessionLocal

    def run() -> None:
        try:
            with SessionLocal() as session:
                engine.load_catalog(session)
                rag.load_index(session)
                bind = session.get_bind()
        except Exception as exc:  # Chỉ là tối ưu: lỗi thì lần chat đầu tự nạp.
            logger.warning("Assistant warm-up failed (%s).", type(exc).__name__)
            return
        try:
            knowledge.ensure_fresh(bind, force=True)
        except Exception as exc:  # Lỗi CSDL không chặn ứng dụng; lần chat sau sẽ thử lại.
            logger.warning("Knowledge sync could not start (%s).", type(exc).__name__)

    threading.Thread(target=run, daemon=True, name="assistant-warm-up").start()
