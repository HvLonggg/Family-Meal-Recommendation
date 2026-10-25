from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from app.core.rate_limit import SlidingWindowLimiter
from app.db.session import get_db_session
from app.modules.assistant import persona
from app.modules.assistant import service as assistant_service
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.cooking import companion as companion_service
from app.modules.cooking import service, webpush
from app.modules.cooking.schemas import (
    CompanionReply,
    CompanionRequest,
    CookLogCreate,
    CookLogList,
    CookLogResponse,
    PushConfig,
    PushSubscriptionDelete,
    PushSubscriptionIn,
    RecipeCookSummary,
    TimerCreate,
    TimerResponse,
    TimerUpdate,
)
from app.modules.planner.schemas import PlanItemResponse

router = APIRouter(prefix="/cooking")

# Chống ghi dồn dập làm phình CSDL (gói miễn phí): mỗi người tối đa 120 lần ghi mỗi giờ.
COOKING_WRITES = SlidingWindowLimiter(limit=120, window_seconds=3600)


def _limit_writes(user: User) -> None:
    key = str(user.id)
    if COOKING_WRITES.blocked(key):
        raise HTTPException(
            status_code=429, detail="Bạn thao tác quá nhanh, thử lại sau ít phút nhé."
        )
    COOKING_WRITES.hit(key)


DbSession = Annotated[Session, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]


def _fail(error: service.CookingError) -> HTTPException:
    return HTTPException(status_code=error.status_code, detail=error.detail)


@router.get("/logs", response_model=CookLogList, summary="List cooked dishes")
def cook_logs(
    session: DbSession,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=100)] = 30,
    offset: Annotated[int, Query(ge=0)] = 0,
    recipe: Annotated[str | None, Query(max_length=180)] = None,
) -> CookLogList:
    logs, total = service.list_logs(
        session, user_id=current_user.id, limit=limit, offset=offset, recipe_slug=recipe
    )
    return CookLogList(
        data=[CookLogResponse.model_validate(log) for log in logs],
        total=total,
        stats=service.stats(session, user_id=current_user.id),
    )


@router.post(
    "/logs",
    response_model=CookLogResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Record a cooked dish",
)
def add_cook_log(
    payload: CookLogCreate, session: DbSession, current_user: CurrentUser
) -> CookLogResponse:
    _limit_writes(current_user)
    try:
        log = service.create_log(session, user_id=current_user.id, payload=payload)
    except service.CookingError as error:
        raise _fail(error) from None
    return CookLogResponse.model_validate(log)


@router.delete(
    "/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove a cooked record"
)
def remove_cook_log(log_id: UUID, session: DbSession, current_user: CurrentUser) -> Response:
    if not service.delete_log(session, user_id=current_user.id, log_id=log_id):
        raise HTTPException(status_code=404, detail="Không tìm thấy lần nấu này.")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.delete(
    "/plan-items/{item_id}",
    response_model=PlanItemResponse,
    summary="Unmark a planned dish as cooked",
)
def unmark_plan_item(
    item_id: UUID, session: DbSession, current_user: CurrentUser
) -> PlanItemResponse:
    try:
        item = service.unmark_plan_item(session, user_id=current_user.id, item_id=item_id)
    except service.CookingError as error:
        raise _fail(error) from None
    return PlanItemResponse.model_validate(item)


@router.get(
    "/recipes/{slug}", response_model=RecipeCookSummary, summary="How often a dish was cooked"
)
def recipe_summary(slug: str, session: DbSession, current_user: CurrentUser) -> RecipeCookSummary:
    count, last = service.recipe_summary(session, user_id=current_user.id, recipe_slug=slug)
    return RecipeCookSummary(
        recipe_slug=slug,
        count=count,
        last_cooked_at=last.cooked_at if last else None,
        last_log_id=last.id if last else None,
    )


@router.get("/timers", response_model=list[TimerResponse], summary="List running timers")
def timers(session: DbSession, current_user: CurrentUser) -> list[TimerResponse]:
    return [
        TimerResponse.model_validate(timer)
        for timer in service.active_timers(session, user_id=current_user.id)
    ]


@router.put("/timers", response_model=TimerResponse, summary="Start or restart a timer")
def save_timer(
    payload: TimerCreate, session: DbSession, current_user: CurrentUser
) -> TimerResponse:
    _limit_writes(current_user)
    try:
        timer = service.save_timer(session, user_id=current_user.id, payload=payload)
    except service.CookingError as error:
        raise _fail(error) from None
    return TimerResponse.model_validate(timer)


@router.patch("/timers/{timer_id}", response_model=TimerResponse, summary="Snooze or stop a timer")
def update_timer(
    timer_id: UUID, payload: TimerUpdate, session: DbSession, current_user: CurrentUser
) -> TimerResponse:
    try:
        timer = service.update_timer(
            session,
            user_id=current_user.id,
            timer_id=timer_id,
            action=payload.action,
            seconds=payload.seconds,
        )
    except service.CookingError as error:
        raise _fail(error) from None
    return TimerResponse.model_validate(timer)


@router.get("/push", response_model=PushConfig, summary="Web Push configuration")
def push_config(_: CurrentUser) -> PushConfig:
    key = webpush.public_key()
    return PushConfig(enabled=key is not None, public_key=key)


@router.put(
    "/push/subscriptions",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Save this browser's push subscription",
)
def save_subscription(
    payload: PushSubscriptionIn, session: DbSession, current_user: CurrentUser
) -> Response:
    _limit_writes(current_user)
    if not webpush.push_enabled():
        raise HTTPException(status_code=503, detail="Thông báo đẩy chưa được bật trên máy chủ.")
    try:
        service.save_subscription(
            session,
            user_id=current_user.id,
            endpoint=payload.endpoint,
            p256dh=payload.keys.p256dh,
            auth=payload.keys.auth,
        )
    except service.CookingError as error:
        raise _fail(error) from None
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/push/subscriptions/delete",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove this browser's push subscription",
)
def delete_subscription(
    payload: PushSubscriptionDelete, session: DbSession, current_user: CurrentUser
) -> Response:
    service.delete_subscription(session, user_id=current_user.id, endpoint=payload.endpoint)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/assistant",
    response_model=CompanionReply,
    summary="Talk to Chú Rồng while cooking (understands the step, sets timers, answers questions)",
)
def companion(
    payload: CompanionRequest, session: DbSession, current_user: CurrentUser
) -> CompanionReply:
    # Dùng chung giới hạn tần suất với khung chat để không ai gọi AI liên tục.
    assistant_service.check_rate_limit(f"user:{current_user.id}")
    tone = assistant_service.tone_for(current_user)
    return companion_service.respond(payload, persona_block=persona.prompt_block(tone))
