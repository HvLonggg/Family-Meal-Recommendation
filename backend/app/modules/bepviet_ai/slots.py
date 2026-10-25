"""Trích thông tin (slot) từ câu hỏi: món, số người, nguyên liệu, bữa, thời lượng.

Tái dùng bộ hiểu câu của trợ lý (`engine.parse_intent`) cho nguyên liệu/bữa/thời gian,
`cooking.durations.spoken_seconds` cho thời lượng nói ra, và kho món thật để khớp tên món.
"""

from __future__ import annotations

import re
from collections.abc import Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime
from typing import Any

from app.modules.assistant import engine
from app.modules.bepviet_ai.catalog import match_dishes, residual
from app.modules.bepviet_ai.text import normalize
from app.modules.cooking.durations import spoken_seconds

NUMBER_WORDS = {
    "mot": 1,
    "hai": 2,
    "ba": 3,
    "bon": 4,
    "tu": 4,
    "nam": 5,
    "sau": 6,
    "bay": 7,
    "tam": 8,
    "chin": 9,
    "muoi": 10,
    "one": 1,
    "two": 2,
    "three": 3,
    "four": 4,
    "five": 5,
    "six": 6,
    "seven": 7,
    "eight": 8,
    "nine": 9,
    "ten": 10,
}
_PEOPLE = re.compile(
    r"(?:^| )(\d{1,2}|" + "|".join(NUMBER_WORDS) + r") (?:nguoi|suat|phan|khau phan|"
    r"thanh vien|people|persons|person|servings|serving|guests)(?: |$)"
)


@dataclass(slots=True)
class Slots:
    dish: str | None = None
    dish_name: str | None = None
    dish_candidates: list[str] = field(default_factory=list)
    # Cụm người dùng có vẻ nêu tên món nhưng không có trong kho (không được bịa công thức).
    dish_unknown: str | None = None
    dish_from_history: bool = False
    servings: int | None = None
    ingredients: list[str] = field(default_factory=list)
    excluded: list[str] = field(default_factory=list)
    meal: str | None = None
    meal_inferred: str = ""
    max_minutes: int | None = None
    duration_seconds: int | None = None
    # Kết quả đầy đủ của bộ hiểu câu trợ lý (vùng miền, chay, ít dầu…) cho bộ gợi ý món.
    parsed: engine.Intent | None = field(default=None, repr=False)

    def as_dict(self) -> dict[str, Any]:
        data = asdict(self)
        data.pop("parsed", None)
        return {key: value for key, value in data.items() if value not in (None, [], "", False)}


def servings_from(plain: str) -> int | None:
    match = _PEOPLE.search(plain)
    if not match:
        return None
    raw = match.group(1)
    value = int(raw) if raw.isdigit() else NUMBER_WORDS[raw]
    return max(1, min(30, value))


def extract(
    message: str,
    entries: list[engine.RecipeEntry] | None = None,
    *,
    history: Sequence[tuple[str, str]] = (),
    now: datetime | None = None,
    full: bool = True,
) -> Slots:
    """`full=False` bỏ qua bộ hiểu câu đầy đủ (chậm hơn) khi chỉ cần món + số người."""
    _accented, plain = normalize(message)
    slots = Slots(
        servings=servings_from(plain),
        meal_inferred=engine.current_meal(now),
        duration_seconds=spoken_seconds(message),
    )
    if full:
        parsed = engine.parse_intent(plain, [])
        slots.parsed = parsed
        slots.servings = slots.servings or parsed.servings
        slots.ingredients = list(parsed.include)
        slots.excluded = list(parsed.exclude)
        slots.meal = parsed.meal
        slots.max_minutes = parsed.max_minutes
    catalog = entries or []
    matches = match_dishes(plain, catalog)
    if len(matches) == 1 or (matches and matches[0].exact):
        slots.dish, slots.dish_name = matches[0].entry.slug, matches[0].entry.name
    elif matches:
        slots.dish_candidates = [match.entry.slug for match in matches]
    else:
        leftover = residual(plain)
        # Bỏ nguyên liệu/bữa đã hiểu; còn ≥ 2 từ thì nhiều khả năng là tên một món lạ.
        for word in (*slots.ingredients, *slots.excluded):
            leftover = re.sub(rf"(?:^| ){re.escape(word)}(?= |$)", " ", leftover)
        if len(leftover.split()) >= 2:
            slots.dish_unknown = " ".join(leftover.split())
    if slots.dish is None and not slots.dish_candidates and catalog:
        # "Món đó nấu bao lâu?": lấy món gần nhất đã nhắc trong hội thoại.
        for _role, content in reversed(list(history)[-6:]):
            previous = match_dishes(normalize(content)[1], catalog, limit=1)
            if previous and previous[0].exact:
                slots.dish, slots.dish_name = previous[0].entry.slug, previous[0].entry.name
                slots.dish_from_history = True
                break
    return slots
