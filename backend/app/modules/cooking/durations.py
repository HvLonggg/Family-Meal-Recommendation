"""Đọc thời lượng trong câu nói ("hẹn giờ một tiếng rưỡi") và trong bước nấu ("ninh 8-10 phút").

Dùng để kiểm tra lại thời lượng AI phụ bếp trả về: thời lượng người dùng nói luôn được ưu tiên,
AI không được tự bịa số khi người dùng không nói và bước nấu cũng không ghi. Giờ tuyệt đối
("báo mình lúc 7 giờ tối") được quy ra số giây còn lại theo giờ trên máy người dùng.
"""

from __future__ import annotations

import re
import unicodedata
from typing import Literal

UNITS = {
    "giay": 1,
    "s": 1,
    "sec": 1,
    "second": 1,
    "seconds": 1,
    "phut": 60,
    "p": 60,
    "min": 60,
    "mins": 60,
    "minute": 60,
    "minutes": 60,
    "tieng": 3600,
    "gio": 3600,
    "h": 3600,
    "hour": 3600,
    "hours": 3600,
}
_HOUR_UNITS = ("tieng", "gio", "h", "hour", "hours")
# Số đọc bằng chữ. Có dấu thì phân biệt được "sáu" (6) với "sau" (sau khi), "mười" (10) với
# "mươi" (hàng chục); gõ không dấu thì đoán theo ngữ cảnh.
ACCENTED = {
    "một": 1,
    "mốt": 1,
    "hai": 2,
    "ba": 3,
    "bốn": 4,
    "tư": 4,
    "năm": 5,
    "lăm": 5,
    "sáu": 6,
    "bảy": 7,
    "bẩy": 7,
    "tám": 8,
    "chín": 9,
}
DIGITS = {
    "mot": 1,
    "mod": 1,
    "hai": 2,
    "ba": 3,
    "bon": 4,
    "tu": 4,
    "nam": 5,
    "lam": 5,
    "sau": 6,
    "bay": 7,
    "tam": 8,
    "chin": 9,
}
ENGLISH = {
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
    "eleven": 11,
    "twelve": 12,
    "fifteen": 15,
    "twenty": 20,
    "thirty": 30,
    "forty": 40,
    "fifty": 50,
    "an": 1,
    "a": 1,
}
_UNIT = "|".join(sorted(UNITS, key=len, reverse=True))
_AMOUNT = re.compile(rf"\b(\d+)(?: (\d+))? ({_UNIT})\b( ruoi)?")
# "1 tiếng 15" (không nói "phút"): số sau giờ là phút.
_HOUR_MINUTES = re.compile(
    rf"\b(\d+) ({'|'.join(_HOUR_UNITS)}) (\d{{1,2}})\b(?! (?:\d+|{_UNIT})\b)"
)
_HALF_HOUR = re.compile(r"\bnua (tieng|gio)\b|\bhalf (an )?hour\b")
_PERIODS = ("sang", "trua", "chieu", "toi", "dem", "khuya", "am", "pm")
_CLOCK = re.compile(
    r"\b(?:(luc|vao luc|at|by|vao|den)\s)?(\d{1,2})"
    r"(?: (gio|h|g|oclock)(?: (?:(\d{1,2})(?: (?:phut|p))?|(ruoi)|kem (\d{1,2})(?: phut)?))?)?"
    r"(?: (?:buoi )?(" + "|".join(_PERIODS) + r"))?\b"
)
_STRONG_CLOCK = ("luc", "vao luc", "at")
AdjustMode = Literal["add", "subtract", "set"]


def _fold(text: str) -> str:
    value = unicodedata.normalize("NFD", text.replace("đ", "d").replace("Đ", "D"))
    return "".join(char for char in value if unicodedata.category(char) != "Mn")


def _tokens(text: str) -> list[str]:
    value = unicodedata.normalize("NFC", text.lower())
    value = re.sub(r"(\d)[,.](\d)", r"\1.\2", value)
    value = re.sub(r"(\d{1,2}):(\d{2})", r"\1 h \2", value)  # 19:30
    value = re.sub(r"(\d)([^\W\d_])", r"\1 \2", value)  # 10p, 19h30
    value = re.sub(r"([^\W\d_])(\d)", r"\1 \2", value)
    return re.findall(r"[^\W_]+", value)


def _prepare(text: str) -> str:
    """Chữ thường, bỏ dấu, đổi số đọc bằng chữ thành chữ số ("mười lăm phút" → "15 phut")."""
    raw = _tokens(text)
    plain = [_fold(token) for token in raw]
    ascii_only = all(token == folded for token, folded in zip(raw, plain, strict=True))

    def digit(index: int) -> int | None:
        if index >= len(raw):
            return None
        if ascii_only:
            return DIGITS.get(plain[index])
        return ACCENTED.get(raw[index])

    def word(index: int) -> str:
        return plain[index] if 0 <= index < len(plain) else ""

    def is_ten(index: int) -> bool:  # "mười"
        return raw[index] == "mười" if not ascii_only else plain[index] == "muoi"

    def is_tens(index: int) -> bool:  # "mươi", "chục"
        if index >= len(raw):
            return False
        return (
            raw[index] in ("mươi", "chục") if not ascii_only else plain[index] in ("muoi", "chuc")
        )

    out: list[str] = []
    index = 0
    while index < len(raw):
        token = plain[index]
        value = digit(index)
        if ascii_only and token == "sau" and word(index + 1) == "muoi":
            value = None  # "sau muoi phut": "sau mười phút" hay gặp hơn "sáu mươi phút"
        if ascii_only and token == "bay" and word(index + 1) == "gio" and word(index - 1) != "luc":
            value = None  # "bay gio" thường là "bây giờ"
        if token in ("a", "an") and word(index - 1) == "half":
            out.append(token)  # "half an hour" xử lý riêng
            index += 1
            continue
        if is_ten(index):
            unit = digit(index + 1)
            out.append(str(10 + unit) if unit else "10")
            index += 2 if unit else 1
            continue
        if value and is_tens(index + 1):
            unit = digit(index + 2)
            out.append(str(value * 10 + (unit or 0)))
            index += 3 if unit else 2
            continue
        if value and word(index + 1) in UNITS:
            out.append(str(value))
        elif token in ENGLISH and word(index + 1) in UNITS:
            out.append(str(ENGLISH[token]))
        elif token in ENGLISH and ENGLISH[token] >= 20 and word(index + 1) in ENGLISH:
            out.append(str(ENGLISH[token] + ENGLISH[word(index + 1)]))
            index += 2
            continue
        else:
            out.append(token)
        index += 1
    return " ".join(out)


def _amounts(text: str) -> list[tuple[int, int | None]]:
    """Các thời lượng (giây) tìm thấy; mỗi mục là (mốc đầu, mốc cuối nếu là khoảng)."""
    found: list[tuple[int, int | None]] = []
    for first, second, unit, half in _AMOUNT.findall(text):
        size = UNITS[unit]
        start = int(first) * size + (size // 2 if half else 0)
        end = int(second) * size if second else None
        found.append((start, end))
    return found


def _clock_match(text: str) -> re.Match[str] | None:
    """Mốc giờ tuyệt đối trong câu đã chuẩn hóa; cần "lúc/at" hoặc buổi ("tối", "pm")."""
    for match in _CLOCK.finditer(text):
        prefix, hour, unit, _minute, _half, _before, period = match.groups()
        if int(hour) > 23:
            continue
        # "lúc 10 phút nữa": số đi với phút/giây là thời lượng, không phải giờ.
        if not unit and re.match(rf" ({_UNIT})\b", text[match.end() :]):
            continue
        if prefix in _STRONG_CLOCK or (period and (unit or prefix)) or (prefix and unit):
            return match
    return None


def _clock_hours(hour: int, period: str | None) -> list[int]:
    if period in ("sang", "am"):
        return [0 if hour == 12 else hour]
    if period in ("chieu", "toi", "pm"):
        return [hour + 12 if hour < 12 else hour]
    if period == "trua":
        return [hour if hour >= 11 else hour + 12]
    if period in ("dem", "khuya"):
        return [hour + 12 if 7 <= hour < 12 else 0 if hour == 12 else hour]
    if hour > 12:
        return [hour]
    return [hour, hour + 12] if hour < 12 else [12, 0]


def clock_seconds(utterance: str, local_seconds: int | None) -> int | None:
    """Số giây từ giờ trên máy người dùng tới mốc giờ được nói; đã qua thì tính sang ngày mai."""
    if local_seconds is None:
        return None
    match = _clock_match(_prepare(utterance))
    if not match:
        return None
    _prefix, hour_text, _unit, minute_text, half, before, period = match.groups()
    hour, minute = int(hour_text), int(minute_text or 0)
    if half:
        minute = 30
    if before:
        hour, minute = hour - 1, 60 - int(before)
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return None
    options = []
    for candidate in _clock_hours(hour, period):
        if candidate > 23:
            continue
        wait = (candidate * 3600 + minute * 60 - local_seconds) % 86_400
        options.append(wait if wait >= 5 else wait + 86_400)
    return min(options) if options else None


def _durations_text(utterance: str) -> str:
    text = _prepare(utterance)
    match = _clock_match(text)
    if match:  # "lúc 7 giờ tối" là mốc giờ, không phải "7 giờ" thời lượng
        text = text[: match.start()] + " " + text[match.end() :]
    return _HOUR_MINUTES.sub(r"\1 \2 \3 phut", text)


def spoken_amounts(utterance: str) -> list[int]:
    """Từng thời lượng người dùng nói, gộp "1 tiếng 30 phút" thành một."""
    text = _durations_text(utterance)
    half_hour = bool(_HALF_HOUR.search(text))
    text = _HALF_HOUR.sub(" ", text)
    merged: list[int] = []
    previous_end = -10
    for match in _AMOUNT.finditer(text):
        first, _second, unit, half = match.groups()
        size = UNITS[unit]
        seconds = int(first) * size + (size // 2 if half else 0)
        if merged and match.start() - previous_end <= 1 and merged[-1] > seconds:
            merged[-1] += seconds
        else:
            merged.append(seconds)
        previous_end = match.end()
    if half_hour:
        merged = [1800 + sum(merged)] if merged else [1800]
    return [value for value in merged if value > 0]


def spoken_seconds(utterance: str) -> int | None:
    """Thời lượng người dùng nói ra; gộp "1 tiếng 30 phút"; None nếu không nói."""
    return sum(spoken_amounts(utterance)) or None


def adjust_mode(utterance: str) -> AdjustMode | None:
    """Ý chỉnh chuông đang chạy: thêm, bớt hay đổi hẳn thời gian còn lại."""
    text = " " + _prepare(utterance) + " "
    if re.search(r" (bot|giam|tru|rut ngan|less|fewer|subtract|take off|minus) ", text):
        return "subtract"
    if re.search(
        r" (doi|chinh|sua|dat lai|change|make|reset)( \w+)?( lai)? (thanh|con|to|it to|ve) ", text
    ):
        return "set"
    if re.search(r" (them|cong|gia han|add|more|extra|another|plus) ", text):
        return "add"
    return None


def step_seconds(step_text: str) -> set[int]:
    """Các thời lượng hợp lệ ghi trong bước ("8-10 phút" → {480, 600})."""
    allowed: set[int] = set()
    for start, end in _amounts(_prepare(step_text)):
        allowed.add(start)
        if end:
            allowed.add(end)
    return allowed
