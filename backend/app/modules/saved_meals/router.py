from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.saved_meals.schemas import SavedMealCreate, SavedMealResponse
from app.modules.saved_meals.service import create_saved_meal, list_saved_meals

router = APIRouter(prefix="/saved-meals")


@router.get("", response_model=list[SavedMealResponse], summary="List saved meals")
def saved_meals(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[SavedMealResponse]:
    return [
        SavedMealResponse.from_saved_meal(item)
        for item in list_saved_meals(session, current_user.id)
    ]


@router.post(
    "",
    response_model=SavedMealResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a meal",
)
def save_meal(
    payload: SavedMealCreate,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> SavedMealResponse:
    meal = create_saved_meal(
        session,
        user_id=current_user.id,
        profile=payload.profile,
        dish_ids=payload.dish_ids,
    )
    return SavedMealResponse.from_saved_meal(meal)
