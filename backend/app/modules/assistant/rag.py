"""Truy xuất lai cho RAG: BM25 (từ đơn + cặp từ tiếng Việt) kết hợp vector Gemini.

Hai danh sách xếp hạng được gộp bằng Reciprocal Rank Fusion, giới hạn số đoạn mỗi nguồn để ngữ
cảnh đa dạng. Không có API key thì chỉ dùng BM25, vẫn chạy được hoàn toàn miễn phí.
"""

from __future__ import annotations

import math
import re
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.modules.assistant import engine, knowledge
from app.modules.assistant.models import AssistantKnowledgeChunk
from app.modules.assistant.warm_cache import StaleWhileRevalidate
from app.modules.recipes.search import normalize_search

BM25_K1 = 1.4
BM25_B = 0.72
RRF_K = 60
CANDIDATES = 30
MAX_PER_SOURCE = 2
QUERY_EMBED_TIMEOUT = 3.0
# Điểm BM25 tối thiểu (đã chuẩn hóa theo độ dài câu hỏi) để coi là có liên quan.
MIN_LEXICAL = 0.9
# Vector: bỏ đoạn quá xa so với đoạn gần nhất (thang cosine khác nhau giữa các model).
MIN_DENSE = 0.3
DENSE_MARGIN = 0.2

# Từ chức năng phổ biến; giữ lại từ chỉ món như "ga", "ca", "bo".
_STOPWORD_TEXT = """a ah ak oi nhe nha nhi ha vay the thi la va voi cua cho toi minh ban em anh chi
    co khong nao gi sao duoc mot nhung cac nay kia do day roi lam di len ra vao hay hoac
    neu khi thi de nen rat qua cung con van chua da dang se bi muon can biet xin hoi
    giup chut ti xiu what how the is are a an of to for and or in on with do does can i you"""
STOPWORDS = frozenset(_STOPWORD_TEXT.split())


_REGION_PAIR = {"bac", "trung", "nam", "tay"}


def tokenize(text: str) -> list[str]:
    """Từ đơn bỏ dấu + cặp từ liền nhau (tiếng Việt ghép âm tiết: "thit bo", "nuoc mam")."""
    words = re.findall(r"[a-z0-9]+", normalize_search(text))
    # "miền Trung" chỉ giữ đúng cặp từ đó: bỏ dấu thì "mien" trùng "miến", "trung" trùng "trứng",
    # nên từ đơn và các cặp ghép chéo ("mon_mien", "trung_cay") đều gây khớp nhầm.
    starts = {
        index
        for index, word in enumerate(words[:-1])
        if word == "mien" and words[index + 1] in _REGION_PAIR
    }
    region = starts | {index + 1 for index in starts}
    terms = [
        word
        for position, word in enumerate(words)
        if word not in STOPWORDS and position not in region
    ]
    bigrams = [
        f"{words[index]}_{words[index + 1]}"
        for index in range(len(words) - 1)
        if not (words[index] in STOPWORDS and words[index + 1] in STOPWORDS)
        and (index in starts or not ({index, index + 1} & region))
    ]
    return terms + bigrams


@dataclass(frozen=True, slots=True)
class Chunk:
    chunk_key: str
    source_type: str
    source_key: str
    title: str
    url: str
    content: str


@dataclass(slots=True)
class Hit:
    chunk: Chunk
    score: float
    lexical: float = 0.0
    dense: float = 0.0


@dataclass(slots=True)
class Index:
    chunks: list[Chunk] = field(default_factory=list)
    lengths: list[int] = field(default_factory=list)
    postings: dict[str, list[tuple[int, int]]] = field(default_factory=dict)
    vectors: list[list[float] | None] = field(default_factory=list)
    model: str | None = None
    average_length: float = 1.0

    @property
    def has_vectors(self) -> bool:
        return any(vector is not None for vector in self.vectors)

    def lexical(self, terms: list[str], limit: int) -> list[tuple[int, float]]:
        total = len(self.chunks)
        scores: dict[int, float] = defaultdict(float)
        for term, weight in Counter(terms).items():
            posting = self.postings.get(term)
            if not posting:
                continue
            idf = math.log(1 + (total - len(posting) + 0.5) / (len(posting) + 0.5))
            for position, frequency in posting:
                norm = 1 - BM25_B + BM25_B * self.lengths[position] / self.average_length
                scores[position] += (
                    weight * idf * frequency * (BM25_K1 + 1) / (frequency + BM25_K1 * norm)
                )
        return sorted(scores.items(), key=lambda item: -item[1])[:limit]

    def dense(self, query: list[float], limit: int) -> list[tuple[int, float]]:
        scored = [
            (position, sum(a * b for a, b in zip(query, vector, strict=False)))
            for position, vector in enumerate(self.vectors)
            if vector is not None
        ]
        return sorted(scored, key=lambda item: -item[1])[:limit]


def build_index(rows: list[Any]) -> Index:
    index = Index(model=knowledge.embedding_model())
    postings: dict[str, list[tuple[int, int]]] = defaultdict(list)
    for position, row in enumerate(rows):
        chunk = Chunk(
            row.chunk_key, row.source_type, row.source_key, row.title, row.url, row.content
        )
        # Tiêu đề lặp hai lần để khớp tên món/bài viết nặng ký hơn thân bài.
        counts = Counter(tokenize(f"{row.title}\n{row.title}\n{row.content}"))
        for term, frequency in counts.items():
            postings[term].append((position, frequency))
        index.chunks.append(chunk)
        index.lengths.append(sum(counts.values()))
        same_model = row.embedding is not None and row.embedding_model == index.model
        index.vectors.append(knowledge.unpack(row.embedding) if same_model else None)
    index.postings = dict(postings)
    index.average_length = sum(index.lengths) / len(index.lengths) if index.lengths else 1.0
    return index


_index_cache: StaleWhileRevalidate[Index] = StaleWhileRevalidate("rag-index")


def reset_index_cache() -> None:
    _index_cache.reset()


def load_index(session: Session) -> Index:
    signature = session.execute(
        select(
            func.count(AssistantKnowledgeChunk.id),
            func.max(AssistantKnowledgeChunk.updated_at),
            func.count(AssistantKnowledgeChunk.embedding),
        )
    ).one()
    key = (*signature, knowledge.embedding_model())
    return _index_cache.get(session, key, _build_index_from_db)


def _build_index_from_db(session: Session) -> Index:
    rows = list(
        session.execute(
            select(
                AssistantKnowledgeChunk.chunk_key,
                AssistantKnowledgeChunk.source_type,
                AssistantKnowledgeChunk.source_key,
                AssistantKnowledgeChunk.title,
                AssistantKnowledgeChunk.url,
                AssistantKnowledgeChunk.content,
                AssistantKnowledgeChunk.embedding,
                AssistantKnowledgeChunk.embedding_model,
            ).order_by(AssistantKnowledgeChunk.chunk_key)
        )
    )
    return build_index(rows)


# ---------------------------------------------------------------------------
# Truy xuất.
# ---------------------------------------------------------------------------
def build_query(message: str, history: list[tuple[str, str]]) -> str:
    """Câu hỏi nối tiếp ngắn ("còn món khác?") được ghép với câu hỏi trước của người dùng."""
    if len(tokenize(message)) >= 6:
        return message
    previous = next((text for role, text in reversed(history) if role == "user"), "")
    return f"{previous}\n{message}".strip() if previous else message


_REGION_TERMS = {"Bắc": "mien bac", "Trung": "mien trung", "Nam": "mien nam"}


def expand_query(query: str) -> str:
    """Thêm tên miền khi người dùng nhắc địa danh ("Huế", "Sài Gòn", "southern")
    để khớp dòng "Vùng miền: …" trong tài liệu món; câu đã có "miền X" thì giữ nguyên."""
    plain = f" {normalize_search(query)} "
    extra = [
        term
        for region, term in _REGION_TERMS.items()
        if f" {term} " not in plain
        and any(f" {phrase} " in plain for phrase in engine.REGION_WORDS[region])
    ]
    return f"{query}\n{' '.join(extra)}" if extra else query


# Cụm hỏi chung chung trùng tên món sau khi bỏ dấu ("gợi ý" ~ "gỏi", "món ngon" ~ "ngọn").
_QUERY_FILLERS = re.compile(r"(?:^| )(?:goi y|de xuat|mon ngon|an gi|nau gi|mon gi)(?= |$)")


def _query_terms(query: str) -> list[str]:
    return tokenize(_QUERY_FILLERS.sub(" ", normalize_search(expand_query(query))))


def retrieve(session: Session, query: str, *, k: int = 6, use_vectors: bool = True) -> list[Hit]:
    index = load_index(session)
    terms = _query_terms(query)
    if not index.chunks or not query.strip():
        return []
    query_terms = max(1, len(set(terms)))
    lexical = [
        (position, score)
        for position, score in index.lexical(terms, CANDIDATES)
        if score / math.sqrt(query_terms) >= MIN_LEXICAL
    ]
    dense: list[tuple[int, float]] = []
    if use_vectors and index.has_vectors and not knowledge.query_embedding_paused():
        vectors = knowledge.embed_texts([query], query=True, timeout=QUERY_EMBED_TIMEOUT)
        ranked = index.dense(vectors[0], CANDIDATES) if vectors else []
        if ranked:
            floor = max(MIN_DENSE, ranked[0][1] - DENSE_MARGIN)
            dense = [item for item in ranked if item[1] >= floor]

    fused: dict[int, Hit] = {}
    for ranking, attribute in ((lexical, "lexical"), (dense, "dense")):
        for rank, (position, score) in enumerate(ranking, start=1):
            hit = fused.setdefault(position, Hit(index.chunks[position], 0.0))
            hit.score += 1 / (RRF_K + rank)
            setattr(hit, attribute, score)

    per_source: Counter[str] = Counter()
    results: list[Hit] = []
    for hit in sorted(fused.values(), key=lambda item: -item.score):
        source = f"{hit.chunk.source_type}:{hit.chunk.source_key}"
        if per_source[source] >= MAX_PER_SOURCE:
            continue
        per_source[source] += 1
        results.append(hit)
        if len(results) >= k:
            break
    return results


def context_block(hits: list[Hit]) -> str:
    if not hits:
        return "<tai_lieu>(không tìm thấy tài liệu liên quan)</tai_lieu>"
    parts = [
        f'<doan so="{number}" nguon="{hit.chunk.title}" duong_dan="{hit.chunk.url}">\n'
        f"{hit.chunk.content}\n</doan>"
        for number, hit in enumerate(hits, start=1)
    ]
    return "<tai_lieu>\n" + "\n".join(parts) + "\n</tai_lieu>"


_CITATION = re.compile(r"\s?\[(\d{1,2}(?:\s*,\s*\d{1,2})*)\]")


def extract_citations(text: str, hits: list[Hit]) -> tuple[str, list[Hit]]:
    """Bỏ dấu trích dẫn [n] khỏi câu trả lời, trả về các nguồn được trích (giữ thứ tự)."""
    cited: list[Hit] = []
    seen: set[str] = set()

    def collect(match: re.Match[str]) -> str:
        for raw in match.group(1).split(","):
            number = int(raw.strip())
            if 1 <= number <= len(hits):
                hit = hits[number - 1]
                source = f"{hit.chunk.source_type}:{hit.chunk.source_key}"
                if source not in seen:
                    seen.add(source)
                    cited.append(hit)
        return ""

    cleaned = _CITATION.sub(collect, text)
    return re.sub(r"[ \t]+\n", "\n", cleaned).strip(), cited


QUESTION_WORDS = (
    "bao lau",
    "bao nhieu",
    "the nao",
    "lam sao",
    "cach",
    "may phut",
    "may gio",
    "o dau",
    "la gi",
    "tai sao",
    "vi sao",
    "co nen",
    "how",
    "what",
    "why",
    "where",
)
MIN_COVERAGE = 0.6


def is_question(text: str) -> bool:
    plain = f" {normalize_search(text)} "
    return "?" in text or any(f" {word} " in plain for word in QUESTION_WORDS)


def _split_terms(text: str) -> tuple[set[str], set[str]]:
    terms = set(tokenize(text))
    return {t for t in terms if "_" not in t and len(t) > 1}, {t for t in terms if "_" in t}


def confident(query: str, chunk: Chunk) -> bool:
    """Đủ chắc để trích nguyên văn: phủ phần lớn từ khóa và trùng ít nhất một cụm hai từ.

    Chỉ dựa vào từ đơn đã bỏ dấu dễ nhầm ("lầu"/"lâu"), nên bắt buộc có cụm từ khớp.
    """
    # Từ hỏi ("bao lâu", "thế nào") không phải nội dung cần có trong tài liệu.
    plain = f" {normalize_search(query)} "
    for phrase in QUESTION_WORDS:
        plain = plain.replace(f" {phrase} ", " ")
    words, pairs = _split_terms(plain)
    if len(words) < 2:
        return False
    chunk_terms = set(tokenize(f"{chunk.title}\n{chunk.content}"))
    coverage = len(words & chunk_terms) / len(words)
    return coverage >= MIN_COVERAGE and (not pairs or bool(pairs & chunk_terms))


def names_source(query: str, chunk: Chunk) -> bool:
    """Câu hỏi có nhắc tên nguồn (ví dụ "phở bò" của "Phở bò Hà Nội")."""
    _, title_pairs = _split_terms(chunk.title.split(" — ")[0])
    return bool(title_pairs & set(tokenize(query)))


def extractive_answer(
    query: str, hits: list[Hit], language: str, *, must_name_source: bool = False
) -> tuple[str, Hit] | None:
    """Trả lời không cần LLM: trích những câu khớp nhất trong đoạn đủ tin cậy và sát ý nhất."""
    terms = set(tokenize(query))
    candidates = [
        hit
        for hit in hits[:4]
        if hit.lexical > 0
        and confident(query, hit.chunk)
        and (not must_name_source or names_source(query, hit.chunk))
    ]
    if not candidates:
        return None

    def best_sentence(hit: Hit) -> int:
        return max(
            (
                len(terms & set(tokenize(line)))
                for line in re.split(r"[.!?…\n]+", hit.chunk.content)
            ),
            default=0,
        )

    # Ưu tiên đoạn có một câu trả lời trúng nhiều từ khóa nhất (bước "hầm 3 giờ" hơn phần mô tả).
    best = max(candidates, key=lambda hit: (best_sentence(hit), -candidates.index(hit)))
    sentences = [
        sentence.strip(" -")
        for sentence in re.split(r"(?<=[.!?…])\s+|\n+", best.chunk.content)
        if len(sentence.strip()) > 12
    ]
    scored = sorted(
        (
            (len(terms & set(tokenize(sentence))), position, sentence)
            for position, sentence in enumerate(sentences)
        ),
        key=lambda item: (-item[0], item[1]),
    )
    chosen = sorted((item for item in scored[:3] if item[0] > 0), key=lambda item: item[1])
    if not chosen:
        return None
    body = "\n".join(f"- {sentence}" for _, _, sentence in chosen)
    if language == "en":
        return f"Here is what I found in **{best.chunk.title}**:\n{body}", best
    return f"Mình tìm thấy trong **{best.chunk.title}** nè:\n{body}", best
