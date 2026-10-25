"""Nguồn dữ liệu món thật cho Bếp Việt AI + so khớp tên món mờ.

Lúc chạy dùng CSDL qua `SessionRecipeSource` (tái dùng kho món đã cache của trợ lý);
khi đánh giá ngoại tuyến thì nạp bản chụp `recipe-catalog.json` vào SQLite trong bộ nhớ
để đi đúng một đường mã với lúc chạy thật. Chỉ ĐỌC dữ liệu món, không bao giờ ghi.
"""

from __future__ import annotations

import json
import threading
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any, Protocol

from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, selectinload, sessionmaker
from sqlalchemy.pool import StaticPool

from app.modules.assistant import engine
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep
from app.modules.recipes.search import normalize_search

SNAPSHOT = (
    Path(__file__).resolve().parents[4] / "frontend" / "public" / "data" / "recipe-catalog.json"
)


@dataclass(frozen=True, slots=True)
class IngredientLine:
    name: str
    amount: float | None
    unit: str
    group: str
    scalable: bool
    note: str = ""


@dataclass(frozen=True, slots=True)
class DishDetail:
    slug: str
    name: str
    region: str
    category: str
    difficulty: str
    prep_minutes: int
    cook_minutes: int
    passive_minutes: int
    servings: int
    ingredients: tuple[IngredientLine, ...]
    steps: tuple[tuple[str, str], ...]
    tip: str = ""
    # Dinh dưỡng chỉ có khi dữ liệu món ghi rõ; không bao giờ tự ước lượng.
    nutrition: dict[str, Any] = field(default_factory=dict)

    @property
    def total_minutes(self) -> int:
        return self.prep_minutes + self.cook_minutes


class RecipeSource(Protocol):
    def entries(self) -> list[engine.RecipeEntry]: ...

    def detail(self, slug: str) -> DishDetail | None: ...


def _amount(value: Decimal | float | str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(Decimal(str(value)))
    except (InvalidOperation, ValueError):
        return None


def detail_from_recipe(recipe: Recipe) -> DishDetail:
    content = recipe.content or {}
    nutrition = content.get("nutrition") or content.get("nutrition_per_serving") or {}
    passive = content.get("passive_time")
    return DishDetail(
        slug=recipe.slug,
        name=recipe.name,
        region=recipe.region,
        category=recipe.category,
        difficulty=recipe.difficulty,
        prep_minutes=recipe.prep_minutes,
        cook_minutes=recipe.cook_minutes,
        passive_minutes=int(passive) if isinstance(passive, int | float) else 0,
        servings=recipe.base_servings,
        ingredients=tuple(
            IngredientLine(
                name=item.name,
                amount=_amount(item.amount),
                unit=item.unit or "",
                group=item.group_name or "",
                scalable=bool(item.scalable),
                note=item.note or "",
            )
            for item in recipe.ingredients
        ),
        steps=tuple((step.step_type, step.content) for step in recipe.steps),
        tip=recipe.tip or "",
        nutrition=nutrition if isinstance(nutrition, dict) else {},
    )


class SessionRecipeSource:
    """Đọc món đã xuất bản từ CSDL của ứng dụng (dùng trong luồng chat thật)."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def entries(self) -> list[engine.RecipeEntry]:
        return engine.load_catalog(self.session)

    def detail(self, slug: str) -> DishDetail | None:
        # Truy vấn riêng (không phụ thuộc recipes.service đang được tái cấu trúc).
        recipe = self.session.scalar(
            select(Recipe)
            .where(Recipe.slug == slug, Recipe.status == "published")
            .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
        )
        return detail_from_recipe(recipe) if recipe is not None else None


def _flat_ingredients(item: dict[str, Any]) -> list[dict[str, Any]]:
    """Chịu cả dạng nhóm {group_name, items: [...]} mà vài món trong bản chụp đang dùng."""
    rows: list[dict[str, Any]] = []
    for row in item.get("ingredients") or []:
        if isinstance(row, dict) and isinstance(row.get("items"), list):
            group = row.get("group_name") or ""
            rows.extend({"group_name": group, **child} for child in row["items"])
        elif isinstance(row, dict) and row.get("name"):
            rows.append(row)
    return rows


def snapshot_factory(path: Path = SNAPSHOT) -> sessionmaker[Session]:
    """SQLite trong bộ nhớ chứa bản chụp kho món (định dạng RecipeDetailResponse)."""
    raw = json.loads(path.read_text(encoding="utf-8"))
    items = raw.get("data", raw) if isinstance(raw, dict) else raw
    bind = create_engine(
        "sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    tables = [Recipe.__table__, RecipeIngredient.__table__, RecipeStep.__table__]
    Recipe.metadata.create_all(bind, tables=tables)  # type: ignore[arg-type]
    factory = sessionmaker(bind=bind, autoflush=False, expire_on_commit=False)
    with factory() as session:
        for item in items:
            content = dict(item.get("content") or {})
            if isinstance(content.get("tags"), list):
                # Vài món bổ sung ghi tags dạng danh sách; bộ máy trợ lý cần dict.
                content["tags"] = {"keywords": content["tags"]}
            recipe = Recipe(
                slug=item["slug"],
                name=item["name"],
                excerpt=item.get("excerpt") or "",
                region=item.get("region") or "",
                category=item.get("category") or "",
                difficulty=item.get("difficulty") or "",
                prep_minutes=int(item.get("prep_minutes") or 0),
                cook_minutes=int(item.get("cook_minutes") or 0),
                base_servings=int(item.get("base_servings") or 1),
                image_path=item.get("image_path") or "",
                image_alt=item.get("image_alt") or "",
                serving=item.get("serving") or "",
                tip=item.get("tip") or "",
                source_name=item.get("source_name") or "",
                source_url=item.get("source_url") or "",
                catalog_id=item.get("catalog_id"),
                content=content,
                search_text=normalize_search(item["name"]),
                status="published",
            )
            recipe.ingredients = [
                RecipeIngredient(
                    group_name=row.get("group_name") or "",
                    name=row["name"],
                    amount=Decimal(str(row["amount"])) if row.get("amount") is not None else None,
                    unit=row.get("unit") or "",
                    note=row.get("note"),
                    scalable=bool(row.get("scalable", True)),
                    position=int(row.get("position") or index),
                )
                for index, row in enumerate(_flat_ingredients(item), start=1)
            ]
            recipe.steps = [
                RecipeStep(
                    step_type=row.get("step_type") or "nau",
                    content=row["content"],
                    position=int(row.get("position") or index),
                )
                for index, row in enumerate(item.get("steps") or [], start=1)
            ]
            session.add(recipe)
        session.commit()
    return factory


# ---------------------------------------------------------------------------
# So khớp tên món.
# ---------------------------------------------------------------------------
# Từ đệm khi hỏi về món; phần còn lại sau khi bỏ chúng (và từ chỉ thông tin khác) là "tên món".
_FILLER_TEXT = """
    cach nau lam mon cong thuc huong dan nguyen lieu gom nhung gi can co nao bao lau nhieu
    phut gio tieng mat het thoi gian calo kcal calories dinh duong nang luong cho nguoi suat
    phan minh toi ban oi voi the nhu ra sao khong duoc nhe di a ah nha vay day hom nay
    sang trua chieu bua an muon thich xin hay giup vui long biet lam sao
    this that how to cook make recipe for of the ingredients long time many much calorie
    does i need what is an in it take serve people servings please
    nay kia ay thu la cua mot hai bon sau bay tam chin muoi
"""
FILLER = frozenset(_FILLER_TEXT.split())
STOP_SHORT = frozenset({"ca", "bo", "ga", "heo", "tom", "canh", "bun", "pho", "mi", "com", "che"})


@dataclass(frozen=True, slots=True)
class DishMatch:
    entry: engine.RecipeEntry
    score: float
    exact: bool


@dataclass(slots=True)
class _Index:
    # Giữ tham chiếu danh sách món: so sánh `is` an toàn hơn id() (id có thể bị tái dùng).
    entries: list[engine.RecipeEntry]
    by_token: dict[str, list[engine.RecipeEntry]]


_index_lock = threading.Lock()
_index: _Index | None = None


def _get_index(entries: list[engine.RecipeEntry]) -> _Index:
    global _index
    current = _index
    if current is not None and current.entries is entries:
        return current
    with _index_lock:
        by_token: dict[str, list[engine.RecipeEntry]] = {}
        for entry in entries:
            for token in set(entry.name_norm.split()):
                by_token.setdefault(token, []).append(entry)
        _index = _Index(entries=entries, by_token=by_token)
        return _index


def _whole(phrase: str, text: str) -> bool:
    # So khớp theo cả từ bằng chuỗi thuần (regex động cho 470 món làm tràn cache của `re`).
    return bool(phrase) and f" {phrase} " in f" {text} "


def _extend(name: str, plain: str, entries: list[engine.RecipeEntry]) -> list[engine.RecipeEntry]:
    """Người dùng gõ dài hơn tên vừa khớp ("canh chua cá lóc" ≠ "Canh chua cá"): tên dài hơn."""
    words = plain.split()
    size = len(name.split())
    for start in range(0, len(words) - size + 1):
        if " ".join(words[start : start + size]) != name:
            continue
        found: list[engine.RecipeEntry] = []
        for end in range(start + size + 1, len(words) + 1):
            phrase = " ".join(words[start:end])
            longer = [entry for entry in entries if f"{entry.name_norm} ".startswith(phrase + " ")]
            if not longer:
                break
            found = longer
        if found:
            exact = [entry for entry in found if entry.name_norm in plain]
            return exact or found
    return []


def residual(plain: str) -> str:
    """Phần câu còn lại sau khi bỏ từ đệm/con số: dấu hiệu người dùng nêu tên một món."""
    return " ".join(word for word in plain.split() if word not in FILLER and not word.isdigit())


def match_dishes(plain: str, entries: list[engine.RecipeEntry], limit: int = 4) -> list[DishMatch]:
    """Món khớp câu (đã bỏ dấu): khớp nguyên tên > tên bắt đầu bằng cụm gõ > khớp mờ."""
    if not plain or not entries:
        return []
    exact = [entry for entry in entries if _whole(entry.name_norm, plain)]
    if exact:
        exact.sort(key=lambda entry: len(entry.name_norm), reverse=True)
        best = exact[0]
        longer = _extend(best.name_norm, plain, entries)
        if longer:
            longer.sort(key=lambda entry: (len(entry.name_norm), entry.name_norm))
            return [DishMatch(entry, 0.95, False) for entry in longer[:limit]]
        # Bỏ các tên ngắn nằm trong tên dài hơn ("phở bò" trong "phở bò tái lăn").
        kept = [best] + [
            entry
            for entry in exact[1:]
            if entry.name_norm not in best.name_norm
            and _whole(entry.name_norm, plain.replace(best.name_norm, " "))
        ]
        return [DishMatch(entry, 1.0, True) for entry in kept[:limit]]
    core = residual(plain)
    words = core.split()
    if not words:
        return []
    index = _get_index(entries)
    pool: dict[str, engine.RecipeEntry] = {}
    for word in set(words):
        for entry in index.by_token.get(word, ()):
            pool[entry.slug] = entry
    if len(words) >= 2:
        prefix = [
            entry
            for entry in pool.values()
            if entry.name_norm.startswith(core + " ") or entry.name_norm == core
        ]
        if prefix:
            prefix.sort(key=lambda entry: (len(entry.name_norm), entry.name_norm))
            return [DishMatch(entry, 0.9, False) for entry in prefix[:limit]]
    scored: list[DishMatch] = []
    message = plain.split()
    for entry in pool.values():
        name = entry.name_norm.split()
        shared = len(set(name) & set(words))
        if shared < max(1, (len(name) + 1) // 2) or (len(name) == 1 and name[0] in STOP_SHORT):
            continue
        ratio = 0.0
        for size in {max(1, len(name) - 1), len(name), len(name) + 1}:
            for start in range(0, max(1, len(message) - size + 1)):
                window = " ".join(message[start : start + size])
                ratio = max(ratio, SequenceMatcher(None, window, entry.name_norm).ratio())
        if ratio >= 0.86:
            scored.append(DishMatch(entry, round(ratio, 3), False))
    scored.sort(key=lambda match: (-match.score, len(match.entry.name_norm)))
    return scored[:limit]
