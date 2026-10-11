from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.planner.schemas import (
    PlanEventResponse,
    PlanHistoryResponse,
    PlanItemCreate,
    PlanItemResponse,
    PlanItemUpdate,
    PlanMealCreate,
    PlanMealCreateResponse,
    PlanMealHistoryGroup,
    PlanMealHistoryResponse,
    PlanMealStatusUpdate,
    ShoppingListResponse,
    ShoppingPeriod,
)
from app.modules.planner.service import (
    create_shopping_list,
    list_past_meals,
    list_plan_history,
    list_plan_items,
    remove_plan_item,
    save_plan_item,
    save_plan_meal,
    update_meal_status,
    update_plan_item,
)

router = APIRouter(prefix="/planner")


@router.get("/items", response_model=list[PlanItemResponse], summary="List meal plan items")
def plan_items(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    from_date: Annotated[date, Query(alias="from")],
    to_date: Annotated[date, Query(alias="to")],
) -> list[PlanItemResponse]:
    if to_date < from_date:
        raise HTTPException(status_code=422, detail="Ngày kết thúc phải sau ngày bắt đầu.")
    if (to_date - from_date).days > 366:
        raise HTTPException(status_code=422, detail="Mỗi lần chỉ xem tối đa một năm kế hoạch.")
    return [
        PlanItemResponse.model_validate(item)
        for item in list_plan_items(
            session, user_id=current_user.id, from_date=from_date, to_date=to_date
        )
    ]


@router.post(
    "/items",
    response_model=PlanItemResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Add or update a recipe in the meal plan",
)
def add_plan_item(
    payload: PlanItemCreate,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlanItemResponse:
    item, action = save_plan_item(
        session,
        user_id=current_user.id,
        recipe_slug=payload.recipe_slug,
        plan_date=payload.plan_date,
        meal_type=payload.meal_type,
        servings=payload.servings,
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy món ăn.")
    if action == "unchanged":
        raise HTTPException(status_code=409, detail="Món này đã có trong bữa ăn đã chọn.")
    return PlanItemResponse.model_validate(item)


@router.post(
    "/meals",
    response_model=PlanMealCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save multiple recipes to one planned meal",
)
def add_plan_meal(
    payload: PlanMealCreate,
    response: Response,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlanMealCreateResponse:
    items, already_planned, found = save_plan_meal(
        session,
        user_id=current_user.id,
        recipe_slugs=payload.recipe_slugs,
        plan_date=payload.plan_date,
        meal_type=payload.meal_type,
        servings=payload.servings,
    )
    if not found:
        raise HTTPException(status_code=404, detail="Không tìm thấy một hoặc nhiều món ăn.")
    if not items:
        response.status_code = status.HTTP_200_OK
    return PlanMealCreateResponse(
        items=[PlanItemResponse.model_validate(item) for item in items],
        already_planned=already_planned,
    )


@router.patch(
    "/meals/status",
    response_model=list[PlanItemResponse],
    summary="Update completion status for a planned meal",
)
def edit_meal_status(
    payload: PlanMealStatusUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[PlanItemResponse]:
    items = update_meal_status(
        session,
        user_id=current_user.id,
        plan_date=payload.plan_date,
        meal_type=payload.meal_type,
        completion_status=payload.completion_status,
    )
    if not items:
        raise HTTPException(status_code=404, detail="Không tìm thấy bữa ăn trong kế hoạch.")
    return [PlanItemResponse.model_validate(item) for item in items]


@router.patch("/items/{item_id}", response_model=PlanItemResponse, summary="Update plan servings")
def edit_plan_item(
    item_id: UUID,
    payload: PlanItemUpdate,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> PlanItemResponse:
    item = update_plan_item(
        session, user_id=current_user.id, item_id=item_id, servings=payload.servings
    )
    if item is None:
        raise HTTPException(status_code=404, detail="Không tìm thấy món trong kế hoạch.")
    return PlanItemResponse.model_validate(item)


@router.delete(
    "/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove plan item"
)
def delete_plan_item(
    item_id: UUID,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> Response:
    if not remove_plan_item(session, user_id=current_user.id, item_id=item_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy món trong kế hoạch.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/history", response_model=PlanHistoryResponse, summary="List meal plan history")
def plan_history(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlanHistoryResponse:
    events, total = list_plan_history(session, user_id=current_user.id, limit=limit, offset=offset)
    return PlanHistoryResponse(
        data=[PlanEventResponse.model_validate(event) for event in events], total=total
    )


@router.get(
    "/history/meals",
    response_model=PlanMealHistoryResponse,
    summary="List planned meals up to a date",
)
def past_meals(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    through: Annotated[date, Query()],
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PlanMealHistoryResponse:
    groups, total = list_past_meals(
        session,
        user_id=current_user.id,
        through_date=through,
        limit=limit,
        offset=offset,
    )
    data = [
        PlanMealHistoryGroup(
            plan_date=plan_date,
            meal_type=meal_type,
            completion_status=items[0].completion_status,
            items=[PlanItemResponse.model_validate(item) for item in items],
        )
        for plan_date, meal_type, items in groups
        if items
    ]
    return PlanMealHistoryResponse(data=data, total=total)


@router.get("/shopping-list", response_model=ShoppingListResponse, summary="Build a shopping list")
def shopping_list(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
    on: Annotated[date, Query(alias="date")],
    period: ShoppingPeriod = "week",
) -> ShoppingListResponse:
    return ShoppingListResponse.model_validate(
        create_shopping_list(session, user_id=current_user.id, period=period, anchor_date=on)
    )
