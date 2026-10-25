"""Ghi nhớ riêng của từng người dùng cho Chú Rồng.

Người dùng nói "Nhớ giúp mình: nhà mình không ăn cay, có 4 người, con dị ứng tôm" thì mỗi ý được
lưu thành một ghi nhớ. Ghi nhớ chỉ áp dụng cho chính người đó: lọc món ở bộ máy nội bộ và gửi kèm
AI như dữ liệu tham khảo. Người dùng xem, sửa, xóa ghi nhớ trong Cài đặt tài khoản.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from uuid import UUID

from fastapi import status
from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.modules.assistant.models import AssistantMemory
from app.modules.auth.models import User
from app.modules.recipes.search import normalize_search

MAX_MEMORIES = 30
MAX_CHARS = 200
SETTINGS_PATH = "/account/settings#memories"

_PRONOUN = r"(?:\s+(?:mình|tôi|em|tớ|tui|giùm|hộ|nha|nhé))*"
REMEMBER = re.compile(
    r"^\s*(?:(?:chú\s+rồng|rồng\s+ơi|rồng|bạn|ơi)[\s,]*)*(?:hãy\s+|làm\s+ơn\s+)?"
    rf"(?:nhớ\s+giúp{_PRONOUN}|ghi\s+nhớ(?:\s+giúp)?{_PRONOUN}|nhớ{_PRONOUN}\s+(?:là|rằng)"
    rf"|lưu\s+lại(?:\s+giúp)?{_PRONOUN}|(?:please\s+)?remember(?:\s+that)?)"
    r"(?:\s+(?:là|rằng))?\s*[:,\-–]?\s*(?P<body>\S.*)$",
    re.IGNORECASE | re.DOTALL,
)
FORGET = re.compile(
    r"^\s*(?:hãy\s+)?(?:quên|xóa\s+ghi\s+nhớ|xoá\s+ghi\s+nhớ|bỏ\s+ghi\s+nhớ|forget)"
    rf"{_PRONOUN}(?:\s+(?:đi|chuyện|là|rằng|điều|about|that))*\s*[:,\-–]?\s*(?P<body>.*)$",
    re.IGNORECASE | re.DOTALL,
)
FORGET_ALL = ("het", "tat ca", "toan bo", "moi thu", "everything", "all")
RECALL = (
    "ban nho gi",
    "nho gi ve",
    "da ghi nho gi",
    "dang ghi nho gi",
    "ghi nho cua minh",
    "xem ghi nho",
    "what do you remember",
)


class MemoryNotFoundError(DomainError):
    code = "RESOURCE_NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


class MemoryLimitError(DomainError):
    code = "ASSISTANT_MEMORY_LIMIT"
    status_code = status.HTTP_409_CONFLICT


@dataclass(slots=True)
class Command:
    action: str  # remember | forget | forget_all | recall
    facts: list[str] = field(default_factory=list)
    target: str = ""


def _clean(fact: str) -> str:
    fact = " ".join(fact.split()).strip(" .!-–:")
    return (fact[:1].upper() + fact[1:])[:MAX_CHARS] if fact else ""


def split_facts(body: str) -> list[str]:
    facts: list[str] = []
    for part in re.split(r"[;\n•]+|,\s*|\.\s+", body):
        fact = _clean(part)
        if len(fact) >= 3 and normalize_search(fact) not in {
            normalize_search(item) for item in facts
        }:
            facts.append(fact)
    return facts


def classify(fact: str) -> str:
    text = normalize_search(fact)
    if re.search(r"di ung|allerg", text):
        return "allergy"
    if re.search(r"khong an|kieng|an chay|cay|tranh|vegan|vegetarian|khong thich|thich an", text):
        return "diet"
    if re.search(
        r"\d+\s*(?:nguoi|thanh vien)|gia dinh|nha co|tre em|em be|(?:^| )(?:vo|chong|con)(?: |$)",
        text,
    ):
        return "household"
    return "note"


def parse_command(message: str) -> Command | None:
    text = message.strip()
    if not text:
        return None
    plain = normalize_search(text)
    if any(phrase in plain for phrase in RECALL):
        return Command("recall")
    if "?" not in text and (match := REMEMBER.match(text)):
        facts = split_facts(match.group("body"))
        return Command("remember", facts=facts) if facts else None
    if match := FORGET.match(text):
        target = _clean(match.group("body"))
        target_plain = normalize_search(target)
        if not target or any(
            target_plain == word or target_plain.startswith(f"{word} ") for word in FORGET_ALL
        ):
            return Command("forget_all")
        return Command("forget", target=target)
    return None


# ---------------------------------------------------------------------------
# Lưu trữ.
# ---------------------------------------------------------------------------
def list_memories(session: Session, user: User) -> list[AssistantMemory]:
    return list(
        session.scalars(
            select(AssistantMemory)
            .where(AssistantMemory.user_id == user.id)
            .order_by(AssistantMemory.created_at, AssistantMemory.id)
        )
    )


def notes(session: Session, user: User | None) -> list[str]:
    return [item.content for item in list_memories(session, user)] if user else []


def _count(session: Session, user: User) -> int:
    return int(
        session.scalar(
            select(func.count(AssistantMemory.id)).where(AssistantMemory.user_id == user.id)
        )
        or 0
    )


def add_memories(session: Session, user: User, facts: list[str]) -> tuple[list[str], int]:
    """Thêm các ý mới (bỏ trùng). Trả về (đã thêm, số ý bị bỏ vì đủ giới hạn)."""
    existing = {normalize_search(item.content) for item in list_memories(session, user)}
    room = MAX_MEMORIES - len(existing)
    now = datetime.now(UTC)
    added: list[str] = []
    skipped = 0
    for fact in facts:
        cleaned = _clean(fact)
        key = normalize_search(cleaned)
        if not cleaned or key in existing:
            continue
        if len(added) >= room:
            skipped += 1
            continue
        # Thời điểm tăng dần để giữ đúng thứ tự người dùng đã nói.
        created = now + timedelta(microseconds=len(added))
        session.add(
            AssistantMemory(
                user_id=user.id,
                content=cleaned,
                kind=classify(cleaned),
                created_at=created,
                updated_at=created,
            )
        )
        existing.add(key)
        added.append(cleaned)
    session.flush()
    return added, skipped


def create_memory(session: Session, user: User, content: str) -> AssistantMemory:
    if _count(session, user) >= MAX_MEMORIES:
        raise MemoryLimitError(f"Chú Rồng chỉ lưu tối đa {MAX_MEMORIES} ghi nhớ.")
    cleaned = _clean(content)
    item = AssistantMemory(user_id=user.id, content=cleaned, kind=classify(cleaned))
    session.add(item)
    session.commit()
    session.refresh(item)
    return item


def _owned(session: Session, user: User, memory_id: UUID) -> AssistantMemory:
    item = session.get(AssistantMemory, memory_id)
    if item is None or item.user_id != user.id:
        raise MemoryNotFoundError("Không tìm thấy ghi nhớ.")
    return item


def update_memory(session: Session, user: User, memory_id: UUID, content: str) -> AssistantMemory:
    item = _owned(session, user, memory_id)
    item.content = _clean(content)
    item.kind = classify(item.content)
    session.commit()
    session.refresh(item)
    return item


def delete_memory(session: Session, user: User, memory_id: UUID) -> None:
    session.delete(_owned(session, user, memory_id))
    session.commit()


def clear_memories(session: Session, user: User) -> int:
    result = session.execute(delete(AssistantMemory).where(AssistantMemory.user_id == user.id))
    session.commit()
    return int(getattr(result, "rowcount", 0) or 0)


def forget_matching(session: Session, user: User, target: str) -> list[str]:
    words = [word for word in normalize_search(target).split() if len(word) > 1]
    removed: list[str] = []
    for item in list_memories(session, user):
        text = normalize_search(item.content)
        if words and all(re.search(rf"(?:^| ){re.escape(word)}(?: |$)", text) for word in words):
            removed.append(item.content)
            session.delete(item)
    session.flush()
    return removed


# ---------------------------------------------------------------------------
# Trả lời lệnh ghi nhớ trong khung chat.
# ---------------------------------------------------------------------------
def _bullets(items: list[str]) -> str:
    return "\n".join(f"- {item}" for item in items)


def handle(
    session: Session, user: User | None, command: Command, language: str
) -> tuple[str, list[dict[str, str]], list[str]]:
    """Thực hiện lệnh, trả về (nội dung, liên kết, gợi ý tiếp)."""
    vi = language != "en"
    manage = [{"label": "Quản lý ghi nhớ", "to": SETTINGS_PATH}]
    follow = ["Tối nay ăn gì?", "Gợi ý cả mâm cơm"] if vi else ["What's for dinner?", "Full meal"]
    if user is None:
        content = (
            "Bạn đăng nhập để mình ghi nhớ khẩu vị lâu dài nhé — ghi nhớ chỉ dùng cho riêng bạn."
            if vi
            else "Please sign in so I can remember your preferences — they stay private to you."
        )
        return content, [{"label": "Đăng nhập", "to": "/login"}], follow

    if command.action == "remember":
        added, skipped = add_memories(session, user, command.facts)
        if not added and not skipped:
            content = (
                "Mấy điều này mình đã nhớ từ trước rồi nè!"
                if vi
                else "I already remember all of that!"
            )
        else:
            head = "Mình đã ghi nhớ rồi nè:" if vi else "Got it, I'll remember:"
            tail = (
                "Từ giờ mình sẽ gợi ý món theo những điều này."
                if vi
                else "I'll use these for every suggestion from now on."
            )
            content = f"{head}\n{_bullets(added)}\n\n{tail}" if added else ""
            if skipped:
                limit = (
                    f"Mình chỉ lưu tối đa {MAX_MEMORIES} ghi nhớ, bạn xóa bớt ghi nhớ cũ nhé."
                    if vi
                    else f"I can keep up to {MAX_MEMORIES} memories — please remove some."
                )
                content = f"{content}\n{limit}".strip()
        return content, manage, follow

    if command.action == "recall":
        items = notes(session, user)
        if not items:
            content = (
                'Mình chưa ghi nhớ gì về bạn. Thử nói: "Nhớ giúp mình: nhà mình không ăn cay".'
                if vi
                else "I don't remember anything yet. Try: \"Remember: we don't eat spicy food\"."
            )
        else:
            head = "Mình đang ghi nhớ về bạn:" if vi else "Here's what I remember about you:"
            content = f"{head}\n{_bullets(items)}"
        return content, manage, follow

    if command.action == "forget_all":
        count = clear_memories(session, user)
        content = (
            f"Mình đã quên hết {count} ghi nhớ của bạn."
            if vi
            else f"I've forgotten all {count} memories."
        )
        return content, manage, follow

    removed = forget_matching(session, user, command.target)
    if removed:
        head = "Mình đã quên:" if vi else "Forgotten:"
        content = f"{head}\n{_bullets(removed)}"
    else:
        content = (
            f"Mình không thấy ghi nhớ nào khớp với “{command.target}”."
            if vi
            else f"I couldn't find a memory matching “{command.target}”."
        )
    return content, manage, follow


def context_block(items: list[str]) -> str:
    if not items:
        return ""
    return "<ghi_nho_nguoi_dung>\n" + _bullets(items) + "\n</ghi_nho_nguoi_dung>"
