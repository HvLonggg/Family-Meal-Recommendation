"""Nghiệp vụ "đã nấu", chuông hẹn giờ khi vào bếp và thông báo đẩy."""

from __future__ import annotations

import hmac
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session, joinedload, sessionmaker

from app.modules.cooking import webpush
from app.modules.cooking.models import UserCookLog, UserCookTimer, UserPushSubscription
from app.modules.cooking.schemas import CookLogCreate, CookStats, TimerCreate
from app.modules.planner.models import UserMealPlanItem
from app.modules.planner.service import set_item_status
from app.modules.recipes.models import Recipe

logger = logging.getLogger("bep_viet.cooking")

# Bấm hai lần liên tiếp (hoặc mạng gửi lại) không tạo hai lần nấu cho cùng một món.
DUPLICATE_WINDOW = timedelta(seconds=90)
# Chuông quá hạn lâu hơn mức này thì không đẩy nữa (người dùng đã bỏ dở).
STALE_TIMER = timedelta(hours=1)
KEEP_TIMERS = timedelta(days=2)
MAX_SUBSCRIPTIONS_PER_USER = 10
MAX_ACTIVE_TIMERS = 20


class CookingError(Exception):
    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(detail)
        self.status_code = status_code
        self.detail = detail


def _now() -> datetime:
    return datetime.now(UTC)


def _plan_item(session: Session, user_id: UUID, item_id: UUID) -> UserMealPlanItem:
    item = session.scalar(
        select(UserMealPlanItem)
        .options(joinedload(UserMealPlanItem.recipe))
        .where(UserMealPlanItem.id == item_id, UserMealPlanItem.user_id == user_id)
    )
    if item is None:
        raise CookingError(404, "Không tìm thấy món trong kế hoạch.")
    return item


def create_log(session: Session, *, user_id: UUID, payload: CookLogCreate) -> UserCookLog:
    recipe = session.scalar(select(Recipe).where(Recipe.slug == payload.recipe_slug))
    if recipe is None:
        raise CookingError(404, "Không tìm thấy món ăn.")
    item: UserMealPlanItem | None = None
    if payload.plan_item_id is not None:
        item = _plan_item(session, user_id, payload.plan_item_id)
        if item.recipe_id != recipe.id:
            raise CookingError(422, "Món trong kế hoạch không khớp với món đã nấu.")
        existing = session.scalar(
            select(UserCookLog)
            .where(UserCookLog.user_id == user_id, UserCookLog.plan_item_id == item.id)
            .order_by(UserCookLog.cooked_at.desc())
        )
        if existing is not None:
            # Một món trong kế hoạch chỉ ghi nhận một lần nấu; gọi lại thì cập nhật số liệu.
            if payload.duration_seconds is not None:
                existing.duration_seconds = payload.duration_seconds
                existing.started_at = payload.started_at or existing.started_at
            set_item_status(session, user_id=user_id, item=item, completion_status="completed")
            session.commit()
            return existing
    else:
        recent = session.scalar(
            select(UserCookLog)
            .where(
                UserCookLog.user_id == user_id,
                UserCookLog.recipe_id == recipe.id,
                UserCookLog.cooked_at >= _now() - DUPLICATE_WINDOW,
            )
            .order_by(UserCookLog.cooked_at.desc())
        )
        if recent is not None:
            return recent

    log = UserCookLog(
        user_id=user_id,
        recipe_id=recipe.id,
        plan_item_id=item.id if item else None,
        recipe_slug=recipe.slug,
        recipe_name=recipe.name,
        image_path=recipe.image_path,
        servings=payload.servings or (item.servings if item else recipe.base_servings),
        source=payload.source if not item or payload.source == "cook_mode" else "planner",
        started_at=payload.started_at,
        cooked_at=_now(),
        duration_seconds=payload.duration_seconds,
        note=payload.note,
    )
    session.add(log)
    if item is not None:
        set_item_status(session, user_id=user_id, item=item, completion_status="completed")
    session.commit()
    session.refresh(log)
    return log


def _reopen_if_unlogged(session: Session, user_id: UUID, item_id: UUID | None) -> None:
    if item_id is None:
        return
    remaining = session.scalar(
        select(func.count()).where(
            UserCookLog.user_id == user_id, UserCookLog.plan_item_id == item_id
        )
    )
    item = session.scalar(
        select(UserMealPlanItem)
        .options(joinedload(UserMealPlanItem.recipe))
        .where(UserMealPlanItem.id == item_id, UserMealPlanItem.user_id == user_id)
    )
    if not remaining and item is not None and item.completion_status == "completed":
        set_item_status(session, user_id=user_id, item=item, completion_status="planned")


def delete_log(session: Session, *, user_id: UUID, log_id: UUID) -> bool:
    log = session.scalar(
        select(UserCookLog).where(UserCookLog.id == log_id, UserCookLog.user_id == user_id)
    )
    if log is None:
        return False
    item_id = log.plan_item_id
    session.delete(log)
    session.flush()
    _reopen_if_unlogged(session, user_id, item_id)
    session.commit()
    return True


def unmark_plan_item(session: Session, *, user_id: UUID, item_id: UUID) -> UserMealPlanItem:
    """Bỏ tick "đã nấu" trong kế hoạch: xóa lần nấu gắn với món và mở lại món."""
    item = _plan_item(session, user_id, item_id)
    session.execute(
        delete(UserCookLog).where(
            UserCookLog.user_id == user_id, UserCookLog.plan_item_id == item_id
        )
    )
    set_item_status(session, user_id=user_id, item=item, completion_status="planned")
    session.commit()
    return item


def list_logs(
    session: Session, *, user_id: UUID, limit: int, offset: int, recipe_slug: str | None = None
) -> tuple[list[UserCookLog], int]:
    conditions = [UserCookLog.user_id == user_id]
    if recipe_slug:
        conditions.append(UserCookLog.recipe_slug == recipe_slug)
    total = session.scalar(select(func.count()).select_from(UserCookLog).where(*conditions)) or 0
    logs = list(
        session.scalars(
            select(UserCookLog)
            .where(*conditions)
            .order_by(UserCookLog.cooked_at.desc(), UserCookLog.id)
            .limit(limit)
            .offset(offset)
        )
    )
    return logs, total


def stats(session: Session, *, user_id: UUID) -> CookStats:
    mine = UserCookLog.user_id == user_id
    total, dishes, seconds = session.execute(
        select(
            func.count(),
            func.count(func.distinct(UserCookLog.recipe_slug)),
            func.coalesce(func.sum(UserCookLog.duration_seconds), 0),
        ).where(mine)
    ).one()
    recent = session.scalar(
        select(func.count()).where(mine, UserCookLog.cooked_at >= _now() - timedelta(days=7))
    )
    return CookStats(
        total=total, dishes=dishes, last_7_days=recent or 0, total_minutes=int(seconds or 0) // 60
    )


def recipe_summary(
    session: Session, *, user_id: UUID, recipe_slug: str
) -> tuple[int, UserCookLog | None]:
    logs, total = list_logs(session, user_id=user_id, limit=1, offset=0, recipe_slug=recipe_slug)
    return total, logs[0] if logs else None


# --- Chuông hẹn giờ ------------------------------------------------------------------------


def _timer(session: Session, user_id: UUID, timer_id: UUID) -> UserCookTimer | None:
    return session.scalar(
        select(UserCookTimer).where(UserCookTimer.id == timer_id, UserCookTimer.user_id == user_id)
    )


def save_timer(session: Session, *, user_id: UUID, payload: TimerCreate) -> UserCookTimer:
    now = _now()
    timer = _timer(session, user_id, payload.id)
    if timer is None:
        if session.get(UserCookTimer, payload.id) is not None:
            # Trùng id với chuông của người khác: không tiết lộ, chỉ từ chối.
            raise CookingError(409, "Không tạo được chuông hẹn giờ.")
        if len(active_timers(session, user_id=user_id)) >= MAX_ACTIVE_TIMERS:
            raise CookingError(429, "Bạn đang có quá nhiều chuông hẹn giờ.")
        timer = UserCookTimer(id=payload.id, user_id=user_id, started_at=now)
        session.add(timer)
    timer.label = payload.label.strip()
    timer.recipe_slug = payload.recipe_slug
    timer.return_path = payload.return_path
    timer.status = "running"
    timer.due_at = now + timedelta(seconds=payload.seconds)
    timer.notified_at = None
    session.commit()
    session.refresh(timer)
    return timer


def update_timer(
    session: Session, *, user_id: UUID, timer_id: UUID, action: str, seconds: int | None
) -> UserCookTimer:
    timer = _timer(session, user_id, timer_id)
    if timer is None:
        raise CookingError(404, "Không tìm thấy chuông hẹn giờ.")
    if action == "snooze":
        timer.status = "running"
        timer.due_at = _now() + timedelta(seconds=seconds or 300)
        timer.notified_at = None
    else:
        timer.status = "done" if action == "done" else "cancelled"
    session.commit()
    session.refresh(timer)
    return timer


def active_timers(session: Session, *, user_id: UUID) -> list[UserCookTimer]:
    return list(
        session.scalars(
            select(UserCookTimer)
            .where(
                UserCookTimer.user_id == user_id,
                UserCookTimer.status == "running",
                UserCookTimer.due_at >= _now() - STALE_TIMER,
            )
            .order_by(UserCookTimer.due_at)
        )
    )


# --- Thông báo đẩy -------------------------------------------------------------------------


def save_subscription(
    session: Session, *, user_id: UUID, endpoint: str, p256dh: str, auth: str
) -> None:
    if not webpush.allowed_endpoint(endpoint):
        raise CookingError(422, "Trình duyệt này chưa hỗ trợ thông báo đẩy.")
    try:
        webpush.encrypt(b"probe", p256dh, auth)
    except (ValueError, TypeError):
        raise CookingError(422, "Khóa đăng ký thông báo không hợp lệ.") from None
    subscription = session.scalar(
        select(UserPushSubscription).where(UserPushSubscription.endpoint == endpoint)
    )
    if subscription is None:
        subscription = UserPushSubscription(endpoint=endpoint)
        session.add(subscription)
    elif subscription.user_id != user_id and not hmac.compare_digest(subscription.auth, auth):
        # Biết mỗi URL endpoint chưa đủ để chiếm thông báo của người khác.
        raise CookingError(409, "Không lưu được đăng ký thông báo.")
    # Cùng một trình duyệt đổi tài khoản: thông báo thuộc về người đang đăng nhập.
    subscription.user_id = user_id
    subscription.p256dh = p256dh
    subscription.auth = auth
    session.flush()
    extra = list(
        session.scalars(
            select(UserPushSubscription.id)
            .where(UserPushSubscription.user_id == user_id)
            .order_by(UserPushSubscription.created_at.desc(), UserPushSubscription.id)
            .offset(MAX_SUBSCRIPTIONS_PER_USER)
        )
    )
    if extra:
        session.execute(delete(UserPushSubscription).where(UserPushSubscription.id.in_(extra)))
    session.commit()


def delete_subscription(session: Session, *, user_id: UUID, endpoint: str) -> None:
    session.execute(
        delete(UserPushSubscription).where(
            UserPushSubscription.user_id == user_id, UserPushSubscription.endpoint == endpoint
        )
    )
    session.commit()


def timer_message(timer: UserCookTimer) -> dict[str, str]:
    separator = "&" if "?" in timer.return_path else "?"
    return {
        "title": "⏰ Hết giờ rồi!",
        "body": f"{timer.label} — bấm để xác nhận xong hoặc hẹn thêm.",
        "tag": f"cook-timer-{timer.id}",
        "timer_id": str(timer.id),
        "url": f"{timer.return_path}{separator}timer={timer.id}",
    }


def dispatch_due_timers(
    now: datetime | None = None, session_factory: sessionmaker[Session] | None = None
) -> int:
    """Đẩy thông báo cho các chuông đến hạn; trả về số chuông đã xử lý."""
    from app.db.session import SessionLocal

    factory = session_factory or SessionLocal
    now = now or _now()
    handled = 0
    with factory() as session:
        session.execute(delete(UserCookTimer).where(UserCookTimer.due_at < now - KEEP_TIMERS))
        timers = list(
            session.scalars(
                select(UserCookTimer)
                .where(
                    UserCookTimer.status == "running",
                    UserCookTimer.notified_at.is_(None),
                    UserCookTimer.due_at <= now,
                    UserCookTimer.due_at >= now - STALE_TIMER,
                )
                .order_by(UserCookTimer.due_at)
                .limit(100)
            )
        )
        for timer in timers:
            # Đánh dấu trước khi gửi: lỗi mạng không làm chuông bị đẩy lặp lại liên tục.
            timer.notified_at = now
            subscriptions = list(
                session.scalars(
                    select(UserPushSubscription).where(
                        UserPushSubscription.user_id == timer.user_id
                    )
                )
            )
            message = timer_message(timer)
            for subscription in subscriptions:
                target = webpush.PushTarget(
                    subscription.endpoint, subscription.p256dh, subscription.auth
                )
                try:
                    webpush.send(target, message)
                except webpush.PushGoneError:
                    session.delete(subscription)
            handled += 1
        session.commit()
    return handled


async def run_cook_timer_worker() -> None:
    import asyncio

    while True:
        try:
            await asyncio.to_thread(dispatch_due_timers)
        except Exception as exc:  # Giữ vòng lặp sống khi một chu kỳ lỗi.
            logger.error("Cook timer dispatch failed (%s).", type(exc).__name__)
        await asyncio.sleep(5)
