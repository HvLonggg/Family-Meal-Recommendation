import hmac
from datetime import UTC, datetime
from html import escape
from typing import Annotated

from fastapi import APIRouter, Depends, Header, Query, status
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.exceptions import DomainError
from app.db.session import get_db_session
from app.modules.reminders.weekly import (
    DEFAULT_BATCH_LIMIT,
    UNSUBSCRIBE_PATH,
    WeeklyReminderRun,
    read_unsubscribe_token,
    send_weekly_reminders,
    unsubscribe_user,
)

router = APIRouter()

DatabaseSession = Annotated[Session, Depends(get_db_session)]


class CronDisabledError(DomainError):
    code = "CRON_DISABLED"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


class CronUnauthorizedError(DomainError):
    code = "CRON_UNAUTHORIZED"
    status_code = status.HTTP_401_UNAUTHORIZED


class EmailNotConfiguredError(DomainError):
    code = "EMAIL_NOT_CONFIGURED"
    status_code = status.HTTP_503_SERVICE_UNAVAILABLE


def require_cron_secret(
    x_cron_secret: Annotated[str | None, Header(alias="X-Cron-Secret")] = None,
) -> None:
    """Chỉ bộ lập lịch (GitHub Actions) biết khóa này; chưa cấu hình thì tắt hẳn endpoint."""
    configured = get_settings().cron_secret
    secret = configured.get_secret_value() if configured else ""
    if not secret:
        raise CronDisabledError("Tác vụ định kỳ chưa được bật trên máy chủ này.")
    provided = (x_cron_secret or "").encode("utf-8")
    if not provided or not hmac.compare_digest(provided, secret.encode("utf-8")):
        raise CronUnauthorizedError("Khóa tác vụ định kỳ không hợp lệ.")


@router.post(
    "/internal/reminders/weekly",
    response_model=WeeklyReminderRun,
    dependencies=[Depends(require_cron_secret)],
    include_in_schema=False,
)
def run_weekly_reminders(
    session: DatabaseSession,
    limit: Annotated[int, Query(ge=1, le=DEFAULT_BATCH_LIMIT)] = DEFAULT_BATCH_LIMIT,
) -> WeeklyReminderRun:
    """Gửi email nhắc lên kế hoạch tuần tới; gọi lại nhiều lần trong tuần vẫn không gửi trùng."""
    if not get_settings().email_enabled:
        raise EmailNotConfiguredError("Chưa cấu hình dịch vụ gửi email nên không thể gửi nhắc.")
    return send_weekly_reminders(session, datetime.now(UTC), limit=limit)


UNSUBSCRIBE_PAGE_CSP = (
    "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; "
    "frame-ancestors 'none'"
)


def _unsubscribe_page(*, title: str, message: str, status_code: int) -> HTMLResponse:
    settings_url = f"{str(get_settings().frontend_url).rstrip('/')}/account/settings"
    html = (
        "<!doctype html><html lang='vi'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1'>"
        "<meta name='robots' content='noindex'>"
        f"<title>{escape(title)} | Bếp Việt</title></head>"
        '<body style="margin:0;background:#f5f0e8;color:#35251f;'
        'font-family:Arial,Helvetica,sans-serif">'
        "<main style='max-width:480px;margin:12vh auto;padding:32px 28px;background:#fff;"
        "border:1px solid #eadfd2;border-radius:18px;text-align:center'>"
        "<p style='margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:1.2px;"
        "color:#a74735'>BẾP VIỆT</p>"
        f"<h1 style='margin:0 0 12px;font-size:22px;color:#762b21'>{escape(title)}</h1>"
        f"<p style='margin:0 0 24px;line-height:1.65;color:#65574f'>{escape(message)}</p>"
        f"<a href='{escape(settings_url, quote=True)}' style='display:inline-block;"
        "padding:12px 24px;border-radius:999px;background:#b43b2c;color:#fff;"
        "font-weight:700;text-decoration:none'>Mở Cài đặt tài khoản</a>"
        "</main></body></html>"
    )
    return HTMLResponse(
        html,
        status_code=status_code,
        headers={
            "Content-Security-Policy": UNSUBSCRIBE_PAGE_CSP,
            "Referrer-Policy": "no-referrer",
            "Cache-Control": "no-store",
        },
    )


@router.api_route(
    UNSUBSCRIBE_PATH,
    methods=["GET", "POST"],
    response_class=HTMLResponse,
    include_in_schema=False,
)
def unsubscribe_weekly_reminder(session: DatabaseSession, token: str = "") -> HTMLResponse:
    """Hủy nhận email nhắc tuần chỉ với một lần bấm (GET từ email, POST theo RFC 8058)."""
    user_id = read_unsubscribe_token(token) if token else None
    if user_id is None or not unsubscribe_user(session, user_id):
        return _unsubscribe_page(
            title="Liên kết không hợp lệ",
            message=(
                "Liên kết hủy nhận email này không đúng hoặc tài khoản không còn tồn tại. "
                "Bạn có thể tắt “Nhắc kế hoạch tuần” trong Cài đặt tài khoản."
            ),
            status_code=status.HTTP_400_BAD_REQUEST,
        )
    return _unsubscribe_page(
        title="Đã hủy nhận email nhắc tuần",
        message=(
            "Bếp Việt sẽ không gửi email nhắc lên kế hoạch tuần mới cho bạn nữa. "
            "Bạn có thể bật lại bất cứ lúc nào trong Cài đặt tài khoản."
        ),
        status_code=status.HTTP_200_OK,
    )
