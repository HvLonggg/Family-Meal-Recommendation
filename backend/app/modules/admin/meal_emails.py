"""Gửi email gợi ý món ở nền để quản trị viên không phải chờ máy chủ email."""

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime, timedelta
from typing import Any
from uuid import UUID

from sqlalchemy import update
from sqlalchemy.engine import Connection, Engine
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.modules.auth import email as mail
from app.modules.support.models import AdminMealSuggestionEmail

logger = logging.getLogger("bep_viet.admin.meal_emails")

# Gmail cho phép vài kết nối SMTP song song; 4 luồng đủ nhanh mà không bị giới hạn.
MAX_PARALLEL_SENDS = 4
# Lâu hơn hạn chót gửi + các lần thử lại, để không đánh dấu nhầm email vẫn đang gửi.
STALE_SENDING_AFTER = timedelta(minutes=15)

# Hàng đợi riêng của tiến trình: phản hồi HTTP trả về ngay, không phụ thuộc middleware.
_executor = ThreadPoolExecutor(max_workers=MAX_PARALLEL_SENDS, thread_name_prefix="meal-email")


def _deliver_one(factory: sessionmaker[Session], delivery_id: UUID) -> None:
    # Đọc dữ liệu rồi trả kết nối ngay: không giữ kết nối cơ sở dữ liệu suốt lúc gửi email.
    with factory() as session:
        delivery = session.get(AdminMealSuggestionEmail, delivery_id)
        if delivery is None or delivery.status != "sending":
            return
        message: dict[str, Any] = {
            "recipient": delivery.recipient_email,
            "recipient_name": delivery.recipient_name,
            "meal_type": delivery.meal_type,
            "subject": delivery.subject,
            "intro_message": delivery.intro_message,
            "closing_message": delivery.closing_message,
            "recipes": delivery.recipe_data,
        }

    error: str | None = None
    try:
        mail.send_meal_suggestion_email(**message)
    except Exception as exc:
        error = mail.describe_delivery_error(exc)
        cause = exc.__cause__ or exc
        logger.warning(
            "Meal suggestion email failed (%s %s): %s",
            type(cause).__name__,
            getattr(cause, "smtp_code", ""),
            error,
        )

    with factory() as session:
        delivery = session.get(AdminMealSuggestionEmail, delivery_id)
        if delivery is None:
            return
        delivery.status = "failed" if error else "sent"
        delivery.error_message = error
        delivery.sent_at = None if error else datetime.now(UTC)
        session.commit()


def _safe_deliver(factory: sessionmaker[Session], delivery_id: UUID) -> None:
    try:
        _deliver_one(factory, delivery_id)
    except Exception:  # pragma: no cover - lỗi cơ sở dữ liệu ngoài dự kiến, chỉ ghi log
        logger.exception("Meal suggestion delivery crashed for %s", delivery_id)


def queue_meal_suggestions(bind: Engine | Connection, delivery_ids: list[UUID]) -> None:
    """Xếp hàng gửi các email đã tạo; mỗi email dùng phiên cơ sở dữ liệu riêng."""
    factory = sessionmaker(bind=bind, autoflush=False, expire_on_commit=False)
    if get_settings().app_env == "test":
        # Test cần kết quả xác định và SQLite không hỗ trợ ghi đồng thời: gửi lần lượt.
        for delivery_id in delivery_ids:
            _deliver_one(factory, delivery_id)
        return
    for delivery_id in delivery_ids:
        _executor.submit(_safe_deliver, factory, delivery_id)


def expire_stale_sending(session: Session) -> None:
    """Email kẹt ở trạng thái "đang gửi" (máy chủ khởi động lại giữa chừng) chuyển thành lỗi."""
    session.execute(
        update(AdminMealSuggestionEmail)
        .where(
            AdminMealSuggestionEmail.status == "sending",
            AdminMealSuggestionEmail.created_at < datetime.now(UTC) - STALE_SENDING_AFTER,
        )
        .values(
            status="failed",
            error_message="Email chưa gửi được: quá thời gian xử lý. Hãy thử gửi lại.",
        )
    )
    session.commit()
