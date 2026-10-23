"""Tài liệu quản trị viên dạy cho Chú Rồng: ghi chú hoặc tệp .docx, .pptx, .txt, .md, .csv.

Chữ được trích bằng thư viện chuẩn (zipfile + XML), lưu vào ``assistant_knowledge_documents`` rồi
đưa vào kho tri thức RAG (chia đoạn, tạo embedding) để trả lời mọi người dùng kèm nguồn.
"""

from __future__ import annotations

import base64
import binascii
import io
import re
import zipfile
from pathlib import PurePath
from uuid import UUID
from xml.etree import ElementTree

from fastapi import status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import DomainError
from app.modules.assistant import knowledge
from app.modules.assistant.models import AssistantKnowledgeDocument
from app.modules.auth.models import User

MAX_FILE_BYTES = 8 * 1024 * 1024
MAX_TEXT_CHARS = 200_000
# Chống "zip bomb": giới hạn số tệp con và tổng dung lượng sau giải nén.
MAX_ZIP_MEMBERS = 3000
MAX_UNZIPPED_BYTES = 80 * 1024 * 1024
TEXT_TYPES = {".txt", ".md", ".csv"}
SUPPORTED = {".docx", ".pptx", *TEXT_TYPES}

W = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
A = "{http://schemas.openxmlformats.org/drawingml/2006/main}"


class DocumentError(DomainError):
    code = "ASSISTANT_DOCUMENT_INVALID"


class DocumentNotFoundError(DomainError):
    code = "RESOURCE_NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


# ---------------------------------------------------------------------------
# Trích chữ.
# ---------------------------------------------------------------------------
def _xml(archive: zipfile.ZipFile, name: str) -> ElementTree.Element:
    raw = archive.read(name)
    # Tệp Office hợp lệ không có DTD; từ chối để tránh tấn công mở rộng thực thể XML.
    if b"<!DOCTYPE" in raw[:4096] or b"<!ENTITY" in raw:
        raise DocumentError("Tệp có cấu trúc XML không an toàn.")
    try:
        return ElementTree.fromstring(raw)
    except ElementTree.ParseError as exc:
        raise DocumentError("Không đọc được nội dung tệp.") from exc


def _open_zip(data: bytes) -> zipfile.ZipFile:
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as exc:
        raise DocumentError("Tệp bị hỏng hoặc không đúng định dạng Office.") from exc
    members = archive.infolist()
    if len(members) > MAX_ZIP_MEMBERS or sum(m.file_size for m in members) > MAX_UNZIPPED_BYTES:
        raise DocumentError("Tệp quá lớn sau khi giải nén.")
    return archive


def _docx_text(data: bytes) -> str:
    archive = _open_zip(data)
    if "word/document.xml" not in archive.namelist():
        raise DocumentError("Không tìm thấy nội dung văn bản trong tệp .docx.")
    body = _xml(archive, "word/document.xml").find(f"{W}body")
    lines: list[str] = []
    for block in list(body) if body is not None else []:
        if block.tag == f"{W}p":
            lines.append(_docx_paragraph(block))
        elif block.tag == f"{W}tbl":
            for row in block.iter(f"{W}tr"):
                cells = [
                    " ".join(_docx_paragraph(p) for p in cell.iter(f"{W}p")).strip()
                    for cell in row.iter(f"{W}tc")
                ]
                if any(cells):
                    lines.append(" | ".join(cells))
            lines.append("")
    return "\n".join(lines)


def _docx_paragraph(paragraph: ElementTree.Element) -> str:
    parts: list[str] = []
    for node in paragraph.iter():
        if node.tag == f"{W}t" and node.text:
            parts.append(node.text)
        elif node.tag == f"{W}tab":
            parts.append("\t")
        elif node.tag in (f"{W}br", f"{W}cr"):
            parts.append("\n")
    text = "".join(parts).strip()
    style = paragraph.find(f"{W}pPr/{W}pStyle")
    is_list = paragraph.find(f"{W}pPr/{W}numPr") is not None
    if text and style is not None and "heading" in (style.get(f"{W}val") or "").lower():
        return f"\n{text}"
    return f"- {text}" if text and is_list else text


def _slide_number(name: str) -> int:
    match = re.search(r"(\d+)\.xml$", name)
    return int(match.group(1)) if match else 0


def _pptx_text(data: bytes) -> str:
    archive = _open_zip(data)
    names = archive.namelist()
    slides = sorted(
        (n for n in names if re.fullmatch(r"ppt/slides/slide\d+\.xml", n)), key=_slide_number
    )
    if not slides:
        raise DocumentError("Không tìm thấy trang chiếu nào trong tệp .pptx.")
    sections: list[str] = []
    for name in slides:
        number = _slide_number(name)
        paragraphs = [
            "".join(node.text or "" for node in paragraph.iter(f"{A}t")).strip()
            for paragraph in _xml(archive, name).iter(f"{A}p")
        ]
        lines = [line for line in paragraphs if line]
        notes_name = f"ppt/notesSlides/notesSlide{number}.xml"
        if notes_name in names:
            notes = [
                "".join(node.text or "" for node in paragraph.iter(f"{A}t")).strip()
                for paragraph in _xml(archive, notes_name).iter(f"{A}p")
            ]
            # Ghi chú luôn có số trang chiếu đứng riêng một dòng: bỏ đi.
            notes = [line for line in notes if line and not line.isdigit()]
            if notes:
                lines.append("Ghi chú: " + " ".join(notes))
        if lines:
            sections.append(f"Trang {number}: {lines[0]}\n" + "\n".join(lines[1:]))
    return "\n\n".join(sections)


def _plain_text(data: bytes) -> str:
    for encoding in ("utf-8-sig", "utf-16"):
        try:
            return data.decode(encoding)
        except UnicodeDecodeError:
            continue
    return data.decode("utf-8", errors="replace")


def extract_text(file_name: str, data: bytes) -> str:
    suffix = PurePath(file_name).suffix.lower()
    if suffix not in SUPPORTED:
        hint = " Hãy lưu lại dưới dạng .docx hoặc .pptx." if suffix in {".doc", ".ppt"} else ""
        raise DocumentError(f"Chưa hỗ trợ tệp {suffix or 'không có đuôi'}.{hint}")
    if len(data) > MAX_FILE_BYTES:
        raise DocumentError("Tệp vượt quá 8 MB.")
    if suffix == ".docx":
        text = _docx_text(data)
    elif suffix == ".pptx":
        text = _pptx_text(data)
    else:
        text = _plain_text(data)
    text = re.sub(r"[ \t]+\n", "\n", text.replace("\r\n", "\n"))
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if len(text) < 20:
        raise DocumentError("Tệp gần như không có chữ để Chú Rồng học.")
    return text[:MAX_TEXT_CHARS]


def decode_data_url(data_url: str) -> bytes:
    _, _, encoded = data_url.partition(",") if data_url.startswith("data:") else ("", "", data_url)
    try:
        return base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise DocumentError("Dữ liệu tệp không hợp lệ.") from exc


# ---------------------------------------------------------------------------
# Lưu trữ.
# ---------------------------------------------------------------------------
def _refresh(session: Session) -> None:
    knowledge.ensure_fresh(session.get_bind(), force=True)


def list_documents(session: Session) -> list[AssistantKnowledgeDocument]:
    return list(
        session.scalars(
            select(AssistantKnowledgeDocument).order_by(
                AssistantKnowledgeDocument.created_at.desc()
            )
        )
    )


def get_document(session: Session, document_id: UUID) -> AssistantKnowledgeDocument:
    item = session.get(AssistantKnowledgeDocument, document_id)
    if item is None:
        raise DocumentNotFoundError("Không tìm thấy tài liệu.")
    return item


def create_note(
    session: Session, admin: User, *, title: str, text: str
) -> AssistantKnowledgeDocument:
    item = AssistantKnowledgeDocument(
        title=title,
        source="note",
        text=text[:MAX_TEXT_CHARS],
        size_bytes=len(text.encode("utf-8")),
        active=True,
        created_by=admin.id,
    )
    session.add(item)
    session.commit()
    _refresh(session)
    session.refresh(item)
    return item


def create_from_file(
    session: Session,
    admin: User,
    *,
    file_name: str,
    content_type: str,
    data_url: str,
    title: str | None,
) -> AssistantKnowledgeDocument:
    data = decode_data_url(data_url)
    text = extract_text(file_name, data)
    item = AssistantKnowledgeDocument(
        title=(title or PurePath(file_name).stem.replace("_", " ")).strip()[:200],
        source="file",
        file_name=file_name[:255],
        content_type=content_type[:120] or None,
        size_bytes=len(data),
        text=text,
        active=True,
        created_by=admin.id,
    )
    session.add(item)
    session.commit()
    _refresh(session)
    session.refresh(item)
    return item


def update_document(
    session: Session,
    document_id: UUID,
    *,
    title: str | None = None,
    text: str | None = None,
    active: bool | None = None,
) -> AssistantKnowledgeDocument:
    item = get_document(session, document_id)
    if title is not None:
        item.title = title
    if text is not None:
        item.text = text[:MAX_TEXT_CHARS]
    if active is not None:
        item.active = active
    session.commit()
    _refresh(session)
    session.refresh(item)
    return item


def delete_document(session: Session, document_id: UUID) -> None:
    session.delete(get_document(session, document_id))
    session.commit()
    _refresh(session)
