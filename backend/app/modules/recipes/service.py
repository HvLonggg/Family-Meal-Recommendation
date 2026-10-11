from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.modules.recipes.models import Recipe
from app.modules.recipes.search import matches_search


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
            or category in item.content.get("tags", {}).get("dish_type", [])
        ]
    if region:
        items = [
            item
            for item in items
            if item.region == region or region in item.content.get("region", [])
        ]
    if query:
        items = [
            item
            for item in items
            if matches_search(
                query,
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
            )
        ]
    return items[offset : offset + limit], len(items)


def get_recipe_by_slug(session: Session, slug: str) -> Recipe | None:
    statement = (
        select(Recipe)
        .where(Recipe.slug == slug, Recipe.status == "published")
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
    )
    return session.scalar(statement)
