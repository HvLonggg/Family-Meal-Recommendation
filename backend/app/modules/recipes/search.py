import json
import re
import unicodedata
from dataclasses import dataclass, field
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
            "dong bang song hong",
            "dong bang bac bo",
            "trung du va mien nui bac bo",
            "trung du mien nui phia bac",
            "dong bac bo",
            "dong bac",
            "tay bac bo",
            "tay bac",
            "red river delta",
            "northern vietnam",
            "northern",
            "hanoi",
            "hai phong",
            "quang ninh",
            "cao bang",
            "lang son",
            "bac giang",
            "thai nguyen",
            "phu tho",
            "yen bai",
            "lao cai",
            "dien bien",
            "son la",
            "hoa binh",
            "tuyen quang",
            "nam dinh",
            "ninh binh",
            "thai binh",
            "hai duong",
            "hung yen",
            "bac ninh",
            "ha nam",
        },
        "trung": {
            "bac trung bo",
            "nam trung bo",
            "duyen hai nam trung bo",
            "duyen hai mien trung",
            "trung bo",
            "central vietnam",
            "central coast",
            "central",
            "tay nguyen",
            "thanh hoa",
            "nghe an",
            "ha tinh",
            "quang binh",
            "quang tri",
            "hue",
            "thua thien hue",
            "da nang",
            "quang nam",
            "quang ngai",
            "binh dinh",
            "phu yen",
            "khanh hoa",
            "ninh thuan",
            "binh thuan",
            "gia lai",
            "kon tum",
            "dak lak",
            "dak nong",
            "lam dong",
        },
        "nam": {
            "dong nam bo",
            "dong bang song cuu long",
            "nam bo",
            "tay nam bo",
            "mien tay",
            "mekong delta",
            "southern vietnam",
            "southern",
            "south",
            "ho chi minh",
            "sai gon",
            "binh phuoc",
            "tay ninh",
            "binh duong",
            "dong nai",
            "ba ria",
            "vung tau",
            "long an",
            "tien giang",
            "ben tre",
            "tra vinh",
            "vinh long",
            "dong thap",
            "an giang",
            "kien giang",
            "can tho",
            "hau giang",
            "soc trang",
            "bac lieu",
            "ca mau",
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
        value == cue
        or f" {cue} " in f" {value} "
        or value.startswith(f"{cue} ")
        or value.endswith(f" {cue}")
        for value in regions
        for cue in cues
    )


FUZZY_MIN_LENGTH = 5


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
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict):
        return {}

    index: dict[str, dict[str, list[str]]] = {}
    for slug, entry in payload.items():
        if not isinstance(slug, str) or not isinstance(entry, dict):
            continue
        index[slug] = {
            field: [value for value in entry.get(field, []) if isinstance(value, str)]
            for field in ("names", "ingredients", "fields")
            if isinstance(entry.get(field, []), list)
        }
    return index


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
        if is_last and len(term) >= 4 and any(word.startswith(term) for word in words):
            return True
        if (term == "sao" and "xao" in words) or (term == "xao" and "sao" in words):
            return True
        # Short Vietnamese keywords (“cá”, “gà”, “kho”, “canh”) stay exact.
        return len(term) >= FUZZY_MIN_LENGTH and any(_one_edit_apart(term, word) for word in words)

    return all(matches_term(term, index == len(terms) - 1) for index, term in enumerate(terms))


# --- Strict dish search (mirrors frontend/src/data/recipeSearch.ts) ---------------------------
#
# Every query word must match a WHOLE word of one dish name (main, English or alias). A query
# typed with diacritics compares diacritics exactly ("cà" != "cá", "cua" != "của"); an unaccented
# query matches every tone. Ingredients count for exactly one ingredient-like word (cá, gà, bò...)
# when every other word already matches the name, or when the whole query is one contiguous
# phrase of an ingredient/tag/region ("lá trà xanh"). A single word also searches ingredients.
# Fallback tiers are only used when no dish matches a stricter tier:
#   1: prefix of the last word (>=3 letters, >=2 after another word) unless it is already a word;
#   2: ignore diacritics and allow one typo in words of >=5 letters; 3: tier 2 plus prefix.

_TONE_MARKS = re.compile("[̣̀́̃̉]")
_WORD_SPLIT = re.compile(r"[\W_]+")
_META_WORDS = frozenset(
    [
        "a",
        "an",
        "and",
        "dish",
        "dishes",
        "food",
        "foods",
        "meal",
        "meals",
        "mon",
        "recipe",
        "recipes",
        "thuc",
        "pham",
    ]
)
_INGREDIENT_WORDS = [
    "cá",
    "gà",
    "bò",
    "heo",
    "lợn",
    "vịt",
    "ngan",
    "tôm",
    "tép",
    "cua",
    "ghẹ",
    "mực",
    "ốc",
    "sò",
    "nghêu",
    "ngao",
    "hến",
    "hàu",
    "trứng",
    "sườn",
    "đậu",
    "nấm",
    "ếch",
    "lươn",
    "chim",
    "cút",
    "dê",
    "chicken",
    "beef",
    "pork",
    "fish",
    "shrimp",
    "prawn",
    "prawns",
    "crab",
    "squid",
    "egg",
    "eggs",
    "tofu",
    "duck",
    "mushroom",
    "mushrooms",
    "clams",
    "snails",
    "goat",
]
# Unaccented "ca", "dau", "so" are too ambiguous (cà chua, dầu ăn, số) to count as ingredients.
_AMBIGUOUS_UNACCENTED = frozenset({"ca", "dau", "so"})
_TIERS = (0, 1, 2, 3)
_WHOLE_WORD_TIERS = (0, 2)


def accent_key(word: str) -> str:
    """Diacritic-aware key independent of tone placement ("hoà" == "hòa")."""
    decomposed = unicodedata.normalize("NFD", word)
    tones = _TONE_MARKS.findall(decomposed)
    base = unicodedata.normalize("NFC", _TONE_MARKS.sub("", decomposed))
    return base + (tones[0] if tones else "")


_INGREDIENT_KEYS = frozenset(accent_key(word) for word in _INGREDIENT_WORDS)
_INGREDIENT_NORMS = (
    frozenset(normalize_search(word) for word in _INGREDIENT_WORDS) - _AMBIGUOUS_UNACCENTED
)


@dataclass(frozen=True)
class SearchToken:
    norm: str
    key: str


@dataclass(frozen=True)
class QueryTerm:
    norm: str
    key: str
    exact: bool
    ingredient_like: bool


Tokens = tuple[SearchToken, ...]
Terms = tuple[QueryTerm, ...]


@lru_cache(maxsize=50_000)
def search_tokens(value: str) -> Tokens:
    tokens: list[SearchToken] = []
    for accented in _WORD_SPLIT.split(unicodedata.normalize("NFC", value).lower()):
        parts = normalize_search(accented).split()
        for part in parts:
            tokens.append(SearchToken(part, accent_key(accented) if len(parts) == 1 else part))
    return tuple(tokens)


def parse_query(query: str) -> Terms:
    tokens = search_tokens(query)
    picked = [token for token in tokens if token.norm not in _META_WORDS] or list(tokens)
    exact = any(token.key != token.norm for token in picked)
    return tuple(
        QueryTerm(
            token.norm,
            token.key,
            exact,
            token.key in _INGREDIENT_KEYS if exact else token.norm in _INGREDIENT_NORMS,
        )
        for token in picked
    )


@dataclass
class RecipeSearchFields:
    names: list[str]
    aliases: list[str] = field(default_factory=list)
    ingredients: list[str] = field(default_factory=list)
    tags: list[str] = field(default_factory=list)
    regions: list[str] = field(default_factory=list)
    name_fields: list[Tokens] = field(init=False)
    alias_fields: list[Tokens] = field(init=False)
    ingredient_field: Tokens = field(init=False)
    broad_field: Tokens = field(init=False)
    phrase_fields: list[Tokens] = field(init=False)
    vocabulary: Tokens = field(init=False)
    vocabulary_norms: set[str] = field(init=False)
    vocabulary_keys: set[str] = field(init=False)

    def __post_init__(self) -> None:
        self.name_fields = [search_tokens(value) for value in self.names if value]
        self.alias_fields = [search_tokens(value) for value in self.aliases if value]
        self.ingredient_field = search_tokens(" · ".join(self.ingredients))
        self.broad_field = search_tokens(" · ".join([*self.tags, *self.ingredients]))
        self.phrase_fields = [
            search_tokens(value)
            for value in [*self.tags, *self.ingredients, *self.regions]
            if value
        ]
        every = [
            *(token for name in [*self.name_fields, *self.alias_fields] for token in name),
            *self.broad_field,
            *(token for phrase in self.phrase_fields for token in phrase),
        ]
        self.vocabulary = tuple({token.key: token for token in every}.values())
        self.vocabulary_norms = {token.norm for token in every}
        self.vocabulary_keys = {token.key for token in every}


def _synonym(term: str, word: str) -> bool:
    return {term, word} == {"sao", "xao"}


def _term_matches(term: QueryTerm, token: SearchToken, tier: int, last: bool, count: int) -> bool:
    prefix_ok = tier in (1, 3) and last and len(term.norm) >= (2 if count > 1 else 3)
    if tier < 2:
        if (token.key == term.key) if term.exact else (token.norm == term.norm):
            return True
        if not term.exact and _synonym(term.norm, token.norm):
            return True
        if not prefix_ok:
            return False
        return token.key.startswith(term.key) if term.exact else token.norm.startswith(term.norm)
    if token.norm == term.norm or _synonym(term.norm, token.norm):
        return True
    if prefix_ok and token.norm.startswith(term.norm):
        return True
    return len(term.norm) >= FUZZY_MIN_LENGTH and _one_edit_apart(term.norm, token.norm)


def _in_field(term: QueryTerm, tokens: Tokens, tier: int, last: bool, count: int) -> bool:
    return any(_term_matches(term, token, tier, last, count) for token in tokens)


def _has_terms(tokens: Tokens, terms: Terms, tier: int, skip: int = -1) -> bool:
    last = len(terms) - 1
    return all(
        index == skip or _in_field(term, tokens, tier, index == last, len(terms))
        for index, term in enumerate(terms)
    )


def _phrase_at(tokens: Tokens, terms: Terms, tier: int, start: int) -> bool:
    last = len(terms) - 1
    return start + len(terms) <= len(tokens) and all(
        _term_matches(term, tokens[start + offset], tier, offset == last, len(terms))
        for offset, term in enumerate(terms)
    )


def _has_phrase(tokens: Tokens, terms: Terms, tier: int) -> bool:
    return any(_phrase_at(tokens, terms, tier, start) for start in range(len(tokens)))


def _has_word(fields: RecipeSearchFields, term: QueryTerm) -> bool:
    if term.exact:
        return term.key in fields.vocabulary_keys
    if term.norm in fields.vocabulary_norms:
        return True
    return term.norm in ("sao", "xao") and bool({"sao", "xao"} & fields.vocabulary_norms)


def text_match(fields: RecipeSearchFields, terms: Terms, tier: int) -> str | None:
    """Kind of match ("name", "alias", "mixed", "phrase", "ingredient") at `tier`, or None."""
    last = len(terms) - 1
    if tier == 0 and not all(_has_word(fields, term) for term in terms):
        return None
    if tier > 0 and not all(
        _in_field(term, fields.vocabulary, tier, index == last, len(terms))
        for index, term in enumerate(terms)
    ):
        return None
    if any(_has_terms(name, terms, tier) for name in fields.name_fields):
        return "name"
    if any(_has_terms(alias, terms, tier) for alias in fields.alias_fields):
        return "alias"
    if len(terms) == 1:
        return "ingredient" if _in_field(terms[0], fields.broad_field, tier, True, 1) else None
    # Ingredient and phrase matches never use the half-typed prefix ("gà ran" -> "Cơm rang").
    if tier in (1, 3):
        return None
    names = [*fields.name_fields, *fields.alias_fields]
    for skip, term in enumerate(terms):
        if not term.ingredient_like:
            continue
        if not _in_field(term, fields.ingredient_field, tier, skip == last, len(terms)):
            continue
        if any(_has_terms(name, terms, tier, skip) for name in names):
            return "mixed"
    return "phrase" if any(_has_phrase(p, terms, tier) for p in fields.phrase_fields) else None


def _name_score(tokens: Tokens, terms: Terms, tier: int) -> int:
    if not _has_terms(tokens, terms, tier):
        return 0
    if _phrase_at(tokens, terms, tier, 0):
        score = 1000 if len(tokens) == len(terms) else 850
    elif _has_phrase(tokens, terms, tier):
        score = 720
    else:
        position = 0
        in_order = True
        for index, term in enumerate(terms):
            last = index == len(terms) - 1
            found = next(
                (
                    offset
                    for offset in range(position, len(tokens))
                    if _term_matches(term, tokens[offset], tier, last, len(terms))
                ),
                -1,
            )
            if found < 0:
                in_order = False
                break
            position = found + 1
        score = 680 if in_order else 640
    return score - min(9, max(0, len(tokens) - len(terms)))


def _relevance(fields: RecipeSearchFields, terms: Terms, tier: int) -> int:
    best = max((_name_score(name, terms, tier) for name in fields.name_fields), default=0)
    if not best:
        best = max((_name_score(a, terms, tier) // 2 for a in fields.alias_fields), default=0)
    if not best:
        kind = text_match(fields, terms, tier) or ""
        best = {"mixed": 310, "phrase": 290, "ingredient": 280}.get(kind, 0)
    if tier == 0:
        return best
    return 150 + best // 20 if tier == 1 else 100 + best // 25 - tier


def strict_search(query: str, candidates: list[RecipeSearchFields]) -> list[tuple[int, int]]:
    """(candidate index, relevance) of every match; fallback tiers only when nothing matches."""
    terms = parse_query(query)
    if not terms:
        return [(index, 0) for index in range(len(candidates))]
    # Vietnamese name words: a complete last word ("kho") never widens to a prefix ("khoai").
    vocabulary = {
        token.key
        for item in candidates
        for name in [*item.names[:1], *item.aliases]
        for token in search_tokens(name)
    }
    allowed = _WHOLE_WORD_TIERS if terms[-1].key in vocabulary else _TIERS
    for tier in allowed:
        matches = [
            (index, _relevance(item, terms, tier))
            for index, item in enumerate(candidates)
            if text_match(item, terms, tier)
        ]
        if matches:
            return matches
    return []
