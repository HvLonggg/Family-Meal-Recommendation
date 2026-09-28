from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.modules.recipes.models import Recipe


def list_recipes(
    session: Session,
    *,
    query: str | None = None,
    region: str | None = None,
    category: str | None = None,
    limit: int = 24,
    offset: int = 0,
) -> tuple[list[Recipe], int]:
    conditions = [Recipe.status == "published"]
    if query:
        search = f"%{query.strip()}%"
        conditions.append(or_(Recipe.name.ilike(search), Recipe.excerpt.ilike(search)))
    if region:
        conditions.append(Recipe.region == region)
    if category:
        conditions.append(Recipe.category == category)

    statement = (
        select(Recipe)
        .where(*conditions)
        .order_by(Recipe.created_at.desc(), Recipe.name.asc())
        .limit(limit)
        .offset(offset)
    )
    count_statement = select(func.count()).select_from(Recipe).where(*conditions)
    return list(session.scalars(statement)), int(session.scalar(count_statement) or 0)


def get_recipe_by_slug(session: Session, slug: str) -> Recipe | None:
    statement = (
        select(Recipe)
        .where(Recipe.slug == slug, Recipe.status == "published")
        .options(selectinload(Recipe.ingredients), selectinload(Recipe.steps))
    )
    return session.scalar(statement)
