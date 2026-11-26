from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from app.modules.recipes.models import Recipe
from app.modules.recipes.search import (
    RecipeSearchFields,
    english_search_index,
    matches_region,
    normalize_search,
    strict_search,
)


def _strings(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, dict):
        return [text for item in value.values() for text in _strings(item)]
    if isinstance(value, list):
        return [text for item in value for text in _strings(item)]
    return []


def recipe_search_fields(item: Recipe) -> RecipeSearchFields:
    content = item.content or {}
    english = english_search_index().get(item.slug, {})
    return RecipeSearchFields(
        names=[item.name, *english.get("names", [])],
        aliases=_strings(content.get("aliases", [])),
        ingredients=[
            *(ingredient.name for ingredient in item.ingredients),
            *english.get("ingredients", []),
        ],
        tags=[item.category, *_strings(content.get("tags", []))],
        regions=[
            item.region,
            *_strings(content.get("region", [])),
            *_strings(content.get("province", [])),
        ],
    )


def list_recipes(
    session: Session,
    *,
    query: str | None = None,
    region: str | None = None,
    category: str | None = None,
    limit: int = 24,
    offset: int = 0,
    with_details: bool = False,
) -> tuple[list[Recipe], int]:
    category_aliases = {
        "vegetarian dishes": "Món chay",
        "vegetarian": "Món chay",
        "soup": "Món canh",
        "vegetable dishes": "Món rau",
        "desserts": "Món tráng miệng",
        "breakfast dishes": "Món ăn sáng",
        "snacks": "Món ăn vặt",
    }
    category = category_aliases.get(normalize_search(category or ""), category)
    conditions = [Recipe.status == "published"]
    if category and category != "Món chay":
        conditions.append(Recipe.category == category)

    statement = (
        select(Recipe).where(*conditions).order_by(Recipe.catalog_id.asc(), Recipe.name.asc())
    )
    if with_details or query:
        statement = statement.options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
    if not query and not region and category != "Món chay":
        # Không cần lọc bằng Python: phân trang ngay trong SQL thay vì nạp cả bảng (kèm nguyên
        # liệu, bước làm) cho mỗi trang. Thứ tự và tổng số giống hệt nhánh lọc bên dưới.
        total = session.scalar(select(func.count(Recipe.id)).where(*conditions)) or 0
        return list(session.scalars(statement.limit(limit).offset(offset))), int(total)
    items = list(session.scalars(statement))
    if category == "Món chay":
        items = [
            item
            for item in items
            if item.category == category
            or category in (item.content or {}).get("tags", {}).get("dish_type", [])
        ]
    if region:
        items = [
            item
            for item in items
            if matches_region(
                region,
                [
                    item.region,
                    *(item.content or {}).get("region", []),
                    *(item.content or {}).get("province", []),
                ],
            )
        ]
    if query:
        # Strict name-first matching shared with the web catalog (see search.strict_search).
        matches = strict_search(query, [recipe_search_fields(item) for item in items])
        matches.sort(key=lambda match: match[1], reverse=True)
        items = [items[index] for index, _ in matches]
    return items[offset : offset + limit], len(items)


def get_recipe_by_slug(session: Session, slug: str) -> Recipe | None:
    statement = (
        select(Recipe)
        .where(Recipe.slug == slug, Recipe.status == "published")
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
    )
    return session.scalar(statement)
