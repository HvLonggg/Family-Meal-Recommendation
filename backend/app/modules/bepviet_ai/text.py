"""Chuẩn hóa tiếng Việt khẩu ngữ và trích đặc trưng băm (hashing trick) cho mô hình."""

from __future__ import annotations

import re
import unicodedata
import zlib
from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from app.modules.recipes.search import normalize_search

# 2^18 chiều: đủ thưa để ít va chạm, còn trọng số thực chỉ lưu các chiều đã gặp khi huấn luyện.
HASH_BITS = 18
HASH_DIM = 1 << HASH_BITS
_MASK = HASH_DIM - 1
BIAS = "__bias__"

# Viết tắt/khẩu ngữ thường gặp khi chat (khớp theo cả từ, sau khi viết thường).
ABBREVIATIONS: dict[str, str] = {
    "ko": "không",
    "k": "không",
    "kh": "không",
    "khg": "không",
    "hok": "không",
    "hk": "không",
    "hong": "không",
    "hông": "không",
    "hem": "không",
    "dc": "được",
    "đc": "được",
    "dk": "được",
    "đk": "được",
    "duoc": "được",
    "mik": "mình",
    "mk": "mình",
    "mjk": "mình",
    "mh": "mình",
    "bn": "bạn",
    "b": "bạn",
    "bnhiu": "bao nhiêu",
    "bnh": "bao nhiêu",
    "nhiu": "nhiêu",
    "j": "gì",
    "gj": "gì",
    "ntn": "như thế nào",
    "r": "rồi",
    "roy": "rồi",
    "oy": "rồi",
    "vs": "với",
    "trc": "trước",
    "ns": "nói",
    "nc": "nước",
    "cx": "cũng",
    "cg": "cũng",
    "thik": "thích",
    "lm": "làm",
    "z": "vậy",
    "v": "vậy",
    "ng": "người",
    "mn": "mọi người",
    "bh": "bây giờ",
    "bjo": "bây giờ",
    "hum": "hôm",
    "mún": "muốn",
    "mun": "muốn",
    "wa": "quá",
    "ik": "đi",
    "nhìu": "nhiều",
    "tks": "cảm ơn",
    "thanks": "cảm ơn",
    "thank": "cảm ơn",
    "ok": "ok",
    "oke": "ok",
    "okie": "ok",
    "okela": "ok",
}
# Không đổi các chữ cái đơn khi câu là tiếng Anh ("vitamin k", "plan b").
_ENGLISH_HINTS = frozenset({"the", "how", "what", "is", "to", "recipe", "for", "of", "an", "and"})
_TOKEN = re.compile(r"\w+", re.UNICODE)
# "10p", "15ph" → "10 phút"; "2h" → "2 giờ"; "3ng" → "3 người".
_UNIT_SUFFIX = re.compile(r"\b(\d+)\s*(p|ph|phut|h|tieng|ng)\b")
_UNIT_WORD = {"p": "phút", "ph": "phút", "phut": "phút", "h": "giờ", "tieng": "tiếng"}


def expand(text: str) -> str:
    """Viết thường, chuẩn NFC, mở rộng viết tắt; GIỮ dấu tiếng Việt."""
    lowered = unicodedata.normalize("NFC", text.lower())
    lowered = _UNIT_SUFFIX.sub(
        lambda match: f"{match.group(1)} {_UNIT_WORD.get(match.group(2), 'người')}", lowered
    )
    tokens = _TOKEN.findall(lowered)
    english = len(_ENGLISH_HINTS.intersection(tokens)) >= 2
    out: list[str] = []
    for token in tokens:
        if english and token in ("b", "v", "r", "j", "z", "k"):
            out.append(token)
        else:
            out.append(ABBREVIATIONS.get(token, token))
    return " ".join(out)


def strip_accents(text: str) -> str:
    """Bỏ dấu + chỉ giữ chữ/số (tái dùng chuẩn hóa của tìm kiếm món)."""
    return normalize_search(text)


def normalize(text: str) -> tuple[str, str]:
    """(bản có dấu đã mở rộng viết tắt, bản không dấu)."""
    accented = expand(text)
    return accented, strip_accents(accented)


@dataclass(frozen=True, slots=True)
class FeatureConfig:
    """Cấu hình trích đặc trưng; lưu kèm mô hình để lúc chạy dùng đúng cấu hình đã huấn luyện."""

    char_low: int = 2
    char_high: int = 5
    word_n: int = 2
    # Hệ số cho n-gram từ so với n-gram ký tự (ký tự nhiều gấp ~10 lần nên dễ lấn át).
    word_weight: float = 1.0

    def as_dict(self) -> dict[str, float]:
        return {
            "char_low": self.char_low,
            "char_high": self.char_high,
            "word_n": self.word_n,
            "word_weight": self.word_weight,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any] | None) -> FeatureConfig:
        data = data or {}
        return cls(
            char_low=int(data.get("char_low", 2)),
            char_high=int(data.get("char_high", 5)),
            word_n=int(data.get("word_n", 2)),
            word_weight=float(data.get("word_weight", 1.0)),
        )


DEFAULT_FEATURES = FeatureConfig()


def _char_grams(word: str, low: int, high: int) -> Iterable[str]:
    padded = f"<{word}>"
    for size in range(low, high + 1):
        for start in range(0, len(padded) - size + 1):
            yield padded[start : start + size]


def tokens_for(text: str, config: FeatureConfig = DEFAULT_FEATURES) -> list[str]:
    """Đặc trưng dạng chuỗi: n-gram từ + n-gram ký tự trong từ, có dấu và không dấu."""
    accented, plain = normalize(text)
    features: set[str] = {BIAS}
    variants = [("u", plain.split())]
    if accented != plain:
        # Người dùng gõ có dấu: thêm đặc trưng có dấu (phân biệt "cá"/"cà", "bò"/"bơ").
        variants.append(("a", _TOKEN.findall(accented)))
    for tag, words in variants:
        for index, word in enumerate(words):
            for size in range(1, config.word_n + 1):
                if index + size <= len(words):
                    features.add(f"{tag}w{size}:{' '.join(words[index : index + size])}")
            for gram in _char_grams(word, config.char_low, config.char_high):
                features.add(f"{tag}c:{gram}")
    return sorted(features)


def hash_feature(feature: str) -> int:
    # crc32 ổn định giữa các tiến trình (khác hash() của Python vốn bị ngẫu nhiên hóa).
    return zlib.crc32(feature.encode("utf-8")) & _MASK


def featurize(text: str, config: FeatureConfig = DEFAULT_FEATURES) -> list[tuple[int, float]]:
    """Vector thưa đã chuẩn hóa L2: [(chỉ số băm, giá trị)]."""
    counts: dict[int, float] = {}
    for feature in tokens_for(text, config):
        index = hash_feature(feature)
        weight = config.word_weight if feature[1:2] == "w" else 1.0
        counts[index] = counts.get(index, 0.0) + weight
    norm = sum(value * value for value in counts.values()) ** 0.5 or 1.0
    return [(index, value / norm) for index, value in sorted(counts.items())]
