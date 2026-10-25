from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.recipes.models import Recipe
from app.modules.recipes.search import (
    bilingual_search_text,
    english_search_index,
    matches_region,
    matches_search,
    normalize_search,
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
        items = [
            item
            for item in items
            if matches_search(
                query,
                bilingual_search_text(
                    item.slug,
                    item.search_text
                    or " ".join(
                        [
                            item.name,
                            item.excerpt,
                            item.region,
                            item.category,
                            *[ingredient.name for ingredient in item.ingredients],
                        ]
                    ),
                ),
            )
        ]
        normalized_query = normalize_search(query)

        def relevance(item: Recipe) -> int:
            content = item.content or {}
            aliases = content.get("aliases", [])
            english_names = english_search_index().get(item.slug, {}).get("names", [])
            names = [item.name, *aliases, *english_names]
            normalized_names = [normalize_search(name) for name in names if isinstance(name, str)]
            if normalized_query in normalized_names:
                return 120
            if any(name.startswith(normalized_query) for name in normalized_names):
                return 100
            if any(normalized_query in name for name in normalized_names):
                return 80
            if matches_search(query, " ".join(names)):
                return 70
            english_entry = english_search_index().get(item.slug, {})
            fields = [
                item.excerpt,
                item.region,
                item.category,
                *english_entry.get("ingredients", []),
                *english_entry.get("fields", []),
                *[ingredient.name for ingredient in item.ingredients],
            ]
            if any(normalize_search(field) == normalized_query for field in fields):
                return 60
            if any(normalized_query in normalize_search(field) for field in fields):
                return 50
            if any(matches_search(query, field) for field in fields):
                return 40
            return 0

        items.sort(key=relevance, reverse=True)
    return items[offset : offset + limit], len(items)


def get_recipe_by_slug(session: Session, slug: str) -> Recipe | None:
    statement = (
        select(Recipe)
        .where(Recipe.slug == slug, Recipe.status == "published")
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
    )
    return session.scalar(statement)
