import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


def normalize_search(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", value))


def matches_region(query: str, values: list[str]) -> bool:
    target = normalize_search(query)
    regions = [normalize_search(value) for value in values if value]
    if target in regions:
        return True

    groups = {
        "bac": {
            "dong bang song hong", "dong bang bac bo", "trung du va mien nui bac bo",
            "trung du mien nui phia bac", "dong bac bo", "dong bac", "tay bac bo",
            "tay bac", "red river delta", "northern vietnam", "northern",
            "hanoi", "hai phong", "quang ninh", "cao bang", "lang son", "bac giang",
            "thai nguyen", "phu tho", "yen bai", "lao cai", "dien bien", "son la",
            "hoa binh", "tuyen quang", "nam dinh", "ninh binh", "thai binh",
            "hai duong", "hung yen", "bac ninh", "ha nam",
        },
        "trung": {
            "bac trung bo", "nam trung bo", "duyen hai nam trung bo", "duyen hai mien trung",
            "trung bo", "central vietnam", "central coast", "central", "tay nguyen",
            "thanh hoa", "nghe an", "ha tinh", "quang binh", "quang tri", "hue",
            "thua thien hue", "da nang", "quang nam", "quang ngai", "binh dinh",
            "phu yen", "khanh hoa", "ninh thuan", "binh thuan", "gia lai", "kon tum",
            "dak lak", "dak nong", "lam dong",
        },
        "nam": {
            "dong nam bo", "dong bang song cuu long", "nam bo", "tay nam bo", "mien tay",
            "mekong delta", "southern vietnam", "southern", "south", "ho chi minh",
            "sai gon", "binh phuoc", "tay ninh", "binh duong", "dong nai", "ba ria",
            "vung tau", "long an", "tien giang", "ben tre", "tra vinh", "vinh long",
            "dong thap", "an giang", "kien giang", "can tho", "hau giang", "soc trang",
            "bac lieu", "ca mau",
        },
    }
    aliases = {
        "bac": {"bac", "north", "northern", "northern vietnam", "mien bac", "north vietnam"},
        "trung": {"trung", "central", "central vietnam", "mien trung"},
        "nam": {"nam", "south", "southern", "southern vietnam", "mien nam", "south vietnam"},
    }
    group = next((key for key, labels in aliases.items() if target in labels), None)
    if group is None:
        return False
    cues = groups[group]
    return any(
        value == cue or f" {cue} " in f" {value} " or value.startswith(f"{cue} ") or value.endswith(f" {cue}")
        for value in regions
        for cue in cues
    )


def _one_edit_apart(left: str, right: str) -> bool:
    if abs(len(left) - len(right)) > 1:
        return False

    left_index = right_index = edits = 0
    while left_index < len(left) and right_index < len(right):
        if left[left_index] == right[right_index]:
            left_index += 1
            right_index += 1
            continue
        edits += 1
        if edits > 1:
            return False
        if len(left) > len(right):
            left_index += 1
        elif len(right) > len(left):
            right_index += 1
        else:
            left_index += 1
            right_index += 1
    if left_index < len(left) or right_index < len(right):
        edits += 1
    return edits <= 1


@lru_cache(maxsize=1)
def english_search_index() -> dict[str, dict[str, list[str]]]:
    path = Path(__file__).resolve().parents[2] / "data" / "recipe-search-en.json"
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def bilingual_search_text(slug: str, fallback: str) -> str:
    entry = english_search_index().get(slug, {})
    english_terms = [
        *entry.get("names", []),
        *entry.get("ingredients", []),
        *entry.get("fields", []),
    ]
    return " ".join((fallback, *english_terms))


def matches_search(query: str, text: str) -> bool:
    if not query.strip():
        return True
    terms = normalize_search(query).split()
    words = set(normalize_search(text).split())
    if not terms:
        return False

    def matches_term(term: str, is_last: bool) -> bool:
        if term in words:
            return True
        if is_last and len(term) >= 3 and any(word.startswith(term) for word in words):
            return True
        # Very short Vietnamese keywords stay exact to avoid “cá” matching “canh”.
        return len(term) >= 4 and any(_one_edit_apart(term, word) for word in words)

    return all(matches_term(term, index == len(terms) - 1) for index, term in enumerate(terms))
