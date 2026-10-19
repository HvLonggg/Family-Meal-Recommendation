"""Bộ máy trò chuyện nội bộ của Chú Rồng: hiểu câu hỏi về món ăn bằng luật + kho món.

Chạy hoàn toàn trong máy chủ, không gọi dịch vụ ngoài. Khi có Claude API, kết quả lọc món
ở đây còn được dùng làm ngữ cảnh để câu trả lời của AI luôn bám đúng kho món Bếp Việt.
"""

from __future__ import annotations

import random
import re
import threading
from dataclasses import dataclass, field, replace
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.assistant.phrases import SUGGESTIONS, TEXT, TOPIC_TEXT, Language

__all__ = ["Language", "RecipeEntry", "normalize_search"]
from app.modules.recipes.models import Recipe
from app.modules.recipes.search import normalize_search

VIETNAM = ZoneInfo("Asia/Ho_Chi_Minh")


@dataclass(frozen=True, slots=True)
class RecipeEntry:
    slug: str
    name: str
    excerpt: str
    region: str
    category: str
    difficulty: str
    minutes: int
    servings: int
    image_path: str
    name_norm: str
    text_norm: str
    ingredient_text: str
    ingredients: tuple[str, ...]
    meal_types: tuple[str, ...]
    methods: tuple[str, ...]
    spicy: int


@dataclass(slots=True)
class Intent:
    kind: str = "fallback"
    meal: str | None = None
    regions: set[str] = field(default_factory=set)
    categories: set[str] = field(default_factory=set)
    max_minutes: int | None = None
    easy: bool = False
    include: list[str] = field(default_factory=list)
    exclude: list[str] = field(default_factory=list)
    methods: set[str] = field(default_factory=set)
    servings: int | None = None
    not_spicy: bool = False
    full_meal: bool = False
    recipe: RecipeEntry | None = None
    candidates: list[RecipeEntry] = field(default_factory=list)
    topic: str | None = None


@dataclass(slots=True)
class EngineReply:
    content: str
    recipes: list[RecipeEntry] = field(default_factory=list)
    suggestions: list[str] = field(default_factory=list)
    actions: list[dict[str, str]] = field(default_factory=list)
    intent: Intent = field(default_factory=Intent)


# ---------------------------------------------------------------------------
# Kho món trong bộ nhớ, tự làm mới khi số món hoặc thời điểm cập nhật thay đổi.
# ---------------------------------------------------------------------------
_cache_lock = threading.Lock()
_cache: tuple[tuple[int, Any], list[RecipeEntry]] | None = None


def reset_catalog_cache() -> None:
    global _cache
    with _cache_lock:
        _cache = None


def _norm(value: str) -> str:
    return normalize_search(value)


# Tránh nhầm từ khóa sau khi bỏ dấu, như "trứng gà" với "gà".
# không phải cá… Gộp thành một từ trước khi so khớp nguyên liệu.
COMPOUNDS = {
    "trung ga": "trungga",
    "trung vit": "trungvit",
    "trung cut": "trungcut",
    "trung vit lon": "trungvitlon",
    "nuoc dung ga": "nuocdungga",
    "hat nem ga": "hatnemga",
    "bot nem ga": "botnemga",
    "mo ga": "moga",
    "bo cau": "bocau",
    # "nấm đùi gà" là nấm; giữ chữ "nam" để vẫn khớp khi người dùng tìm nấm.
    "nam dui ga": "nam namduiga",
    "bo thuc vat": "bobeo",
    "bo lat": "bobeo",
    "ca chua": "cachua",
    "ca rot": "carot",
    "ca tim": "catim",
    "ca phao": "caphao",
    "ca bung": "cabung",
    "ca ri": "cari",
    "ca phe": "caphe",
    "ca cao": "cacao",
    "ca phao muoi": "caphao",
    "nam bo": "nambo",
    "mien nam": "miennam",
    "mi chinh": "michinh",
    "bot mi": "botmi",
    "rau muong": "raumuong",
    "khoai tay": "khoaitay",
    "dau phu": "dauphu",
    "dau hu": "dauphu",
    "tau hu": "dauphu",
}
_COMPOUND_PATTERN = re.compile(
    r"(?:^| )(" + "|".join(sorted(map(re.escape, COMPOUNDS), key=len, reverse=True)) + r")(?= |$)"
)


def _fuse(text: str) -> str:
    return _COMPOUND_PATTERN.sub(lambda match: " " + COMPOUNDS[match.group(1)], text).strip()


def _tag_list(tags: dict[str, Any], key: str) -> tuple[str, ...]:
    value = tags.get(key)
    if isinstance(value, list):
        return tuple(_norm(str(item)) for item in value if str(item).strip())
    return ()


def load_catalog(session: Session) -> list[RecipeEntry]:
    global _cache
    signature = session.execute(
        select(func.count(Recipe.id), func.max(Recipe.updated_at)).where(
            Recipe.status == "published"
        )
    ).one()
    key = (int(signature[0] or 0), signature[1])
    with _cache_lock:
        if _cache is not None and _cache[0] == key:
            return _cache[1]
    recipes = session.scalars(
        select(Recipe)
        .where(Recipe.status == "published")
        .options(selectinload(Recipe.ingredients))
        .order_by(Recipe.catalog_id, Recipe.slug)
    ).all()
    entries: list[RecipeEntry] = []
    for recipe in recipes:
        tags = (recipe.content or {}).get("tags") or {}
        ingredients = tuple(_norm(item.name) for item in recipe.ingredients)
        # Nguyên liệu tên đúng một chữ "Bơ" là bơ (butter/quả bơ), không phải thịt bò.
        fused_ingredients = tuple("bobeo" if item == "bo" else _fuse(item) for item in ingredients)
        main = _tag_list(tags, "main_ingredient")
        spicy = tags.get("spicy_level")
        entries.append(
            RecipeEntry(
                slug=recipe.slug,
                name=recipe.name,
                excerpt=recipe.excerpt,
                region=recipe.region,
                category=recipe.category,
                difficulty=recipe.difficulty,
                minutes=recipe.prep_minutes + recipe.cook_minutes,
                servings=recipe.base_servings,
                image_path=recipe.image_path,
                name_norm=_norm(recipe.name),
                text_norm=recipe.search_text or _norm(f"{recipe.name} {recipe.excerpt}"),
                ingredient_text=" | ".join(
                    (*fused_ingredients, *(_fuse(item) for item in main), _fuse(_norm(recipe.name)))
                ),
                ingredients=ingredients,
                meal_types=_tag_list(tags, "meal_type"),
                methods=_tag_list(tags, "cooking_method"),
                spicy=int(spicy) if isinstance(spicy, int | float) else 0,
            )
        )
    with _cache_lock:
        _cache = (key, entries)
    return entries


# ---------------------------------------------------------------------------
# Hiểu câu hỏi.
# ---------------------------------------------------------------------------
def _has(text: str, *phrases: str) -> bool:
    return any(re.search(rf"(?:^| ){re.escape(phrase)}(?: |$)", text) for phrase in phrases)


REGION_WORDS = {
    "Bắc": ("mien bac", "bac bo", "ha noi", "nguoi bac", "kieu bac", "north", "northern"),
    "Trung": ("mien trung", "hue", "da nang", "quang nam", "kieu trung", "central"),
    "Nam": ("mien nam", "nam bo", "sai gon", "kieu nam", "mien tay", "south", "southern"),
}
CATEGORY_WORDS = {
    "Món canh": ("canh", "mon canh", "soup"),
    "Món chay": ("chay", "an chay", "mon chay", "vegetarian", "vegan"),
    "Món rau": ("mon rau", "rau xanh", "an rau", "vegetable", "veggie"),
    "Món nước": ("mon nuoc", "pho", "bun", "hu tieu", "noodle", "noodles"),
    "Món tráng miệng": ("trang mieng", "che", "do ngot", "dessert", "sweet"),
    "Món ăn kèm": ("an kem", "mon phu", "side dish"),
    "Món ăn sáng": ("mon an sang", "do an sang"),
    "Món mặn": ("mon man", "an com", "dua com", "main dish"),
}
METHOD_WORDS = {
    "xao": ("xao", "stir fry", "stir fried"),
    "kho": ("kho", "braised", "braise"),
    "luoc": ("luoc", "boiled"),
    "hap": ("hap", "steamed"),
    "nuong": ("nuong", "grilled", "roast"),
    "chien": ("chien", "ran", "fried"),
    "nau": ("ham", "stew"),
}
# Ánh xạ cách gọi nguyên liệu sang từ khóa tìm kiếm.
INGREDIENT_WORDS: dict[str, tuple[str, ...]] = {
    "ga": ("ga",),
    "chicken": ("ga",),
    "thit heo": ("thit heo", "heo", "lon", "ba chi", "nac", "suon", "gio"),
    "thit lon": ("thit heo", "heo", "lon", "ba chi", "nac", "suon"),
    "pork": ("thit heo", "heo", "ba chi", "nac", "suon"),
    "heo": ("heo", "ba chi", "nac", "suon"),
    "lon": ("heo", "lon", "ba chi", "nac", "suon"),
    "suon": ("suon",),
    "bo": ("bo",),
    "thit bo": ("bo",),
    "beef": ("bo",),
    "ca": ("ca",),
    "fish": ("ca",),
    "tom": ("tom",),
    "shrimp": ("tom",),
    "muc": ("muc",),
    "squid": ("muc",),
    "cua": ("cua",),
    "crab": ("cua",),
    "trung": ("trung", "trungga", "trungvit", "trungcut"),
    "trung ga": ("trung", "trungga"),
    "trung vit": ("trungvit",),
    "trung cut": ("trungcut",),
    "egg": ("trung", "trungga", "trungvit", "trungcut"),
    "eggs": ("trung", "trungga", "trungvit", "trungcut"),
    "dau phu": ("dauphu",),
    "dau hu": ("dauphu",),
    "tau hu": ("dauphu",),
    "tofu": ("dauphu",),
    "nam": ("nam",),
    "mushroom": ("nam",),
    "vit": ("vit",),
    "duck": ("vit",),
    "ech": ("ech",),
    "oc": ("oc",),
    "ngheu": ("ngheu", "ngao"),
    "bo cau": ("bocau",),
    "ngao": ("ngheu", "ngao"),
    "hen": ("hen",),
    "ca chua": ("cachua",),
    "tomato": ("cachua",),
    "ca rot": ("carot",),
    "ca tim": ("catim",),
    "khoai tay": ("khoaitay",),
    "khoai": ("khoai",),
    "bi": ("bi",),
    "bi do": ("bi do",),
    "rau muong": ("raumuong",),
    "cai": ("cai",),
    "gao": ("gao",),
    "bun": ("bun",),
    "mi": ("mi",),
}
INGREDIENT_LABELS = {
    "ga": "gà",
    "thit heo": "thịt heo",
    "thit lon": "thịt lợn",
    "heo": "thịt heo",
    "lon": "thịt lợn",
    "suon": "sườn",
    "bo": "bò",
    "thit bo": "thịt bò",
    "ca": "cá",
    "tom": "tôm",
    "muc": "mực",
    "cua": "cua",
    "trung": "trứng",
    "trung ga": "trứng gà",
    "trung vit": "trứng vịt",
    "trung cut": "trứng cút",
    "dau phu": "đậu phụ",
    "dau hu": "đậu hũ",
    "tau hu": "tàu hũ",
    "nam": "nấm",
    "vit": "vịt",
    "ech": "ếch",
    "oc": "ốc",
    "ngheu": "nghêu",
    "ngao": "ngao",
    "hen": "hến",
    "bo cau": "bồ câu",
    "ca chua": "cà chua",
    "ca rot": "cà rốt",
    "ca tim": "cà tím",
    "khoai tay": "khoai tây",
    "khoai": "khoai",
    "bi": "bí",
    "bi do": "bí đỏ",
    "rau muong": "rau muống",
    "cai": "cải",
    "gao": "gạo",
    "bun": "bún",
    "mi": "mì",
}


def ingredient_label(word: str, language: Language = "vi") -> str:
    if language == "en":
        return word
    return INGREDIENT_LABELS.get(word, word)


NEGATION = r"(?:khong an|khong co|khong dung|kieng|tranh|bo qua|ngoai tru|without|except|avoid)"
GREETING = ("xin chao", "chao", "chao ban", "hello", "hi", "alo", "hey", "chao rong con")
THANKS = ("cam on", "thank", "thanks", "tks", "cam on nhe", "cam on ban")
HELP = ("ban lam duoc gi", "giup gi", "huong dan", "ban la ai", "what can you do", "help")
SUGGEST = (
    "an gi",
    "nau gi",
    "goi y",
    "de xuat",
    "thuc don",
    "mon nao",
    "mon gi",
    "chua biet",
    "ngau nhien",
    "random",
    "suggest",
    "recommend",
    "what should i",
    "what to eat",
    "what to cook",
    "idea",
    "ideas",
    "mon ngon",
)
RECIPE_ASK = (
    "cach nau",
    "cach lam",
    "lam mon",
    "cong thuc",
    "nau mon",
    "how to cook",
    "recipe for",
)
TOPICS = {
    "planner": ("ke hoach", "len lich", "lich nau", "meal plan", "planner"),
    "lunar": ("lich am", "am lich", "lunar"),
    "shopping": ("di cho", "mua sam", "danh sach mua", "shopping", "grocery"),
    "favorite": ("yeu thich", "luu mon", "favorite", "favourite"),
    "account": ("dang nhap", "dang ky", "tai khoan", "mat khau", "login", "sign up", "password"),
    "contact": ("lien he", "ho tro", "support", "contact", "gop y"),
    "submit": ("de xuat mon", "gui mon", "dong gop mon", "submit recipe"),
}


RECIPE_FILLER = (
    "cach nau",
    "cach lam",
    "lam mon",
    "nau mon",
    "cong thuc",
    "huong dan",
    "nguyen lieu",
    "how to cook",
    "recipe for",
    "mon",
    "nau",
    "lam",
    "cua",
    "the nao",
    "nhu the nao",
    "ra sao",
    "voi",
    "giup minh",
    "giup toi",
    "di",
    "nhe",
    "a",
    "the",
    "recipe",
    "how",
    "to",
    "cook",
    "make",
)


def _match_recipe(text: str, catalog: list[RecipeEntry]) -> list[RecipeEntry]:
    """Món có tên nằm trọn trong câu, hoặc tên món bắt đầu bằng cụm người dùng gõ."""
    exact = [
        entry
        for entry in catalog
        if entry.name_norm and re.search(rf"(?:^| ){re.escape(entry.name_norm)}(?: |$)", text)
    ]
    if exact:
        return sorted(exact, key=lambda entry: len(entry.name_norm), reverse=True)[:1]
    core = text
    for filler in sorted(RECIPE_FILLER, key=len, reverse=True):
        core = re.sub(rf"(?:^| ){re.escape(filler)}(?= |$)", " ", core)
    core = " ".join(core.split())
    if len(core.split()) < 2:
        return []
    prefix = [
        entry
        for entry in catalog
        if entry.name_norm.startswith(core + " ") or entry.name_norm == core
    ]
    return sorted(prefix, key=lambda entry: len(entry.name_norm))[:3]


def parse_intent(message: str, catalog: list[RecipeEntry]) -> Intent:
    text = _norm(message)
    intent = Intent()
    if not text:
        return intent

    meal_words = {
        "sang": ("bua sang", "an sang", "buoi sang", "sang nay", "breakfast"),
        "trua": ("bua trua", "an trua", "trua nay", "buoi trua", "lunch"),
        "toi": ("bua toi", "an toi", "toi nay", "buoi toi", "dinner", "tonight", "supper"),
        "an nhe": ("an nhe", "an vat", "snack", "light"),
    }
    for meal, words in meal_words.items():
        if _has(text, *words):
            intent.meal = meal
            break
    for region, words in REGION_WORDS.items():
        if _has(text, *words):
            intent.regions.add(region)
    for category, words in CATEGORY_WORDS.items():
        if _has(text, *words):
            intent.categories.add(category)
    if intent.meal == "sang":
        intent.categories.discard("Món mặn")
    for method, words in METHOD_WORDS.items():
        if _has(text, *words):
            intent.methods.add(method)

    minutes = re.search(
        r"(?:duoi|it hon|khong qua|toi da|under|less than|within)?\s*"
        r"(\d{1,3})\s*(?:phut|p|min|mins|minutes)\b",
        text,
    )
    if minutes:
        intent.max_minutes = max(5, min(240, int(minutes.group(1))))
    elif _has(
        text, "nhanh", "nhanh gon", "gap", "it thoi gian", "quick", "fast", "ban ron", "busy"
    ):
        intent.max_minutes = 30
    if _has(text, "de lam", "de nau", "mon de", "don gian", "easy", "simple", "nguoi moi"):
        intent.easy = True
    people = re.search(r"(\d{1,2})\s*(?:nguoi|suat|phan|people|persons|servings)\b", text)
    if people:
        intent.servings = max(1, min(30, int(people.group(1))))
    if _has(text, "khong cay", "it cay", "not spicy", "mild", "tre em", "em be", "kids"):
        intent.not_spicy = True
    if _has(
        text, "mam com", "ca mam", "bua com gia dinh", "com gia dinh", "family meal", "full meal"
    ):
        intent.full_meal = True

    excluded_spans: list[tuple[int, int]] = []
    for match in re.finditer(rf"{NEGATION} ((?:\w+ ?){{1,3}})", text):
        segment = match.group(1)
        fused_segment = _fuse(segment)
        for word in sorted(INGREDIENT_WORDS, key=len, reverse=True):
            target = _fuse(word)
            if re.search(rf"(?:^| ){re.escape(target)}(?: |$)", fused_segment):
                intent.exclude.append(word)
                excluded_spans.append(match.span())
                break
    remaining = text
    for start, end in reversed(excluded_spans):
        remaining = remaining[:start] + " " + remaining[end:]
    for words in (*REGION_WORDS.values(), *meal_words.values()):
        for phrase in words:
            remaining = re.sub(rf"(?:^| ){re.escape(phrase)}(?= |$)", " ", remaining)
    remaining = _fuse(remaining)
    for word in sorted(INGREDIENT_WORDS, key=len, reverse=True):
        target = _fuse(word)
        if re.search(rf"(?:^| ){re.escape(target)}(?: |$)", remaining):
            # Cụm dài khớp trước rồi bị bỏ khỏi chuỗi, nên "cà chua" không bị hiểu thành "cá".
            intent.include.append(word)
            remaining = re.sub(rf"(?:^| ){re.escape(target)}(?= |$)", " ", remaining)
    # "bún", "mì" là món nước chứ không phải nguyên liệu khi người dùng hỏi kiểu "ăn bún".
    if "Món nước" in intent.categories:
        intent.include = [word for word in intent.include if word not in ("bun", "mi")]

    for topic, words in TOPICS.items():
        if _has(text, *words):
            intent.topic = topic
            break

    matches = _match_recipe(text, catalog)
    recipe = matches[0] if len(matches) == 1 else None
    if len(matches) > 1:
        intent.candidates = matches
    asks_recipe = _has(text, *RECIPE_ASK) or _has(text, "nguyen lieu", "ingredients", "bao lau")
    filters = bool(
        intent.meal
        or intent.regions
        or intent.categories
        or intent.max_minutes
        or intent.include
        or intent.methods
        or intent.full_meal
    )
    if recipe and (asks_recipe or len(text.split()) <= len(recipe.name_norm.split()) + 3):
        intent.kind = "recipe"
        intent.recipe = recipe
    elif intent.candidates and not _has(text, *SUGGEST):
        intent.kind = "pick"
    elif _has(text, *SUGGEST) or intent.full_meal or (filters and not intent.topic):
        intent.kind = "suggest"
    elif intent.topic:
        intent.kind = "topic"
    elif _has(text, *THANKS):
        intent.kind = "thanks"
    elif _has(text, *HELP):
        intent.kind = "help"
    elif _has(text, *GREETING) and len(text.split()) <= 5:
        intent.kind = "greeting"
    elif filters:
        intent.kind = "suggest"
    return intent


# ---------------------------------------------------------------------------
# Chọn món.
# ---------------------------------------------------------------------------
def _contains(entry: RecipeEntry, word: str) -> bool:
    keywords = INGREDIENT_WORDS.get(word, (word,))
    return any(
        re.search(rf"(?:^| |\|){re.escape(keyword)}(?: |$|\|)", entry.ingredient_text)
        for keyword in keywords
    )


def _filtered(intent: Intent, catalog: list[RecipeEntry], *, strict: bool) -> list[RecipeEntry]:
    pool: list[RecipeEntry] = []
    for entry in catalog:
        if any(_contains(entry, word) for word in intent.exclude):
            continue
        if intent.not_spicy and entry.spicy >= 2:
            continue
        if "Món chay" in intent.categories and entry.category != "Món chay":
            continue
        if strict:
            if intent.regions and entry.region not in intent.regions and entry.region != "Ba miền":
                continue
            other = intent.categories - {"Món chay"}
            if other and entry.category not in other:
                continue
            if intent.max_minutes and entry.minutes > intent.max_minutes:
                continue
            if intent.easy and entry.difficulty not in ("Dễ", "Vừa"):
                continue
            if intent.methods and not any(
                method in entry.methods or method in entry.name_norm.split()
                for method in intent.methods
            ):
                continue
            if intent.include and not all(_contains(entry, word) for word in intent.include):
                continue
        pool.append(entry)
    return pool


def _meal_ok(entry: RecipeEntry, meal: str | None) -> bool:
    if meal is None:
        return True
    if meal == "sang":
        return entry.category == "Món ăn sáng" or "sang" in entry.meal_types
    if meal == "an nhe":
        return "an nhe" in entry.meal_types or entry.category == "Món tráng miệng"
    return meal in entry.meal_types or not entry.meal_types


def pick_recipes(
    intent: Intent,
    catalog: list[RecipeEntry],
    *,
    avoid: set[str] | None = None,
    limit: int = 3,
    rng: random.Random | None = None,
) -> tuple[list[RecipeEntry], bool]:
    """Trả về (danh sách món, có khớp đầy đủ điều kiện hay đã nới lỏng)."""
    rng = rng or random.Random()
    avoid = avoid or set()
    strict = _filtered(intent, catalog, strict=True)
    exact = True
    pool = [entry for entry in strict if _meal_ok(entry, intent.meal)] or strict
    if intent.meal in ("trua", "toi") and not intent.categories:
        mains = [entry for entry in pool if entry.category not in ("Món ăn kèm", "Món tráng miệng")]
        pool = mains or pool
    if not pool and intent.include:
        # Nới lỏng: chỉ cần chứa một trong các nguyên liệu người dùng có.
        loose = _filtered(replace(intent, include=[]), catalog, strict=True)
        pool = [entry for entry in loose if any(_contains(entry, w) for w in intent.include)]
        exact = False
    if not pool:
        pool = [
            entry
            for entry in _filtered(intent, catalog, strict=False)
            if _meal_ok(entry, intent.meal)
        ]
        exact = False
    fresh = [entry for entry in pool if entry.slug not in avoid] or pool
    rng.shuffle(fresh)
    # Ưu tiên món ít thời gian hơn khi người dùng muốn nhanh, món dễ khi muốn đơn giản.
    if intent.max_minutes or intent.easy:
        fresh.sort(key=lambda entry: (entry.minutes, entry.difficulty != "Dễ"))
        fresh = fresh[: max(limit * 3, limit)]
        rng.shuffle(fresh)
    return fresh[:limit], exact


def compose_meal(
    intent: Intent, catalog: list[RecipeEntry], *, avoid: set[str], rng: random.Random
) -> list[RecipeEntry]:
    picks: list[RecipeEntry] = []
    vegetarian = "Món chay" in intent.categories
    plan = (
        [("Món chay",), ("Món chay",), ("Món chay",)]
        if vegetarian
        else [("Món mặn",), ("Món canh",), ("Món rau", "Món ăn kèm")]
    )
    for categories in plan:
        if vegetarian:
            wanted = {"Món chay"} if categories == ("Món chay",) else set(categories)
        else:
            wanted = set(categories)
        sub = replace(intent, categories=wanted, full_meal=False)
        chosen, _ = pick_recipes(
            sub, catalog, avoid=avoid | {entry.slug for entry in picks}, limit=1, rng=rng
        )
        if chosen and chosen[0].slug not in {entry.slug for entry in picks}:
            picks.append(chosen[0])
    return picks


# ---------------------------------------------------------------------------
# Lời thoại.
# ---------------------------------------------------------------------------
MEAL_LABEL: dict[str, dict[Language, str]] = {
    "sang": {"vi": "bữa sáng", "en": "breakfast"},
    "trua": {"vi": "bữa trưa", "en": "lunch"},
    "toi": {"vi": "bữa tối", "en": "dinner"},
    "an nhe": {"vi": "bữa phụ", "en": "a light bite"},
}


def current_meal(now: datetime | None = None) -> str:
    hour = (now or datetime.now(VIETNAM)).astimezone(VIETNAM).hour
    if hour < 10:
        return "sang"
    if hour < 15:
        return "trua"
    return "toi"


def _context(intent: Intent, language: Language) -> str:
    bits: list[str] = []
    if intent.meal:
        bits.append(("cho " if language == "vi" else "for ") + MEAL_LABEL[intent.meal][language])
    if intent.max_minutes:
        bits.append(
            f"dưới {intent.max_minutes} phút"
            if language == "vi"
            else f"under {intent.max_minutes} min"
        )
    if intent.include:
        joined = ", ".join(ingredient_label(word, language) for word in intent.include)
        bits.append(f"có {joined}" if language == "vi" else f"with {joined}")
    if intent.exclude:
        joined = ", ".join(ingredient_label(word, language) for word in intent.exclude)
        bits.append(f"không {joined}" if language == "vi" else f"without {joined}")
    if intent.servings:
        bits.append(
            f"cho {intent.servings} người" if language == "vi" else f"for {intent.servings}"
        )
    return f" ({' · '.join(bits)})" if bits else ""


def _names(entries: list[RecipeEntry], language: Language) -> str:
    """Tên món in đậm nối thành một câu; thẻ món bên dưới đã có ảnh, thời gian, vùng miền."""
    names = [f"**{entry.name}**" for entry in entries]
    joiner = " và " if language == "vi" else " and "
    if len(names) <= 1:
        return "".join(names)
    return ", ".join(names[:-1]) + joiner + names[-1]


def _follow_ups(intent: Intent, language: Language, rng: random.Random) -> list[str]:
    if language == "en":
        base = [
            "Show me other dishes",
            "Something quicker",
            "Make it vegetarian",
            "Build a full meal",
        ]
    else:
        base = ["Đổi món khác", "Món nhanh hơn", "Chuyển sang món chay", "Gợi ý cả mâm cơm"]
    extra = [item for item in SUGGESTIONS[language] if item not in base]
    rng.shuffle(extra)
    return base[:3] + extra[:1]


def reply(
    message: str,
    catalog: list[RecipeEntry],
    *,
    language: Language = "vi",
    avoid: set[str] | None = None,
    attachment_text: str = "",
    has_images: bool = False,
    now: datetime | None = None,
    rng: random.Random | None = None,
) -> EngineReply:
    rng = rng or random.Random()
    combined = f"{message}\n{attachment_text}".strip()
    intent = parse_intent(combined, catalog)

    def pick_text(key: str) -> str:
        return rng.choice(TEXT[key][language])

    if has_images and not message.strip() and not attachment_text.strip():
        content = pick_text("image_only")
        return EngineReply(content=content, suggestions=SUGGESTIONS[language][:4], intent=intent)

    if intent.kind == "recipe" and intent.recipe:
        entry = intent.recipe
        ingredients = ", ".join(sorted(set(entry.ingredients))[:8])
        if language == "vi":
            content = (
                f"**{entry.name}** — {entry.excerpt}\n\n"
                f"- Thời gian: khoảng {entry.minutes} phút · độ khó {entry.difficulty.lower()}\n"
                f"- Khẩu phần gốc: {entry.servings} người\n"
                f"- Nguyên liệu chính: {ingredients}\n\n"
                "Mở công thức để xem từng bước, chỉnh khẩu phần và nghe đọc hướng dẫn nhé!"
            )
            suggestions = [f"Món ăn kèm với {entry.name}", "Món khác tương tự", "Gợi ý cả mâm cơm"]
        else:
            content = (
                f"**{entry.name}** — {entry.excerpt}\n\n"
                f"- Time: about {entry.minutes} min\n- Serves {entry.servings}\n\n"
                "Open the recipe for step-by-step instructions and read-aloud mode."
            )
            suggestions = ["Similar dishes", "Build a full meal"]
        return EngineReply(content=content, recipes=[entry], suggestions=suggestions, intent=intent)

    if intent.kind == "pick" and intent.candidates:
        lead = (
            "Có vài món trùng tên bạn nhắc, bạn muốn xem món nào?"
            if language == "vi"
            else "A few dishes match that name — which one?"
        )
        return EngineReply(
            content=f"{lead} {_names(intent.candidates, language)}.",
            recipes=intent.candidates,
            suggestions=[
                (f"Cách nấu {e.name}" if language == "vi" else f"How to cook {e.name}")
                for e in intent.candidates
            ],
            intent=intent,
        )

    if intent.kind == "suggest":
        if (
            intent.meal is None
            and not intent.categories
            and _has(_norm(combined), "hom nay", "today")
        ):
            intent.meal = current_meal(now)
        if intent.full_meal:
            picks = compose_meal(intent, catalog, avoid=avoid or set(), rng=rng)
            lead = pick_text("meal_intro").format(context=_context(intent, language))
            exact = True
        else:
            if intent.meal is None and not (intent.categories or intent.include or intent.regions):
                intent.meal = current_meal(now)
            picks, exact = pick_recipes(intent, catalog, avoid=avoid, limit=3, rng=rng)
            lead = pick_text("suggest_intro" if exact else "suggest_loose").format(
                context=_context(intent, language)
            )
        if not picks:
            return EngineReply(
                content=pick_text("none"), suggestions=SUGGESTIONS[language][:4], intent=intent
            )
        names = _names(picks, language)
        tail = (
            " Bấm vào món để xem công thức, hoặc bảo mình đổi món khác nhé!"
            if language == "vi"
            else " Tap a dish for the recipe, or ask me for other ideas!"
        )
        if intent.servings and language == "vi":
            servings = intent.servings
            tail = f" Chọn {servings} khẩu phần ở trang món để tự chỉnh định lượng." + tail
        return EngineReply(
            content=f"{lead} {names}.{tail}",
            recipes=picks,
            suggestions=_follow_ups(intent, language, rng),
            intent=intent,
        )

    if intent.kind == "topic" and intent.topic:
        content, actions = TOPIC_TEXT[intent.topic][language]
        return EngineReply(
            content=content,
            actions=actions,
            suggestions=SUGGESTIONS[language][:3],
            intent=intent,
        )

    if intent.kind in ("greeting", "thanks", "help"):
        return EngineReply(
            content=pick_text(intent.kind),
            suggestions=rng.sample(SUGGESTIONS[language], k=min(4, len(SUGGESTIONS[language]))),
            intent=intent,
        )

    # Không rõ ý: thử tìm thẳng trong kho món theo từ khóa.
    words = [word for word in _norm(combined).split() if len(word) > 1]
    if words:
        scored = sorted(
            (
                (sum(1 for word in words if word in entry.text_norm.split()), entry)
                for entry in catalog
            ),
            key=lambda item: item[0],
            reverse=True,
        )
        hits = [entry for score, entry in scored if score >= max(1, len(words) // 2)][:3]
        if hits:
            lead = (
                "Mình tìm thấy mấy món có thể bạn đang nhắc tới:"
                if language == "vi"
                else "These dishes might be what you mean:"
            )
            return EngineReply(
                content=f"{lead} {_names(hits, language)}.",
                recipes=hits,
                suggestions=SUGGESTIONS[language][:3],
                intent=intent,
            )
    return EngineReply(
        content=pick_text("fallback"),
        suggestions=SUGGESTIONS[language][:4],
        intent=intent,
    )


def candidate_recipes(
    message: str, catalog: list[RecipeEntry], *, avoid: set[str], limit: int = 10
) -> list[RecipeEntry]:
    """Danh sách món liên quan để đưa vào ngữ cảnh cho AI."""
    intent = parse_intent(message, catalog)
    related = [intent.recipe] if intent.recipe else []
    picks, _ = pick_recipes(intent, catalog, avoid=avoid, limit=limit)
    seen = {entry.slug for entry in related}
    return related + [entry for entry in picks if entry.slug not in seen][: limit - len(related)]
