"""Email nhắc lên kế hoạch bữa ăn tuần mới, gửi tối Chủ nhật 21:00 (giờ Việt Nam).

Render Free không có cron: GitHub Actions gọi endpoint nội bộ mỗi Chủ nhật. Mỗi người dùng
chỉ nhận tối đa một email cho mỗi tuần (khóa theo Thứ Hai của tuần sắp tới), kể cả khi
workflow chạy lại hoặc hai lượt chạy trùng nhau.
"""

import base64
import hashlib
import hmac
import logging
import time
from datetime import date, datetime, timedelta
from typing import Any
from uuid import UUID
from zoneinfo import ZoneInfo

from pydantic import BaseModel
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.account.preferences import read_preferences
from app.modules.auth.email import (
    WEEKLY_PLAN_SLOTS,
    EmailDeliveryError,
    send_weekly_plan_reminder_email,
)
from app.modules.auth.models import User
from app.modules.planner.models import UserMealPlanItem

logger = logging.getLogger("bep_viet.reminders.weekly")

VIETNAM_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
DEFAULT_BATCH_LIMIT = 400
# Một lượt gọi HTTP không nên chạy quá lâu (Render cắt request dài): hết ngân sách thời gian
# thì dừng và báo has_more để workflow gọi lượt tiếp theo.
RUN_TIME_BUDGET_SECONDS = 60.0
PAGE_SIZE = 200
# Gmail lỗi liên tiếp (hết quyền, hết hạn mức...) thì dừng thay vì thử hết mọi người dùng.
MAX_CONSECUTIVE_FAILURES = 5
MEAL_TYPES = ("breakfast", "lunch", "dinner")
UNSUBSCRIBE_PATH = "/reminders/weekly/unsubscribe"


class WeeklyReminderRun(BaseModel):
    week_start: date
    sent: int = 0
    failed: int = 0
    # Đã có lượt chạy khác nhận gửi cho người dùng này trong tuần.
    skipped: int = 0
    opted_out: int = 0
    has_more: bool = False
    aborted: bool = False


def coming_monday(now: datetime) -> date:
    """Thứ Hai của tuần sắp tới theo giờ Việt Nam (chạy tối Chủ nhật thì là ngày hôm sau)."""
    if now.tzinfo is None:
        raise ValueError("Weekly reminder requires a timezone-aware datetime.")
    local_date = now.astimezone(VIETNAM_TIMEZONE).date()
    return local_date + timedelta(days=7 - local_date.weekday())


def planned_meal_count(session: Session, user_id: UUID, week_start: date) -> int:
    """Số bữa (ngày + bữa sáng/trưa/tối) đã có món trong tuần bắt đầu từ week_start."""
    rows = session.execute(
        select(UserMealPlanItem.plan_date, UserMealPlanItem.meal_type)
        .where(
            UserMealPlanItem.user_id == user_id,
            UserMealPlanItem.plan_date >= week_start,
            UserMealPlanItem.plan_date < week_start + timedelta(days=7),
        )
        .distinct()
    ).all()
    slots = {(plan_date, meal_type) for plan_date, meal_type in rows if meal_type in MEAL_TYPES}
    return min(len(slots), WEEKLY_PLAN_SLOTS)


# --- Link hủy nhận một chạm -------------------------------------------------------------


def _unsubscribe_key() -> bytes:
    secret = get_settings().jwt_secret.get_secret_value().encode("utf-8")
    # Khóa con riêng cho mục đích này: chữ ký không dùng lại được ở nơi khác.
    return hmac.new(secret, b"bep-viet:weekly-reminder-unsubscribe:v1", hashlib.sha256).digest()


def _signature(user_id: UUID) -> str:
    digest = hmac.new(_unsubscribe_key(), user_id.hex.encode("ascii"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def make_unsubscribe_token(user_id: UUID) -> str:
    return f"{user_id.hex}.{_signature(user_id)}"


def read_unsubscribe_token(token: str) -> UUID | None:
    """Trả user id nếu chữ ký hợp lệ; token sai hoặc bị sửa đều trả None."""
    user_hex, separator, signature = token.partition(".")
    if not separator or len(user_hex) != 32:
        return None
    try:
        user_id = UUID(hex=user_hex)
    except ValueError:
        return None
    if not hmac.compare_digest(signature.encode("utf-8"), _signature(user_id).encode("ascii")):
        return None
    return user_id


def unsubscribe_url(user_id: UUID) -> str:
    settings = get_settings()
    base = str(settings.frontend_url).rstrip("/")
    token = make_unsubscribe_token(user_id)
    return f"{base}{settings.api_v1_prefix}{UNSUBSCRIBE_PATH}?token={token}"


def unsubscribe_user(session: Session, user_id: UUID) -> bool:
    """Tắt email nhắc tuần cho người dùng. Trả False nếu không còn tài khoản."""
    user = session.get(User, user_id)
    if user is None:
        return False
    preferences = read_preferences(user.preferences)
    if preferences.weekly_reminder_email:
        updated = preferences.model_copy(update={"weekly_reminder_email": False})
        user.preferences = updated.model_dump(mode="json")
        session.commit()
    return True


# --- Gửi hàng loạt ------------------------------------------------------------------------


def _claim_week(session: Session, user_id: UUID, monday: date) -> bool:
    """Giữ chỗ gửi cho tuần này; chỉ một lượt chạy giữ được (cập nhật có điều kiện)."""
    result = session.execute(
        update(User)
        .where(
            User.id == user_id,
            or_(User.weekly_reminder_week.is_(None), User.weekly_reminder_week < monday),
        )
        .values(weekly_reminder_week=monday, updated_at=User.updated_at)
        .execution_options(synchronize_session=False)
    )
    session.commit()
    return bool(getattr(result, "rowcount", 0))


def _release_week(session: Session, user_id: UUID, monday: date) -> None:
    """Trả lại chỗ khi gửi lỗi để lượt chạy sau (hoặc chạy lại thủ công) gửi lại được."""
    session.rollback()
    session.execute(
        update(User)
        .where(User.id == user_id, User.weekly_reminder_week == monday)
        .values(weekly_reminder_week=None, updated_at=User.updated_at)
        .execution_options(synchronize_session=False)
    )
    session.commit()


def _eligible_page(
    session: Session, monday: date, after_id: UUID | None
) -> list[tuple[UUID, str, str, dict[str, Any]]]:
    """Một trang người dùng đang hoạt động, đã xác minh email và chưa nhận email tuần này."""
    statement = (
        select(User.id, User.email, User.full_name, User.preferences)
        .where(
            User.status == "active",
            User.email.is_not(None),
            User.email_verified_at.is_not(None),
            or_(User.weekly_reminder_week.is_(None), User.weekly_reminder_week < monday),
        )
        .order_by(User.id)
        .limit(PAGE_SIZE)
    )
    if after_id is not None:
        statement = statement.where(User.id > after_id)
    return [
        (user_id, email, full_name, preferences or {})
        for user_id, email, full_name, preferences in session.execute(statement)
        if email
    ]


def send_weekly_reminders(
    session: Session,
    now: datetime,
    *,
    limit: int = DEFAULT_BATCH_LIMIT,
    time_budget_seconds: float = RUN_TIME_BUDGET_SECONDS,
) -> WeeklyReminderRun:
    """Gửi email nhắc tuần cho người dùng đủ điều kiện, tối đa ``limit`` email mỗi lượt."""
    monday = coming_monday(now)
    run = WeeklyReminderRun(week_start=monday)
    deadline = time.monotonic() + time_budget_seconds
    consecutive_failures = 0
    last_id: UUID | None = None
    stop = False

    while not stop:
        page = _eligible_page(session, monday, last_id)
        if not page:
            break
        for user_id, email, full_name, raw_preferences in page:
            last_id = user_id
            if not read_preferences(raw_preferences).weekly_reminder_email:
                run.opted_out += 1
                continue
            if run.sent + run.failed >= limit or time.monotonic() >= deadline:
                run.has_more = True
                stop = True
                break
            if consecutive_failures >= MAX_CONSECUTIVE_FAILURES:
                run.has_more = True
                run.aborted = True
                stop = True
                break
            outcome = _send_to_user(session, user_id, email, full_name, monday)
            if outcome == "sent":
                run.sent += 1
                consecutive_failures = 0
            elif outcome == "failed":
                run.failed += 1
                consecutive_failures += 1
            else:
                run.skipped += 1
        if len(page) < PAGE_SIZE:
            break

    logger.info(
        "Weekly reminders for week %s: sent=%s failed=%s skipped=%s opted_out=%s "
        "has_more=%s aborted=%s",
        monday.isoformat(),
        run.sent,
        run.failed,
        run.skipped,
        run.opted_out,
        run.has_more,
        run.aborted,
    )
    return run


def _send_to_user(session: Session, user_id: UUID, email: str, full_name: str, monday: date) -> str:
    """Trả "sent", "failed" hoặc "skipped"; không bao giờ ném lỗi ra ngoài."""
    if not _claim_week(session, user_id, monday):
        return "skipped"
    try:
        send_weekly_plan_reminder_email(
            recipient=email,
            recipient_name=full_name,
            week_start=monday,
            planned_meals=planned_meal_count(session, user_id, monday),
            unsubscribe_url=unsubscribe_url(user_id),
        )
    except EmailDeliveryError as exc:
        logger.warning("Weekly reminder delivery failed (%s).", type(exc).__name__)
    except Exception as exc:  # Một người dùng lỗi không được làm hỏng cả lượt gửi.
        logger.error("Weekly reminder crashed for one user (%s).", type(exc).__name__)
    else:
        return "sent"
    _release_week(session, user_id, monday)
    return "failed"
