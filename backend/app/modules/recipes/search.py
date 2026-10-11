import re
import unicodedata


def normalize_search(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
    value = "".join(char for char in value if unicodedata.category(char) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", value))


def matches_search(query: str, text: str) -> bool:
    if not query.strip():
        return True
    terms = normalize_search(query).split()
    words = set(normalize_search(text).split())
    return bool(terms) and all(term in words for term in terms)
