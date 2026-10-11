import asyncio
import base64
import logging
import smtplib
import ssl
import threading
import time
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage
from html import escape
from uuid import UUID

import httpx
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.modules.auth.models import SecurityEmailOutbox

logger = logging.getLogger("bep_viet.auth.email")


class EmailDeliveryError(Exception):
    """Raised when the configured email service cannot accept a message."""


GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GMAIL_SEND_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send"

_gmail_token_lock = threading.Lock()
_gmail_access_token: tuple[str, float] | None = None


def _send_message(
    *, recipient: str, subject: str, text: str, html: str, reply_to: str | None = None
) -> None:
    settings = get_settings()
    if not settings.email_enabled:
        raise EmailDeliveryError("Email delivery credentials are not configured.")

    sender = settings.email_from_address
    assert sender is not None

    message = EmailMessage()
    message["Subject"] = subject
    message["From"] = f"{settings.email_from_name} <{sender}>"
    message["To"] = recipient
    if reply_to:
        message["Reply-To"] = reply_to
    message.set_content(text)
    message.add_alternative(html, subtype="html")

    if settings.email_provider == "gmail_api":
        _send_via_gmail_api(message)
    else:
        _send_via_smtp(message)


def _send_via_smtp(message: EmailMessage) -> None:
    settings = get_settings()
    host = settings.email_smtp_host
    username = settings.email_smtp_username
    password = settings.email_smtp_password
    assert host is not None and username is not None and password is not None

    context = ssl.create_default_context()
    try:
        smtp = (
            smtplib.SMTP_SSL(
                host,
                settings.email_smtp_port,
                timeout=settings.email_timeout_seconds,
                context=context,
            )
            if settings.email_use_ssl
            else smtplib.SMTP(
                host, settings.email_smtp_port, timeout=settings.email_timeout_seconds
            )
        )
        with smtp:
            if settings.email_starttls and not settings.email_use_ssl:
                smtp.starttls(context=context)
                smtp.ehlo()
            smtp.login(username, password.get_secret_value().replace(" ", ""))
            refused = smtp.send_message(message)
            if refused:
                raise EmailDeliveryError("SMTP refused the message.")
    except EmailDeliveryError:
        raise
    except (OSError, smtplib.SMTPException) as exc:
        raise EmailDeliveryError("SMTP delivery failed.") from exc


def _gmail_api_access_token(client: httpx.Client) -> str:
    """Exchange the long-lived refresh token for a short-lived access token, cached in memory."""
    global _gmail_access_token
    with _gmail_token_lock:
        if _gmail_access_token and _gmail_access_token[1] > time.monotonic():
            return _gmail_access_token[0]

        settings = get_settings()
        client_secret = settings.email_gmail_client_secret
        refresh_token = settings.email_gmail_refresh_token
        assert client_secret is not None and refresh_token is not None
        response = client.post(
            GOOGLE_TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": settings.email_gmail_client_id,
                "client_secret": client_secret.get_secret_value(),
                "refresh_token": refresh_token.get_secret_value(),
            },
        )
        if response.status_code != 200:
            # Google returns e.g. "invalid_grant" when the refresh token was revoked or expired.
            error = response.json().get("error", "unknown") if response.content else "unknown"
            raise EmailDeliveryError(f"Gmail OAuth token refresh failed: {error}.")
        payload = response.json()
        token = str(payload["access_token"])
        expires_in = int(payload.get("expires_in", 3600))
        _gmail_access_token = (token, time.monotonic() + max(expires_in - 60, 0))
        return token


def _send_via_gmail_api(message: EmailMessage) -> None:
    global _gmail_access_token
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("ascii")
    try:
        with httpx.Client(timeout=get_settings().email_timeout_seconds) as client:
            token = _gmail_api_access_token(client)
            response = client.post(
                GMAIL_SEND_URL,
                headers={"Authorization": f"Bearer {token}"},
                json={"raw": raw},
            )
            if response.status_code == 401:
                with _gmail_token_lock:
                    _gmail_access_token = None
            if response.status_code != 200:
                raise EmailDeliveryError(
                    f"Gmail API refused the message (HTTP {response.status_code})."
                )
    except EmailDeliveryError:
        raise
    except (httpx.HTTPError, ValueError, KeyError) as exc:
        raise EmailDeliveryError("Gmail API delivery failed.") from exc


def send_verification_email(*, recipient: str, code: str, purpose: str) -> None:
    settings = get_settings()
    purpose_text = "hoàn tất đăng ký" if purpose == "registration" else "đặt lại mật khẩu"
    safe_code = escape(code)
    safe_purpose = escape(purpose_text)
    validity = settings.email_otp_expire_minutes
    _send_message(
        recipient=recipient,
        subject="Mã xác thực tài khoản | Bếp Việt",
        text=(
            f"Mã xác thực Bếp Việt của bạn là {code}.\n"
            f"Mã dùng để {purpose_text}, có hiệu lực trong {validity} phút.\n"
            "Nếu bạn không yêu cầu mã này, hãy bỏ qua email. Không chia sẻ mã với bất kỳ ai."
        ),
        html=(
            "<div style='font-family:Arial,sans-serif;color:#33251f;max-width:520px'>"
            "<p>Bếp Việt nhận được yêu cầu xác thực tài khoản của bạn.</p>"
            f"<p style='font-size:30px;font-weight:700;letter-spacing:8px'>{safe_code}</p>"
            f"<p>Mã dùng để {safe_purpose}, có hiệu lực trong {validity} phút.</p>"
            "<p>Nếu bạn không yêu cầu mã này, hãy bỏ qua email. Không chia sẻ mã với bất kỳ ai.</p>"
            "</div>"
        ),
    )


def send_security_notification(*, recipient: str, event: str) -> None:
    messages = {
        "registration": (
            "Chào mừng bạn đến với Bếp Việt",
            "Tài khoản Bếp Việt của bạn đã được tạo thành công. Chúc bạn có trải nghiệm sử dụng "
            "tuyệt vời! Nếu gặp sự cố trong quá trình sử dụng, vui lòng liên hệ bộ phận hỗ trợ "
            "Bếp Việt.",
        ),
        "password_reset": (
            "Mật khẩu Bếp Việt đã được đặt lại",
            "Mật khẩu tài khoản Bếp Việt vừa được đặt lại qua email xác minh. "
            "Các phiên đăng nhập cũ đã bị thu hồi.",
        ),
        "password_change": (
            "Mật khẩu Bếp Việt đã thay đổi",
            "Mật khẩu tài khoản Bếp Việt vừa được thay đổi. Các phiên đăng nhập cũ đã bị thu hồi.",
        ),
    }
    message = messages.get(event)
    if message is None:
        raise EmailDeliveryError("Unknown security email event.")
    subject, body = message
    safe_body = escape(body)
    _send_message(
        recipient=recipient,
        subject=f"{subject} | Bếp Việt",
        text=(
            f"{body}\n"
            "Nếu bạn không thực hiện thao tác này, hãy đặt lại mật khẩu ngay và liên hệ "
            "bộ phận hỗ trợ Bếp Việt."
        ),
        html=(
            "<div style='font-family:Arial,sans-serif;color:#33251f;max-width:560px'>"
            "<h2 style='color:#9d3e2d'>Bếp Việt</h2>"
            f"<p>{safe_body}</p>"
            "<p>Nếu bạn không thực hiện thao tác này, hãy đặt lại mật khẩu ngay và liên hệ "
            "bộ phận hỗ trợ Bếp Việt.</p>"
            "</div>"
        ),
    )


def send_support_ticket_notification(
    *,
    name: str,
    sender: str,
    topic_id: str,
    subject: str,
    body: str,
    created_at: datetime | None,
    reference: str,
) -> None:
    """Deliver a submitted support request to the configured Bếp Việt inbox."""
    settings = get_settings()
    topic_labels = {
        "general": "Câu hỏi chung",
        "account": "Tài khoản và đăng nhập",
        "recipe": "Công thức và nội dung",
        "planner": "Kế hoạch bữa ăn",
        "bug": "Báo lỗi ứng dụng",
        "partnership": "Hợp tác",
    }
    topic = topic_labels.get(topic_id, "Yêu cầu hỗ trợ")
    created_text = created_at.isoformat() if created_at else "Vừa gửi"
    safe = {
        "reference": escape(reference),
        "name": escape(name),
        "email": escape(sender),
        "topic": escape(topic),
        "subject": escape(subject),
        "message": escape(body).replace("\n", "<br>"),
        "created_at": escape(created_text),
    }
    _send_message(
        recipient=settings.support_email,
        reply_to=sender,
        subject=f"[{reference}] {subject}",
        text=(
            f"YÊU CẦU HỖ TRỢ BẾP VIỆT · {reference}\n\n"
            f"Người gửi: {name} <{sender}>\nChủ đề: {topic}\nTiêu đề: {subject}\n"
            f"Thời gian: {created_text}\n\n{body}\n\n"
            "Bạn có thể trả lời trực tiếp email này để phản hồi người gửi."
        ),
        html=(
            "<div style='font-family:Arial,sans-serif;color:#35251f;"
            "max-width:640px;line-height:1.65'>"
            "<div style='padding:22px 26px;border-radius:18px 18px 0 0;"
            "background:#8f3025;color:#fff7ed'><strong style='font-size:20px'>Bếp Việt</strong>"
            "<div style='color:#f4c899'>Yêu cầu hỗ trợ mới</div></div>"
            "<div style='padding:24px;border:1px solid #eee3d7;border-top:0;"
            "border-radius:0 0 18px 18px'>"
            f"<p><strong>Mã yêu cầu:</strong> {safe['reference']}</p>"
            f"<p><strong>Người gửi:</strong> {safe['name']} &lt;{safe['email']}&gt;<br>"
            f"<strong>Chủ đề:</strong> {safe['topic']}<br>"
            f"<strong>Thời gian:</strong> {safe['created_at']}</p>"
            f"<p><strong>{safe['subject']}</strong></p>"
            f"<div style='padding:16px;border-radius:12px;background:#faf5ee'>"
            f"{safe['message']}</div>"
            "<p style='color:#75665d'>Trả lời email này để phản hồi trực tiếp người gửi.</p>"
            "</div></div>"
        ),
    )


def deliver_security_email(session: Session, outbox_id: UUID) -> bool:
    now = datetime.now(UTC)
    outbox = session.scalar(
        select(SecurityEmailOutbox)
        .where(
            SecurityEmailOutbox.id == outbox_id,
            SecurityEmailOutbox.sent_at.is_(None),
            SecurityEmailOutbox.next_attempt_at <= now,
        )
        .with_for_update(skip_locked=True)
    )
    if outbox is None:
        return False

    recipient, event = outbox.recipient, outbox.event
    # Claim before contacting SMTP so concurrent workers do not send the same event.
    outbox.next_attempt_at = now + timedelta(minutes=2)
    session.commit()
    try:
        send_security_notification(recipient=recipient, event=event)
    except EmailDeliveryError as exc:
        failed = session.get(SecurityEmailOutbox, outbox_id)
        if failed is not None and failed.sent_at is None:
            failed.attempts += 1
            retry_minutes = min(2 ** min(failed.attempts, 8), 360)
            failed.next_attempt_at = datetime.now(UTC) + timedelta(minutes=retry_minutes)
            session.commit()
        logger.warning("Security email delivery failed; retry scheduled (%s).", type(exc).__name__)
        return False

    delivered = session.get(SecurityEmailOutbox, outbox_id)
    if delivered is not None and delivered.sent_at is None:
        delivered.sent_at = datetime.now(UTC)
        session.commit()
    return True


def _dispatch_due_security_emails() -> None:
    from app.db.session import SessionLocal

    now = datetime.now(UTC)
    with SessionLocal() as session:
        outbox_ids = list(
            session.scalars(
                select(SecurityEmailOutbox.id)
                .where(
                    SecurityEmailOutbox.sent_at.is_(None),
                    SecurityEmailOutbox.next_attempt_at <= now,
                )
                .order_by(SecurityEmailOutbox.created_at)
                .limit(10)
            )
        )
    for outbox_id in outbox_ids:
        with SessionLocal() as session:
            try:
                deliver_security_email(session, outbox_id)
            except Exception as exc:  # Keep the worker alive for later retry cycles.
                session.rollback()
                logger.error("Security email worker failed (%s).", type(exc).__name__)


def deliver_support_ticket_email(session: Session, ticket_id: UUID) -> bool:
    from app.modules.support.models import SupportTicket
    from app.modules.support.service import ticket_reference

    now = datetime.now(UTC)
    ticket = session.scalar(
        select(SupportTicket)
        .where(
            SupportTicket.id == ticket_id,
            SupportTicket.notification_sent_at.is_(None),
            SupportTicket.notification_next_attempt_at <= now,
        )
        .with_for_update(skip_locked=True)
    )
    if ticket is None:
        return False

    ticket.notification_next_attempt_at = now + timedelta(minutes=2)
    session.commit()
    try:
        send_support_ticket_notification(
            name=ticket.name,
            sender=ticket.email,
            topic_id=ticket.topic,
            subject=ticket.subject,
            body=ticket.message,
            created_at=ticket.created_at,
            reference=ticket_reference(ticket.id),
        )
    except EmailDeliveryError as exc:
        failed = session.get(SupportTicket, ticket_id)
        if failed is not None and failed.notification_sent_at is None:
            failed.notification_attempts += 1
            retry_minutes = min(2 ** min(failed.notification_attempts, 8), 360)
            failed.notification_next_attempt_at = datetime.now(UTC) + timedelta(
                minutes=retry_minutes
            )
            session.commit()
        logger.warning(
            "Support email delivery failed; retry scheduled (%s).", type(exc).__name__
        )
        return False

    delivered = session.get(SupportTicket, ticket_id)
    if delivered is not None and delivered.notification_sent_at is None:
        delivered.notification_sent_at = datetime.now(UTC)
        session.commit()
    return True


def _dispatch_due_support_emails() -> None:
    from app.db.session import SessionLocal
    from app.modules.support.models import SupportTicket

    now = datetime.now(UTC)
    with SessionLocal() as session:
        ticket_ids = list(
            session.scalars(
                select(SupportTicket.id)
                .where(
                    SupportTicket.notification_sent_at.is_(None),
                    SupportTicket.notification_next_attempt_at <= now,
                )
                .order_by(SupportTicket.created_at)
                .limit(10)
            )
        )
    for ticket_id in ticket_ids:
        with SessionLocal() as session:
            try:
                deliver_support_ticket_email(session, ticket_id)
            except Exception as exc:
                session.rollback()
                logger.error("Support email worker failed (%s).", type(exc).__name__)


async def run_security_email_worker() -> None:
    while True:
        try:
            await asyncio.to_thread(_dispatch_due_security_emails)
            await asyncio.to_thread(_dispatch_due_support_emails)
        except Exception as exc:  # Keep the worker alive if a polling cycle fails.
            logger.error("Security email polling failed (%s).", type(exc).__name__)
        await asyncio.sleep(30)
