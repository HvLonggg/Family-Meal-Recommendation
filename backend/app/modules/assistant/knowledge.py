"""Kho tri thức cho RAG của Chú Rồng.

Dựng các đoạn văn từ nội dung công khai (món đã xuất bản, bài viết đã duyệt, hướng dẫn website),
đồng bộ tăng dần vào bảng ``assistant_knowledge_chunks`` theo mã băm nội dung và tạo embedding
bằng Gemini khi có API key. Không đưa dữ liệu người dùng vào kho tri thức.
"""

from __future__ import annotations

import hashlib
import logging
import math
import re
import threading
import time
from array import array
from collections.abc import Iterable
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from typing import Any

import httpx
from sqlalchemy import delete, func, select
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session, selectinload, sessionmaker

from app.core.config import get_settings
from app.modules.articles.models import Article
from app.modules.assistant import engine
from app.modules.assistant.models import AssistantKnowledgeChunk, AssistantKnowledgeDocument
from app.modules.recipes.models import Recipe

logger = logging.getLogger("bep_viet.assistant.knowledge")

CHUNK_CHARS = 1100
EMBED_DIMENSIONS = 768
EMBED_BATCH = 50
EMBED_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"
# Tăng khi sửa cách dựng đoạn văn để toàn bộ kho được dựng lại.
KNOWLEDGE_VERSION = 1
# Khoảng tối thiểu giữa hai lần kiểm tra nguồn dữ liệu thay đổi.
CHECK_INTERVAL_SECONDS = 20.0


@dataclass(frozen=True, slots=True)
class Document:
    chunk_key: str
    source_type: str
    source_key: str
    title: str
    url: str
    content: str

    @property
    def content_hash(self) -> str:
        raw = f"{KNOWLEDGE_VERSION}|{self.title}|{self.url}|{self.content}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Dựng đoạn văn.
# ---------------------------------------------------------------------------
def split_text(text: str, limit: int = CHUNK_CHARS) -> list[str]:
    """Chia theo đoạn rồi theo câu, mỗi phần không quá ``limit`` ký tự."""
    pieces: list[str] = []
    for paragraph in re.split(r"\n\s*\n", text.strip()):
        paragraph = " ".join(paragraph.split())
        if not paragraph:
            continue
        if len(paragraph) <= limit:
            pieces.append(paragraph)
            continue
        buffer = ""
        for sentence in re.split(r"(?<=[.!?…])\s+", paragraph):
            while len(sentence) > limit:
                pieces.append(sentence[:limit])
                sentence = sentence[limit:]
            if buffer and len(buffer) + len(sentence) + 1 > limit:
                pieces.append(buffer)
                buffer = sentence
            else:
                buffer = f"{buffer} {sentence}".strip()
        if buffer:
            pieces.append(buffer)

    chunks: list[str] = []
    for piece in pieces:
        if chunks and len(chunks[-1]) + len(piece) + 1 <= limit:
            chunks[-1] = f"{chunks[-1]}\n{piece}"
        else:
            chunks.append(piece)
    return chunks


def _tag_text(tags: dict[str, Any], key: str) -> str:
    value = tags.get(key) or []
    items = value if isinstance(value, list) else [value]
    return ", ".join(str(item) for item in items if str(item).strip())


def _amount(value: Any) -> str:
    if value is None:
        return ""
    text = f"{value:f}".rstrip("0").rstrip(".") if hasattr(value, "as_tuple") else str(value)
    return text


def recipe_documents(recipe: Recipe) -> list[Document]:
    url = f"/recipes/{recipe.slug}"
    tags = (recipe.content or {}).get("tags") or {}
    key = f"recipe:{recipe.slug}"
    # Vùng chi tiết ("Bắc Trung Bộ") kèm tên miền để câu hỏi "món miền Trung" vẫn tìm thấy.
    macro = engine.macro_region(recipe.region)
    region = recipe.region
    if macro in ("Bắc", "Trung", "Nam") and region != macro:
        region = f"{region} (miền {macro})"
    overview = [
        f"Món {recipe.name}: {recipe.excerpt}",
        f"Loại món: {recipe.category}. Vùng miền: {region}. Độ khó: {recipe.difficulty}.",
        f"Thời gian: sơ chế {recipe.prep_minutes} phút, nấu {recipe.cook_minutes} phút; "
        f"khẩu phần {recipe.base_servings} người.",
    ]
    for label, tag in (
        ("Bữa phù hợp", "meal_type"),
        ("Nguyên liệu chính", "main_ingredient"),
        ("Cách chế biến", "cooking_method"),
    ):
        if text := _tag_text(tags, tag):
            overview.append(f"{label}: {text}.")
    if recipe.serving:
        overview.append(f"Cách dùng: {recipe.serving}")
    if recipe.tip:
        overview.append(f"Mẹo nhỏ: {recipe.tip}")
    documents = [
        Document(f"{key}:overview", "recipe", recipe.slug, recipe.name, url, "\n".join(overview))
    ]

    if recipe.ingredients:
        lines = []
        for item in sorted(recipe.ingredients, key=lambda row: row.position):
            amount = " ".join(part for part in (_amount(item.amount), item.unit) if part)
            note = f" ({item.note})" if item.note else ""
            lines.append(f"- {item.name}{': ' + amount if amount else ''}{note}")
        documents.append(
            Document(
                f"{key}:ingredients",
                "recipe",
                recipe.slug,
                f"{recipe.name} — nguyên liệu",
                url,
                f"Nguyên liệu món {recipe.name} ({recipe.base_servings} người):\n"
                + "\n".join(lines),
            )
        )

    steps = sorted(recipe.steps, key=lambda row: (row.step_type != "prep", row.position))
    if steps:
        lines = [
            f"{'Sơ chế' if step.step_type == 'prep' else 'Bước'} {index}: {step.content}"
            for index, step in enumerate(steps, start=1)
        ]
        for part, text in enumerate(split_text("\n\n".join(lines)), start=1):
            documents.append(
                Document(
                    f"{key}:steps:{part}",
                    "recipe",
                    recipe.slug,
                    f"{recipe.name} — cách làm",
                    url,
                    f"Cách làm món {recipe.name}:\n{text}",
                )
            )
    return documents


def article_documents(article: Article) -> list[Document]:
    url = f"/articles/{article.slug}"
    head = f"{article.title}. {article.excerpt}".strip()
    chunks = split_text(article.body) or [""]
    return [
        Document(
            f"article:{article.slug}:{index}",
            "article",
            article.slug,
            article.title,
            url,
            f"{head}\n{text}".strip() if index == 1 else f"{article.title}:\n{text}",
        )
        for index, text in enumerate(chunks, start=1)
    ]


SITE_GUIDE: tuple[tuple[str, str, str, str], ...] = (
    (
        "planner",
        "Kế hoạch nấu ăn",
        "/planner",
        "Trang Kế hoạch nấu ăn (/planner) giúp xếp món cho từng bữa sáng, trưa, tối theo ngày. "
        "Lịch có hiển thị ngày âm lịch và cho đánh dấu ngày ăn chay. Có thể nhận email nhắc "
        "trước bữa ăn và tạo danh sách đi chợ từ các món đã xếp.",
    ),
    (
        "shopping",
        "Danh sách đi chợ",
        "/planner",
        "Danh sách đi chợ nằm trong Kế hoạch nấu ăn: hệ thống gộp nguyên liệu của các món đã "
        "xếp theo khẩu phần, có thể đánh dấu món đã mua.",
    ),
    (
        "recipes",
        "Kho món",
        "/recipes",
        "Kho món (/recipes) cho tìm món theo tên, nguyên liệu, vùng miền, loại món, độ khó và "
        "thời gian nấu. Trang chi tiết món có nguyên liệu tự quy đổi theo khẩu phần, các bước "
        "làm, mẹo nhỏ và chức năng đọc to công thức.",
    ),
    (
        "random-meal",
        "Mâm cơm ngẫu nhiên",
        "/random-meal",
        "Mâm cơm ngẫu nhiên (/random-meal) quay ra một mâm gồm món mặn, canh, rau; bấm vào từng "
        "ô để đổi riêng món đó. Mâm hiển thị tổng thời gian và dinh dưỡng ước tính theo món.",
    ),
    (
        "favorites",
        "Món yêu thích",
        "/favorites",
        "Bấm biểu tượng trái tim trên thẻ món để lưu vào Món yêu thích (/favorites); cần đăng "
        "nhập để đồng bộ giữa các thiết bị.",
    ),
    (
        "community",
        "Bài viết và đề xuất món",
        "/articles",
        "Bài viết (/articles) là nơi chia sẻ câu chuyện bếp và mẹo nấu ăn; thành viên có thể viết "
        "bài mới, bài được duyệt trước khi xuất bản. Đề xuất món (/submit-recipe) cho gửi công "
        "thức để đội ngũ Bếp Việt xem xét đưa vào kho.",
    ),
    (
        "account",
        "Tài khoản và bảo mật",
        "/account/settings",
        "Cài đặt tài khoản (/account/settings) cho đổi tên, ảnh đại diện, ngôn ngữ. Trang Bảo mật "
        "(/account/security) cho đổi mật khẩu và đổi email bằng mã xác nhận gửi về email mới. "
        "Phiên đăng nhập tự gia hạn; khi hết hạn cần đăng nhập lại.",
    ),
    (
        "contact",
        "Liên hệ hỗ trợ",
        "/contact",
        "Trang Liên hệ (/contact) cho gửi yêu cầu hỗ trợ tới đội ngũ Bếp Việt; thường phản hồi "
        "trong 1–2 ngày làm việc.",
    ),
)


def taught_documents(item: AssistantKnowledgeDocument) -> list[Document]:
    """Tài liệu quản trị viên dạy: không có trang công khai nên đường dẫn để trống."""
    return [
        Document(
            f"doc:{item.id}:{index}",
            "doc",
            str(item.id),
            item.title,
            "",
            f"{item.title}:\n{text}",
        )
        for index, text in enumerate(split_text(item.text), start=1)
    ]


def guide_documents() -> list[Document]:
    return [
        Document(f"guide:{key}", "guide", key, title, url, content)
        for key, title, url, content in SITE_GUIDE
    ]


def build_documents(session: Session) -> list[Document]:
    documents: list[Document] = []
    recipes = session.scalars(
        select(Recipe)
        .where(Recipe.status == "published")
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        .order_by(Recipe.slug)
    ).all()
    for recipe in recipes:
        documents.extend(recipe_documents(recipe))
    articles = session.scalars(
        select(Article).where(Article.status == "published").order_by(Article.slug)
    ).all()
    for article in articles:
        documents.extend(article_documents(article))
    taught = session.scalars(
        select(AssistantKnowledgeDocument)
        .where(AssistantKnowledgeDocument.active.is_(True))
        .order_by(AssistantKnowledgeDocument.created_at)
    ).all()
    for item in taught:
        documents.extend(taught_documents(item))
    documents.extend(guide_documents())
    return documents


def source_signature(session: Session) -> tuple[Any, ...]:
    recipes = session.execute(
        select(func.count(Recipe.id), func.max(Recipe.updated_at)).where(
            Recipe.status == "published"
        )
    ).one()
    articles = session.execute(
        select(func.count(Article.id), func.max(Article.updated_at)).where(
            Article.status == "published"
        )
    ).one()
    taught = session.execute(
        select(
            func.count(AssistantKnowledgeDocument.id),
            func.max(AssistantKnowledgeDocument.updated_at),
        )
    ).one()
    active = session.scalar(
        select(func.count(AssistantKnowledgeDocument.id)).where(
            AssistantKnowledgeDocument.active.is_(True)
        )
    )
    return (KNOWLEDGE_VERSION, *recipes, *articles, *taught, active, embedding_model())


# ---------------------------------------------------------------------------
# Embedding.
# ---------------------------------------------------------------------------
def _gemini_key() -> str:
    value = get_settings().gemini_api_key
    return value.get_secret_value().strip() if value is not None else ""


# Mã lỗi gần nhất của dịch vụ embedding (để chờ rồi thử lại khi bị giới hạn 429).
_last_status: dict[str, int] = {"code": 0}
# Gói miễn phí giới hạn số lượt mỗi phút: chờ rồi thử lại, tối đa ~10 phút cho một lần đồng bộ.
RATE_LIMIT_WAIT_SECONDS = 30.0
RATE_LIMIT_RETRIES = 20
# Embedding câu hỏi lỗi (hết hạn mức, quá tải, mạng chậm): tạm bỏ qua một lúc để mỗi
# câu chat không phải chờ lỗi rồi mới quay về tìm theo từ khóa.
QUERY_PAUSE_SECONDS = 120.0
_query_pause: dict[str, float] = {"until": 0.0}


def query_embedding_paused(now: float | None = None) -> bool:
    return (time.monotonic() if now is None else now) < _query_pause["until"]


def _pause_query_embedding() -> None:
    _query_pause["until"] = time.monotonic() + QUERY_PAUSE_SECONDS


def embedding_model() -> str | None:
    """Model embedding đang dùng, hoặc None khi chưa có Gemini API key."""
    return get_settings().gemini_embedding_model if _gemini_key() else None


def _embed_request(model: str, text: str, *, title: str, query: bool) -> dict[str, Any]:
    request: dict[str, Any] = {"model": f"models/{model}", "outputDimensionality": EMBED_DIMENSIONS}
    if "embedding-001" in model or "text-embedding" in model:
        request["taskType"] = "RETRIEVAL_QUERY" if query else "RETRIEVAL_DOCUMENT"
        if title and not query:
            request["title"] = title
    else:
        # gemini-embedding-2 không có taskType: dùng tiền tố nhiệm vụ trong văn bản.
        text = (
            f"task: search result | query: {text}"
            if query
            else f"title: {title or 'none'} | text: {text}"
        )
    request["content"] = {"parts": [{"text": text}]}
    return request


def normalize(vector: Iterable[float]) -> list[float]:
    values = [float(item) for item in vector]
    norm = math.sqrt(sum(item * item for item in values))
    return [item / norm for item in values] if norm else values


def embed_texts(
    texts: list[str],
    *,
    query: bool,
    titles: list[str] | None = None,
    timeout: float | None = None,
) -> list[list[float]] | None:
    """Gọi Gemini batchEmbedContents; trả None khi lỗi để nơi gọi tự quay về BM25."""
    model = embedding_model()
    if not model or not texts:
        return None
    requests = [
        _embed_request(model, text, title=(titles or [""] * len(texts))[index], query=query)
        for index, text in enumerate(texts)
    ]
    try:
        response = httpx.post(
            EMBED_URL.format(model=model),
            headers={"x-goog-api-key": _gemini_key()},
            json={"requests": requests},
            timeout=timeout or get_settings().assistant_timeout_seconds,
        )
    except httpx.HTTPError:
        logger.warning("Không kết nối được dịch vụ embedding; dùng tìm kiếm từ khóa.")
        if query:
            _pause_query_embedding()
        return None
    if response.status_code != 200:
        _last_status["code"] = response.status_code
        if query:
            _pause_query_embedding()
        logger.warning("Dịch vụ embedding trả lỗi %s; dùng tìm kiếm từ khóa.", response.status_code)
        return None
    _last_status["code"] = 200
    try:
        vectors = [normalize(item["values"]) for item in response.json()["embeddings"]]
    except (KeyError, TypeError, ValueError):
        logger.warning("Phản hồi embedding không đúng định dạng.")
        return None
    return vectors if len(vectors) == len(texts) else None


def pack(vector: list[float]) -> bytes:
    return array("f", vector).tobytes()


def unpack(data: bytes) -> list[float]:
    values = array("f")
    values.frombytes(data)
    return values.tolist()


# ---------------------------------------------------------------------------
# Đồng bộ.
# ---------------------------------------------------------------------------
@dataclass(slots=True)
class SyncReport:
    added: int = 0
    updated: int = 0
    removed: int = 0
    embedded: int = 0
    total: int = 0


def sync_documents(session: Session, documents: list[Document] | None = None) -> SyncReport:
    """Thêm/sửa/xóa đoạn theo mã băm; đoạn đổi nội dung sẽ được tạo embedding lại."""
    documents = build_documents(session) if documents is None else documents
    report = SyncReport(total=len(documents))
    existing = {row.chunk_key: row for row in session.scalars(select(AssistantKnowledgeChunk))}
    wanted = {document.chunk_key for document in documents}
    for document in documents:
        row = existing.get(document.chunk_key)
        if row is None:
            session.add(
                AssistantKnowledgeChunk(
                    chunk_key=document.chunk_key,
                    source_type=document.source_type,
                    source_key=document.source_key,
                    title=document.title[:220],
                    url=document.url[:300],
                    content=document.content,
                    content_hash=document.content_hash,
                )
            )
            report.added += 1
        elif row.content_hash != document.content_hash:
            row.title, row.url = document.title[:220], document.url[:300]
            row.content, row.content_hash = document.content, document.content_hash
            row.source_type, row.source_key = document.source_type, document.source_key
            row.embedding, row.embedding_model = None, None
            report.updated += 1
    stale = [key for key in existing if key not in wanted]
    if stale:
        session.execute(
            delete(AssistantKnowledgeChunk).where(AssistantKnowledgeChunk.chunk_key.in_(stale))
        )
        report.removed = len(stale)
    session.commit()
    return report


def embed_pending(
    session: Session, *, max_batches: int | None = None, wait_on_limit: bool = False
) -> int:
    """Tạo embedding cho đoạn chưa có (hoặc khác model).

    Gặp lỗi thì dừng để lần sau thử lại; riêng lỗi giới hạn tần suất (429) khi chạy nền thì chờ
    một lúc rồi làm tiếp, để cả kho được tạo embedding dần trong hạn mức gói miễn phí.
    """
    model = embedding_model()
    if not model:
        return 0
    done = 0
    batches = 0
    waits = 0
    while max_batches is None or batches < max_batches:
        rows = list(
            session.scalars(
                select(AssistantKnowledgeChunk)
                .where(
                    (AssistantKnowledgeChunk.embedding.is_(None))
                    | (AssistantKnowledgeChunk.embedding_model != model)
                    | (AssistantKnowledgeChunk.embedding_model.is_(None))
                )
                .order_by(AssistantKnowledgeChunk.chunk_key)
                .limit(EMBED_BATCH)
            )
        )
        if not rows:
            break
        vectors = embed_texts(
            [row.content for row in rows], query=False, titles=[row.title for row in rows]
        )
        if vectors is None:
            session.rollback()
            if wait_on_limit and _last_status["code"] == 429 and waits < RATE_LIMIT_RETRIES:
                waits += 1
                time.sleep(RATE_LIMIT_WAIT_SECONDS)
                continue
            break
        for row, vector in zip(rows, vectors, strict=True):
            row.embedding, row.embedding_model = pack(vector), model
        session.commit()
        done += len(rows)
        batches += 1
    return done


def pending_embeddings(session: Session) -> int:
    model = embedding_model()
    if not model:
        return 0
    return int(
        session.scalar(
            select(func.count(AssistantKnowledgeChunk.id)).where(
                (AssistantKnowledgeChunk.embedding.is_(None))
                | (AssistantKnowledgeChunk.embedding_model != model)
                | (AssistantKnowledgeChunk.embedding_model.is_(None))
            )
        )
        or 0
    )


def knowledge_status(session: Session) -> dict[str, Any]:
    rows = session.execute(
        select(
            AssistantKnowledgeChunk.source_type, func.count(AssistantKnowledgeChunk.id)
        ).group_by(AssistantKnowledgeChunk.source_type)
    ).all()
    by_type = {source: int(count) for source, count in rows}
    total = sum(by_type.values())
    pending = pending_embeddings(session)
    return {
        "chunks": total,
        "by_type": by_type,
        "embedding_model": embedding_model(),
        "embedded": total - pending if embedding_model() else 0,
        "pending": pending,
        "retrieval": "hybrid" if embedding_model() else "bm25",
        "syncing": bool(_state["running"]),
    }


def sync_knowledge(session: Session, *, wait_on_limit: bool = False) -> SyncReport:
    report = sync_documents(session)
    report.embedded = embed_pending(session, wait_on_limit=wait_on_limit)
    return report


# ---------------------------------------------------------------------------
# Tự làm mới ở nền khi món/bài viết thay đổi.
# ---------------------------------------------------------------------------
_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="rag-sync")
_state_lock = threading.Lock()
_state: dict[str, Any] = {"signature": None, "checked_at": 0.0, "running": False}


def reset_sync_state() -> None:
    with _state_lock:
        _state.update(signature=None, checked_at=0.0, running=False)
    _query_pause["until"] = 0.0


def _run_sync(factory: sessionmaker[Session], signature: tuple[Any, ...]) -> None:
    try:
        with factory() as session:
            report = sync_knowledge(session, wait_on_limit=get_settings().app_env != "test")
            complete = pending_embeddings(session) == 0
        logger.info(
            "Đồng bộ kho tri thức: +%s ~%s -%s, embedding %s/%s đoạn.",
            report.added,
            report.updated,
            report.removed,
            report.embedded,
            report.total,
        )
        # Còn đoạn chưa có embedding (mạng lỗi, hết hạn mức) thì lần kiểm tra sau thử lại.
        if complete:
            with _state_lock:
                _state["signature"] = signature
    except Exception:  # noqa: BLE001 - lỗi đồng bộ không được làm hỏng trợ lý
        logger.exception("Đồng bộ kho tri thức thất bại; sẽ thử lại ở lần sau.")
    finally:
        with _state_lock:
            _state["running"] = False


def ensure_fresh(bind: Engine | Connection, *, force: bool = False) -> bool:
    """Đồng bộ lại khi nguồn đổi (chạy nền; môi trường test chạy ngay). True nếu đã chạy."""
    now = time.monotonic()
    with _state_lock:
        if _state["running"] or (
            not force and now - float(_state["checked_at"]) < CHECK_INTERVAL_SECONDS
        ):
            return False
        _state["checked_at"] = now
    factory = sessionmaker(bind=bind, autoflush=False, expire_on_commit=False)
    with factory() as session:
        signature = source_signature(session)
    with _state_lock:
        if not force and signature == _state["signature"]:
            return False
        _state["running"] = True
    if get_settings().app_env == "test":
        _run_sync(factory, signature)
    else:
        _executor.submit(_run_sync, factory, signature)
    return True
