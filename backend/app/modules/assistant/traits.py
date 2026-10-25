"""Nhận diện yêu cầu về vị và cách chế biến ("ít dầu", "ngọt thanh"…) rồi chấm điểm từng món.

Kho món không có thẻ vị riêng, nên điểm được suy ra từ cách chế biến, lượng dầu mỡ trong nguyên
liệu và lời mô tả món. Món khớp nhất xếp trước; nếu không món nào khớp hết thì vẫn lấy món gần
giống nhất và báo cho người dùng biết.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Protocol


class TraitTarget(Protocol):
    """Thuộc tính chỉ đọc của một món (khớp ``engine.RecipeEntry``)."""

    @property
    def name_norm(self) -> str: ...
    @property
    def detail_norm(self) -> str: ...
    @property
    def methods(self) -> tuple[str, ...]: ...
    @property
    def category(self) -> str: ...
    @property
    def spicy(self) -> int: ...
    @property
    def oil_ml(self) -> float: ...


@dataclass(frozen=True, slots=True)
class Trait:
    key: str
    label_vi: str
    label_en: str
    # Cụm từ trong câu hỏi (đã bỏ dấu). Tránh từ đơn dễ nhầm:
    # "chua" (chưa), "nhe" (nhé), "mat" (mất).
    phrases: tuple[str, ...]
    cues: tuple[str, ...] = ()
    prefer: tuple[str, ...] = ()
    avoid: tuple[str, ...] = ()
    categories: tuple[str, ...] = ()
    oil: int = 0  # -1: càng ít dầu càng tốt, +1: món béo, nhiều dầu


LIGHT_METHODS = ("luoc", "hap", "canh", "nau", "ham", "tron", "goi", "nuong", "chung", "om")

TRAITS: tuple[Trait, ...] = (
    Trait(
        "low_oil",
        "ít dầu mỡ",
        "less oil",
        (
            "it dau",
            "it mo",
            "khong dau mo",
            "it beo",
            "khong chien",
            "khong ngay",
            "eat clean",
            "an kieng",
            "giam can",
            "healthy",
            "low oil",
            "less oil",
            "not greasy",
        ),
        cues=("it dau", "thanh dam", "khong ngay"),
        prefer=LIGHT_METHODS,
        avoid=("chien", "ran", "quay"),
        oil=-1,
    ),
    Trait(
        "light_sweet",
        "ngọt thanh",
        "light & naturally sweet",
        ("ngot thanh", "thanh ngot", "vi thanh", "ngot diu", "ngot nhe", "ngot tu nhien"),
        cues=("ngot thanh", "thanh mat", "ngot diu", "ngot tu nhien", "ngot mat", "thanh ngot"),
        prefer=("canh", "luoc", "hap", "ham", "nau", "chung"),
        categories=("Món canh",),
    ),
    Trait(
        "sour",
        "chua thanh",
        "tangy",
        ("vi chua", "chua chua", "chua thanh", "chua ngot", "mon chua", "an chua", "hoi chua"),
        cues=("chua", "me chua", "giam", "khe"),
    ),
    Trait(
        "rich",
        "đậm đà",
        "rich & savoury",
        ("dam da", "dam vi", "dua com", "man ma", "dam dac"),
        cues=("dam da", "dua com", "dam vi", "man ngot", "keo"),
        prefer=("kho", "rim", "ram", "xao", "um"),
    ),
    Trait(
        "crispy",
        "giòn",
        "crispy",
        ("gion", "gion rum", "gion tan"),
        cues=("gion",),
        prefer=("chien", "ran", "nuong", "quay"),
    ),
    Trait(
        "cooling",
        "thanh mát",
        "cooling",
        ("thanh mat", "cho mat", "an mat", "giai nhiet", "ngay nong", "troi nong", "mua he"),
        cues=("mat", "giai nhiet", "ngay nong", "thanh nhiet"),
        prefer=("canh", "luoc", "goi", "tron"),
        categories=("Món canh",),
        oil=-1,
    ),
    Trait(
        "warming",
        "ấm bụng",
        "warming",
        ("am bung", "am nong", "troi lanh", "mua dong", "ngay lanh", "troi mua"),
        cues=("am bung", "am nong", "nong hoi", "gung"),
        prefer=("ham", "chao", "lau", "nau", "om"),
    ),
    Trait(
        "light",
        "nhẹ bụng",
        "light",
        ("an nhe", "nhe bung", "de tieu", "thanh dam", "khong ngan", "mon nhe"),
        cues=("thanh dam", "nhe nhang", "de an", "de tieu"),
        prefer=("chao", "canh", "hap", "luoc"),
        oil=-1,
    ),
    Trait(
        "creamy",
        "béo ngậy",
        "rich & creamy",
        ("beo ngay", "beo bui", "vi beo", "mon beo", "nuoc cot dua"),
        cues=("beo", "cot dua", "ngay"),
        prefer=("chien", "nuong", "quay"),
        oil=1,
    ),
    Trait(
        "soft",
        "mềm, dễ nhai",
        "soft & easy to chew",
        ("mem", "de nhai", "nguoi gia", "rang yeu"),
        cues=("mem", "tan", "nhuyen", "nhu"),
        prefer=("ham", "chung", "chao", "om", "hap"),
    ),
)
BY_KEY = {trait.key: trait for trait in TRAITS}
MATCHED = 1.5


def _has(text: str, phrase: str) -> bool:
    return re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", text) is not None


def detect(text_norm: str) -> list[str]:
    """Các yêu cầu vị/cách nấu có trong câu hỏi đã bỏ dấu, theo thứ tự xuất hiện."""
    found: list[tuple[int, str]] = []
    for trait in TRAITS:
        positions = [
            match.start()
            for phrase in trait.phrases
            if (match := re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", text_norm))
        ]
        if positions:
            found.append((min(positions), trait.key))
    return [key for _, key in sorted(found)]


def score(entry: TraitTarget, key: str) -> float:
    trait = BY_KEY[key]
    text = f"{entry.name_norm} {entry.detail_norm}"
    words = set(entry.methods) | set(entry.name_norm.split())
    points = 0.0
    if any(_has(text, cue) for cue in trait.cues):
        points += 2.0
    if any(method in words for method in trait.prefer):
        points += 1.2
    if any(method in words for method in trait.avoid):
        points -= 2.5
    if trait.categories and entry.category in trait.categories:
        points += 0.8
    if trait.oil < 0:
        points += 1.0 if entry.oil_ml <= 8 else -1.5 if entry.oil_ml >= 25 else 0.0
    elif trait.oil > 0 and entry.oil_ml >= 15:
        points += 1.0
    if key in ("light_sweet", "cooling", "light") and entry.spicy >= 2:
        points -= 1.0
    return points


def total(entry: TraitTarget, keys: list[str]) -> tuple[int, float]:
    """(số yêu cầu khớp, tổng điểm): món khớp nhiều yêu cầu nhất, rồi điểm cao nhất, lên đầu."""
    points = [score(entry, key) for key in keys]
    return sum(point >= MATCHED for point in points), sum(points)


def labels(keys: list[str], language: str) -> list[str]:
    return [BY_KEY[key].label_en if language == "en" else BY_KEY[key].label_vi for key in keys]


_OIL_UNITS = {
    "ml": 1.0,
    "lit": 1000.0,
    "l": 1000.0,
    "muong canh": 15.0,
    "thia canh": 15.0,
    "muong": 10.0,
    "thia": 10.0,
    "muong ca phe": 5.0,
    "thia ca phe": 5.0,
    "muong cafe": 5.0,
    "gam": 1.0,
    "gr": 1.0,
    "g": 1.0,
}


def oil_amount(name_norm: str, amount: float | None, unit_norm: str) -> float:
    """Ước lượng ml dầu/mỡ của một dòng nguyên liệu (0 nếu không phải dầu mỡ)."""
    # Khớp nguyên tên: "bo" một mình là bơ (không phải "thịt bò"), "dau" không phải đậu/dâu.
    is_fat = re.fullmatch(
        r"(?:dau(?: an| oliu| olive| me| dieu| hat cai| thuc vat)?"
        r"|mo(?: heo| lon| ga| hanh| nuoc)?|bo(?: lat| man| thuc vat)?)",
        name_norm.strip(),
    )
    if not is_fat:
        return 0.0
    if amount is None:
        return 15.0
    factor = next(
        (
            value
            for unit, value in sorted(_OIL_UNITS.items(), key=lambda i: -len(i[0]))
            if unit_norm.startswith(unit)
        ),
        10.0,
    )
    return float(amount) * factor
