from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.modules.saved_meals.models import SavedMeal

MAX_SAVED_MEALS = 8


def list_saved_meals(session: Session, user_id: UUID) -> list[SavedMeal]:
    statement = (
        select(SavedMeal)
        .where(SavedMeal.user_id == user_id)
        .order_by(SavedMeal.created_at.desc(), SavedMeal.id.desc())
        .limit(MAX_SAVED_MEALS)
    )
    return list(session.scalars(statement))


def create_saved_meal(
    session: Session,
    *,
    user_id: UUID,
    profile: str,
    dish_ids: list[str],
) -> SavedMeal:
    meal = SavedMeal(user_id=user_id, profile=profile, dish_ids=dish_ids)
    session.add(meal)
    session.flush()

    older_ids = list(
        session.scalars(
            select(SavedMeal.id)
            .where(SavedMeal.user_id == user_id)
            .order_by(SavedMeal.created_at.desc(), SavedMeal.id.desc())
            .offset(MAX_SAVED_MEALS)
        )
    )
    if older_ids:
        session.execute(delete(SavedMeal).where(SavedMeal.id.in_(older_ids)))

    session.commit()
    session.refresh(meal)
    return meal
