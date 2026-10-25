"""Dựng câu trả lời in-house từ câu đã duyệt (faq/smalltalk/safety) hoặc dữ liệu món thật (action).

Nguyên tắc: không bịa. Thiếu món → hỏi lại bằng tên món thật trong kho; món không có trong kho
hoặc dữ liệu không có (vd calo) → trả `None` kèm lý do để bộ định tuyến chuyển LLM.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from app.modules.assistant import engine
from app.modules.bepviet_ai.catalog import DishDetail, IngredientLine, RecipeSource
from app.modules.bepviet_ai.dataset import IntentSpec
from app.modules.bepviet_ai.slots import Slots
from app.modules.bepviet_ai.text import normalize

MAX_STEPS = 12
# (bộ xử lý, từ khóa trong id intent) — xét theo thứ tự, khớp đầu tiên thắng.
HANDLER_KEYWORDS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("nutrition", ("calo", "calorie", "nutrition", "kcal", "dinh_duong")),
    ("suggest", ("suggest", "recommend", "goi_y", "what_to_eat", "what_to_cook", "menu")),
    ("ingredients", ("ingredient", "nguyen_lieu", "serving", "scale", "portion", "khau_phan")),
    ("cook_time", ("time", "duration", "how_long", "thoi_gian", "bao_lau")),
    ("steps", ("step", "how_to", "instruction", "cach_nau", "cach_lam", "guide")),
    ("overview", ("recipe", "dish", "info", "difficulty", "detail", "mon")),
)
# Tên bộ xử lý do kỹ sư dữ liệu đặt trong intents → bộ xử lý ở đây.
HANDLER_ALIASES = {
    "scale_servings": "ingredients",
    "recommend": "suggest",
    "how_to_cook": "steps",
    "time": "cook_time",
}
NEEDS_DISH = frozenset({"nutrition", "ingredients", "cook_time", "steps", "overview"})


@dataclass(slots=True)
class Answer:
    content: str
    followups: list[str] = field(default_factory=list)
    # Slug món thật được nhắc tới (để giao diện hiện thẻ món).
    recipes: list[str] = field(default_factory=list)
    actions: list[dict[str, str]] = field(default_factory=list)
    handler: str = ""


@dataclass(frozen=True, slots=True)
class Handoff:
    reason: str


def handler_for(spec: IntentSpec) -> str | None:
    if spec.handler:
        return HANDLER_ALIASES.get(spec.handler, spec.handler)
    name = spec.id.lower()
    for handler, keywords in HANDLER_KEYWORDS:
        if any(keyword in name for keyword in keywords):
            return handler
    return None


def route_group(spec: IntentSpec) -> str:
    """Nhóm định tuyến: action cùng bộ xử lý là một nhóm (vd ingredients + scale_servings,
    sáu intent recommend_*), vì nhầm giữa chúng không đổi câu trả lời; còn lại nhóm = intent."""
    if spec.kind == "action":
        handler = handler_for(spec)
        if handler:
            return f"action:{handler}"
    return spec.id


def groups_for(specs: dict[str, IntentSpec]) -> dict[str, str]:
    return {name: route_group(spec) for name, spec in specs.items()}


def _t(language: str, vi: str, en: str) -> str:
    return en if language == "en" else vi


def _qty(value: float) -> str:
    rounded = round(value) if value >= 10 else round(value, 1)
    return f"{rounded:g}"


def _line(item: IngredientLine, factor: float, language: str) -> str:
    if item.amount is None:
        return f"- {item.name}" + (f" ({item.unit})" if item.unit else "")
    amount = item.amount * factor if item.scalable else item.amount
    text = f"- {item.name}: {_qty(amount)} {item.unit}".rstrip()
    if factor != 1 and not item.scalable:
        text += _t(language, " (nêm theo khẩu vị)", " (adjust to taste)")
    return text


def _recipe_action(detail: DishDetail, language: str) -> dict[str, str]:
    return {
        "label": _t(language, f"Xem công thức {detail.name}", f"Open {detail.name}"),
        "to": f"/recipes/{detail.slug}",
    }


def _dish_followups(detail: DishDetail, handler: str, language: str) -> list[str]:
    options = {
        "ingredients": _t(language, "Nguyên liệu cần gì?", "What ingredients?"),
        "cook_time": _t(language, "Nấu mất bao lâu?", "How long does it take?"),
        "steps": _t(language, f"Cách nấu {detail.name}", f"How to cook {detail.name}"),
    }
    return [text for name, text in options.items() if name != handler][:2]


def ingredients(detail: DishDetail, slots: Slots, language: str) -> Answer:
    servings = slots.servings or detail.servings
    factor = servings / detail.servings if detail.servings else 1.0
    lines: list[str] = []
    group = None
    for item in detail.ingredients:
        if item.group and item.group != group and len({i.group for i in detail.ingredients}) > 1:
            group = item.group
            lines.append(f"**{group}**")
        lines.append(_line(item, factor, language))
    head = _t(
        language,
        f"**Nguyên liệu {detail.name}** cho {servings} người",
        f"**{detail.name} ingredients** for {servings} servings",
    )
    if factor != 1:
        head += _t(
            language,
            f" (công thức gốc {detail.servings} người, đã quy đổi):",
            f" (scaled from {detail.servings}):",
        )
    else:
        head += ":"
    return Answer(
        content="\n".join([head, *lines]),
        recipes=[detail.slug],
        actions=[_recipe_action(detail, language)],
        followups=_dish_followups(detail, "ingredients", language),
    )


def cook_time(detail: DishDetail, language: str) -> Answer:
    text = _t(
        language,
        f"**{detail.name}**: sơ chế khoảng {detail.prep_minutes} phút, nấu khoảng "
        f"{detail.cook_minutes} phút — tổng khoảng {detail.total_minutes} phút.",
        f"**{detail.name}**: about {detail.prep_minutes} min prep and {detail.cook_minutes} "
        f"min cooking — around {detail.total_minutes} min in total.",
    )
    if detail.passive_minutes:
        text += _t(
            language,
            f" Chưa kể khoảng {detail.passive_minutes} phút chờ (ướp, ngâm, ủ).",
            f" Plus about {detail.passive_minutes} min of waiting (marinating, soaking).",
        )
    return Answer(
        content=text,
        recipes=[detail.slug],
        actions=[_recipe_action(detail, language)],
        followups=_dish_followups(detail, "cook_time", language),
    )


def overview(detail: DishDetail, language: str) -> str:
    return _t(
        language,
        f"**{detail.name}** ({detail.category}, {detail.region}) — độ khó {detail.difficulty}, "
        f"khoảng {detail.total_minutes} phút, khẩu phần {detail.servings} người.",
        f"**{detail.name}** ({detail.category}, {detail.region}) — {detail.difficulty} level, "
        f"about {detail.total_minutes} min, serves {detail.servings}.",
    )


def steps(detail: DishDetail, language: str) -> Answer:
    lines = [overview(detail, language)]
    mains = [item.name for item in detail.ingredients][:6]
    if mains:
        lines.append(_t(language, "Nguyên liệu chính: ", "Main ingredients: ") + ", ".join(mains))
    lines.append(_t(language, "**Các bước:**", "**Steps:**"))
    for number, (_kind, content) in enumerate(detail.steps[:MAX_STEPS], start=1):
        lines.append(f"{number}. {content}")
    if len(detail.steps) > MAX_STEPS:
        lines.append(_t(language, "… xem đủ các bước ở trang công thức.", "… see all steps."))
    if detail.tip:
        lines.append(_t(language, "Mẹo: ", "Tip: ") + detail.tip.splitlines()[0])
    return Answer(
        content="\n".join(lines),
        recipes=[detail.slug],
        actions=[_recipe_action(detail, language)],
        followups=_dish_followups(detail, "steps", language),
    )


def nutrition(detail: DishDetail, language: str) -> Answer | Handoff:
    data = detail.nutrition
    calories = data.get("calories") or data.get("kcal") or data.get("energy_kcal")
    if not isinstance(calories, int | float) or calories <= 0:
        return Handoff("missing_data")
    return Answer(
        content=_t(
            language,
            f"**{detail.name}**: khoảng {calories:g} kcal mỗi phần (theo dữ liệu Bếp Việt).",
            f"**{detail.name}**: about {calories:g} kcal per serving (Bếp Việt data).",
        ),
        recipes=[detail.slug],
        actions=[_recipe_action(detail, language)],
    )


def suggest(
    message: str,
    slots: Slots,
    entries: list[engine.RecipeEntry],
    language: str,
    *,
    avoid: set[str],
    preferences: engine.Preferences | None,
    rng: random.Random | None,
) -> Answer | Handoff:
    if not entries:
        return Handoff("no_catalog")
    # Tái dùng bộ hiểu câu của trợ lý: vùng miền, chay, ít dầu, nhanh, dễ, không cay…
    intent = slots.parsed or engine.parse_intent(normalize(message)[1], [])
    intent.kind = "suggest"
    # Bữa theo giờ VN chỉ dùng khi người dùng không nêu tiêu chí nào khác.
    open_ended = not (intent.include or intent.regions or intent.categories or intent.traits)
    intent.meal = slots.meal or intent.meal or (slots.meal_inferred if open_ended else None)
    intent = engine.apply_preferences(intent, preferences)
    picks, exact = engine.pick_recipes(intent, entries, avoid=avoid, limit=3, rng=rng)
    picks = [entry for entry in picks if engine.allowed(entry, preferences)]
    # Câu nêu đúng tên một món có trong kho ("trứng với cà chua") → đưa món đó lên đầu.
    named = next((entry for entry in entries if entry.slug == slots.dish), None)
    if named is not None and engine.allowed(named, preferences):
        picks = [named, *[entry for entry in picks if entry.slug != named.slug]][:3]
    if not picks:
        return Handoff("no_match")
    if slots.ingredients:
        have = ", ".join(engine.ingredient_label(word, "vi") for word in slots.ingredients)
        head = _t(
            language,
            f"Với {have} bạn có thể nấu:" if exact else f"Chưa có món dùng đủ {have}; gần nhất là:",
            f"With {have} you could cook:" if exact else f"Closest matches for {have}:",
        )
    else:
        label = engine.MEAL_LABEL.get(intent.meal or "", {}).get(
            "en" if language == "en" else "vi", ""
        )
        head = _t(
            language,
            f"Gợi ý cho {label}:" if label else "Gợi ý cho bạn:",
            f"Ideas for {label}:" if label else "Some ideas:",
        )
    lines = [head]
    for entry in picks:
        lines.append(
            _t(
                language,
                f"- **{entry.name}** — khoảng {entry.minutes} phút, {entry.difficulty.lower()}",
                f"- **{entry.name}** — about {entry.minutes} min, {entry.difficulty}",
            )
        )
    return Answer(
        content="\n".join(lines),
        recipes=[entry.slug for entry in picks],
        followups=[_t(language, "Gợi ý món khác", "Other ideas")]
        + [_t(language, f"Cách nấu {picks[0].name}", f"How to cook {picks[0].name}")],
    )


def _clarify(spec: IntentSpec, slots: Slots, source: RecipeSource, language: str) -> Answer:
    names: list[str] = []
    if slots.dish_candidates:
        by_slug = {entry.slug: entry for entry in source.entries()}
        names = [by_slug[slug].name for slug in slots.dish_candidates if slug in by_slug]
    if names:
        content = _t(
            language,
            "Bếp Việt có vài món gần giống: " + ", ".join(names) + ". Bạn muốn hỏi món nào?",
            "Bếp Việt has a few close matches: " + ", ".join(names) + ". Which one?",
        )
    else:
        # Câu hỏi lại đã duyệt trong dữ liệu intent (answer_vi của action), nếu có.
        content = spec.answer(language) or _t(
            language, "Bạn muốn hỏi về món nào ạ?", "Which dish do you mean?"
        )
    return Answer(
        content=content, followups=names[:4], recipes=list(slots.dish_candidates), handler="ask"
    )


def respond(
    message: str,
    spec: IntentSpec,
    slots: Slots,
    *,
    language: str,
    source: RecipeSource | None,
    avoid: set[str] | None = None,
    preferences: engine.Preferences | None = None,
    rng: random.Random | None = None,
) -> Answer | Handoff:
    if spec.kind == "handoff_llm":
        return Handoff("handoff_intent")
    if spec.kind in ("faq", "smalltalk", "safety"):
        text = spec.answer(language)
        if not text:
            return Handoff("no_answer")
        followups = spec.followups_en if language == "en" and spec.followups_en else spec.followups
        return Answer(content=text, followups=list(followups), handler=spec.kind)
    handler = handler_for(spec)
    if handler is None:
        return Handoff("no_handler")
    if source is None:
        return Handoff("no_catalog")
    if handler == "suggest":
        result = suggest(
            message,
            slots,
            source.entries(),
            language,
            avoid=avoid or set(),
            preferences=preferences,
            rng=rng,
        )
    elif handler in NEEDS_DISH:
        if slots.dish is None:
            # Món lạ không có trong kho: tuyệt đối không dựng công thức, để LLM xử lý.
            if slots.dish_unknown and not slots.dish_candidates:
                return Handoff("unknown_dish")
            return _clarify(spec, slots, source, language)
        detail = source.detail(slots.dish)
        if detail is None:
            return Handoff("unknown_dish")
        if handler == "ingredients":
            result = ingredients(detail, slots, language)
        elif handler == "cook_time":
            result = cook_time(detail, language)
        elif handler == "nutrition":
            result = nutrition(detail, language)
        elif handler == "steps":
            result = steps(detail, language)
        else:
            result = Answer(
                content=overview(detail, language),
                recipes=[detail.slug],
                actions=[_recipe_action(detail, language)],
                followups=_dish_followups(detail, "overview", language),
            )
    else:
        return Handoff("no_handler")
    if isinstance(result, Answer) and not result.handler:
        result.handler = handler
    return result
