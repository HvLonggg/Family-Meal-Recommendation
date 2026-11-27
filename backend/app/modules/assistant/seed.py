"""Tài liệu nền "cho Chú Rồng học về Bếp Việt" (app/data/assistant_seed/*.md).

Nạp một lần vào bảng tài liệu quản trị viên dạy, nên hiện trong danh sách "dạy rồng" để
quản trị viên sửa hoặc tắt. Chỉ thêm tài liệu chưa có (nhận theo file_name "seed:<tên>.md"),
không bao giờ ghi đè bản quản trị viên đã sửa hay bật lại bản đã tắt.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.modules.assistant.models import AssistantKnowledgeDocument

SEED_DIR = Path(__file__).resolve().parents[2] / "data" / "assistant_seed"
PREFIX = "seed:"


@dataclass(frozen=True, slots=True)
class SeedDocument:
    file_name: str
    title: str
    text: str


def load_seed_documents(directory: Path = SEED_DIR) -> list[SeedDocument]:
    items: list[SeedDocument] = []
    for path in sorted(directory.glob("*.md")):
        raw = path.read_text(encoding="utf-8").strip()
        lines = raw.splitlines()
        title = path.stem.replace("-", " ")
        if lines and lines[0].startswith("# "):
            title = lines[0][2:].strip()
            raw = "\n".join(lines[1:]).strip()
        if raw:
            items.append(SeedDocument(f"{PREFIX}{path.name}", title[:200], raw))
    return items


def seed_knowledge_documents(session: Session, directory: Path = SEED_DIR) -> int:
    """Thêm tài liệu nền còn thiếu; trả về số tài liệu vừa thêm."""
    existing = set(
        session.scalars(
            select(AssistantKnowledgeDocument.file_name).where(
                AssistantKnowledgeDocument.file_name.like(f"{PREFIX}%")
            )
        )
    )
    added = 0
    for item in load_seed_documents(directory):
        if item.file_name in existing:
            continue
        session.add(
            AssistantKnowledgeDocument(
                title=item.title,
                source="note",
                file_name=item.file_name,
                content_type="text/markdown",
                size_bytes=len(item.text.encode("utf-8")),
                text=item.text,
                active=True,
            )
        )
        added += 1
    if added:
        session.commit()
    return added
