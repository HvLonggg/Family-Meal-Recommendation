import asyncio
import base64
import logging
import re
import smtplib
import ssl
import threading
import time
from datetime import UTC, date, datetime, timedelta
from email.message import EmailMessage
from html import escape
from pathlib import Path
from urllib.parse import urljoin
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
EMAIL_LOGO_CID = "bep-viet-logo"
EMAIL_LOGO_PATH = Path(__file__).resolve().parents[2] / "assets" / "bep-viet-email-logo.png"
DEFAULT_PREHEADER = "Thông tin mới từ Bếp Việt."
SAFE_SLUG = re.compile(r"[a-z0-9]+(?:-[a-z0-9]+)*")

_gmail_token_lock = threading.Lock()
_gmail_access_token: tuple[str, float] | None = None


def _send_message(
    *,
    recipient: str,
    subject: str,
    text: str,
    html: str,
    reply_to: str | None = None,
    inline_images: list[tuple[str, bytes, str, str]] | None = None,
    preheader: str = DEFAULT_PREHEADER,
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
    message.set_content(_branded_plain_text(text, settings.support_email))
    message.add_alternative(
        _branded_html(html, settings.support_email, preheader=preheader), subtype="html"
    )
    html_part = message.get_body(preferencelist=("html",))
    if html_part is None:
        raise EmailDeliveryError("Bếp Việt email template could not be prepared.")
    try:
        html_part.add_related(
            EMAIL_LOGO_PATH.read_bytes(),
            maintype="image",
            subtype="png",
            cid=f"<{EMAIL_LOGO_CID}>",
            disposition="inline",
        )
    except OSError as exc:
        raise EmailDeliveryError("Bếp Việt email logo is not available.") from exc
    for content_id, image_data, content_type, filename in inline_images or []:
        maintype, subtype = content_type.split("/", maxsplit=1)
        html_part.add_related(
            image_data,
            maintype=maintype,
            subtype=subtype,
            cid=f"<{content_id}>",
            filename=filename,
            disposition="inline",
        )

    if settings.email_provider == "gmail_api":
        _send_via_gmail_api(message)
    else:
        _send_via_smtp(message)


def _branded_plain_text(content: str, support_email: str) -> str:
    return (
        "BẾP VIỆT\nChọn món ngon, chăm bữa cơm nhà\n\n"
        f"{content.strip()}\n\n"
        "—\nEmail được gửi tự động bởi Bếp Việt.\n"
        f"Hỗ trợ: {support_email}"
    )


def _branded_html(content: str, support_email: str, preheader: str = DEFAULT_PREHEADER) -> str:
    safe_support_email = escape(support_email, quote=True)
    return (
        "<!doctype html><html lang='vi'><head><meta charset='utf-8'>"
        "<meta name='viewport' content='width=device-width,initial-scale=1.0'>"
        # Giữ bảng màu sáng: ứng dụng mail ở chế độ tối không tự đảo màu ảnh món và nền thẻ.
        "<meta name='color-scheme' content='light only'>"
        "<meta name='supported-color-schemes' content='light only'>"
        "<title>Bếp Việt</title></head>"
        "<body style='margin:0;padding:0;background:#f5f0e8;"
        "font-family:Arial,Helvetica,sans-serif;color:#35251f'>"
        "<div style='display:none;max-height:0;overflow:hidden;opacity:0'>"
        f"{escape(preheader)}</div>"
        "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' "
        "style='width:100%;background:#f5f0e8;border-collapse:collapse'>"
        "<tr><td align='center' style='padding:28px 14px'>"
        "<table role='presentation' width='600' cellspacing='0' cellpadding='0' "
        "style='width:100%;max-width:600px;background:#ffffff;border:1px solid #eadfd2;"
        "border-radius:18px;border-collapse:separate;overflow:hidden'>"
        "<tr><td style='padding:20px 26px;background:#fffaf3;border-bottom:1px solid #eee3d7'>"
        "<table role='presentation' cellspacing='0' cellpadding='0' "
        "style='border-collapse:collapse'>"
        "<tr><td valign='middle' style='padding-right:16px'>"
        f"<img src='cid:{EMAIL_LOGO_CID}' width='76' height='76' alt='Logo Bếp Việt' "
        "style='display:block;width:76px;height:76px;object-fit:contain;border:0'>"
        "</td><td valign='middle'>"
        "<div style='font-size:22px;font-weight:700;letter-spacing:.3px;color:#762b21'>"
        "Bếp Việt</div>"
        "<div style='margin-top:5px;font-size:13px;line-height:1.5;color:#76675d'>"
        "Chọn món ngon, chăm bữa cơm nhà</div>"
        "</td></tr></table></td></tr>"
        f"<tr><td style='padding:30px 28px 28px;line-height:1.7;font-size:15px'>{content}</td></tr>"
        "<tr><td style='padding:18px 28px;background:#fbf8f3;border-top:1px solid #eee3d7;"
        "font-size:12px;line-height:1.7;color:#76675d'>"
        "Email được gửi tự động bởi Bếp Việt. Nếu cần hỗ trợ, hãy liên hệ "
        f"<a href='mailto:{safe_support_email}' style='color:#9d3e2d;text-decoration:none'>"
        f"{safe_support_email}</a>."
        "</td></tr></table></td></tr></table></body></html>"
    )


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
    purpose_text = {
        "registration": "hoàn tất đăng ký",
        "email_change": "xác nhận email mới cho tài khoản",
    }.get(purpose, "đặt lại mật khẩu")
    safe_code = escape(code)
    safe_purpose = escape(purpose_text)
    validity = settings.email_otp_expire_minutes
    _send_message(
        recipient=recipient,
        subject="Mã xác thực tài khoản | Bếp Việt",
        text=(
            f"Mã xác thực của bạn: {code}\n"
            f"Mã dùng để {purpose_text}, có hiệu lực trong {validity} phút.\n"
            "Mỗi mã chỉ sử dụng một lần. Nếu bạn không yêu cầu mã này, hãy bỏ qua email. "
            "Không chia sẻ mã với bất kỳ ai."
        ),
        html=(
            "<p style='margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.2px;"
            "color:#a74735'>XÁC THỰC TÀI KHOẢN</p>"
            "<h1 style='margin:0 0 14px;font-size:25px;line-height:1.3;color:#35251f'>"
            "Mã xác thực của bạn</h1>"
            "<p style='margin:0 0 20px;color:#65574f'>"
            f"Bếp Việt nhận được yêu cầu để {safe_purpose}.</p>"
            "<div style='padding:18px 20px;text-align:center;border:1px solid #f0dfcf;"
            "border-radius:14px;background:#fffaf3'>"
            "<span style='font-size:32px;font-weight:700;letter-spacing:10px;color:#8f3025'>"
            f"{safe_code}</span>"
            "</div>"
            f"<p style='margin:18px 0 8px;color:#65574f'>Mã có hiệu lực trong "
            f"<strong>{validity} phút</strong> và chỉ sử dụng một lần.</p>"
            "<p style='margin:0;padding:13px 15px;border-radius:10px;background:#f7f3ed;"
            "font-size:13px;color:#76675d'>Nếu bạn không yêu cầu mã này, hãy bỏ qua email. "
            "Vì an toàn, Bếp Việt sẽ không bao giờ yêu cầu bạn chia sẻ mã xác thực.</p>"
        ),
    )


def send_security_notification(*, recipient: str, event: str) -> None:
    messages = {
        "registration": (
            "Chào mừng bạn đến với Bếp Việt",
            "Tài khoản Bếp Việt của bạn đã được tạo thành công. Chúc bạn có những bữa cơm ngon "
            "và trải nghiệm thật hữu ích cùng Bếp Việt.",
            None,
        ),
        "password_reset": (
            "Mật khẩu Bếp Việt đã được đặt lại",
            "Mật khẩu tài khoản Bếp Việt vừa được đặt lại sau khi xác minh email. "
            "Các phiên đăng nhập cũ đã được đăng xuất để bảo vệ tài khoản.",
            "Nếu bạn không thực hiện thao tác này, hãy đặt lại mật khẩu ngay "
            "và liên hệ bộ phận hỗ trợ.",
        ),
        "email_change": (
            "Email đăng nhập Bếp Việt đã thay đổi",
            "Email đăng nhập tài khoản Bếp Việt vừa được đổi sang một địa chỉ mới sau khi "
            "xác minh mã. Từ nay bạn sẽ đăng nhập và nhận thông báo bằng email mới.",
            "Nếu bạn không thực hiện thao tác này, hãy liên hệ bộ phận hỗ trợ ngay "
            "để khôi phục tài khoản.",
        ),
        "password_change": (
            "Mật khẩu Bếp Việt đã thay đổi",
            "Mật khẩu tài khoản Bếp Việt vừa được thay đổi. Các phiên đăng nhập cũ đã được "
            "đăng xuất để bảo vệ tài khoản.",
            "Nếu bạn không thực hiện thao tác này, hãy đặt lại mật khẩu ngay "
            "và liên hệ bộ phận hỗ trợ.",
        ),
    }
    message = messages.get(event)
    if message is None:
        raise EmailDeliveryError("Unknown security email event.")
    subject, body, security_notice = message
    safe_body = escape(body)
    safe_security_notice = escape(security_notice) if security_notice else None
    plain_text = f"{body}\n"
    if security_notice:
        plain_text += f"\n{security_notice}\n"
    _send_message(
        recipient=recipient,
        subject=f"{subject} | Bếp Việt",
        text=plain_text,
        html=(
            "<p style='margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.2px;"
            "color:#a74735'>THÔNG BÁO TÀI KHOẢN</p>"
            "<h1 style='margin:0 0 14px;font-size:25px;line-height:1.3;color:#35251f'>"
            f"{escape(subject)}</h1>"
            f"<p style='margin:0;color:#65574f'>{safe_body}</p>"
            + (
                f"<p style='margin:20px 0 0;padding:14px 16px;border-radius:10px;"
                f"background:#fff5ed;color:#82402f'>{safe_security_notice}</p>"
                if safe_security_notice
                else ""
            )
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
            "<p style='margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.2px;"
            "color:#a74735'>HỘP THƯ HỖ TRỢ</p>"
            "<h1 style='margin:0 0 18px;font-size:25px;line-height:1.3;color:#35251f'>"
            "Yêu cầu hỗ trợ mới</h1>"
            "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' "
            "style='width:100%;border-collapse:collapse;font-size:14px'>"
            f"<tr><td style='padding:7px 0;color:#76675d'>Mã yêu cầu</td>"
            "<td align='right' style='padding:7px 0;font-weight:700;color:#35251f'>"
            f"{safe['reference']}</td></tr>"
            f"<tr><td style='padding:7px 0;color:#76675d'>Người gửi</td>"
            "<td align='right' style='padding:7px 0;color:#35251f'>"
            f"{safe['name']} &lt;{safe['email']}&gt;</td></tr>"
            f"<tr><td style='padding:7px 0;color:#76675d'>Chủ đề</td>"
            f"<td align='right' style='padding:7px 0;color:#35251f'>{safe['topic']}</td></tr>"
            f"<tr><td style='padding:7px 0;color:#76675d'>Thời gian</td>"
            f"<td align='right' style='padding:7px 0;color:#35251f'>{safe['created_at']}</td></tr>"
            "</table>"
            f"<h2 style='margin:22px 0 10px;font-size:18px;color:#35251f'>{safe['subject']}</h2>"
            f"<div style='padding:16px;border:1px solid #eee3d7;border-radius:12px;"
            f"background:#fffaf3;line-height:1.7'>{safe['message']}</div>"
            "<p style='margin:18px 0 0;font-size:13px;color:#76675d'>"
            "Bạn có thể trả lời trực tiếp email này để phản hồi người gửi.</p>"
        ),
    )


def send_support_reply_email(
    *, recipient: str, recipient_name: str, subject: str, body: str, reference: str
) -> None:
    settings = get_settings()
    safe_name = escape(recipient_name)
    safe_reference = escape(reference)
    safe_subject = escape(subject)
    safe_body = escape(body).replace("\n", "<br>")
    support_email = settings.support_email
    _send_message(
        recipient=recipient,
        reply_to=support_email,
        subject=subject,
        text=f"Chào {recipient_name},\n\n{body}\n\nBếp Việt · {reference}",
        html=(
            "<p style='margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:1.2px;"
            "color:#a74735'>PHẢN HỒI HỖ TRỢ</p>"
            f"<h1 style='margin:0 0 12px;font-size:24px;color:#35251f'>{safe_subject}</h1>"
            f"<p style='margin:0 0 18px;color:#65574f'>Chào {safe_name},</p>"
            f"<div style='line-height:1.75;color:#49382f'>{safe_body}</div>"
            f"<p style='margin:24px 0 0;color:#76675d;font-size:13px'>Mã yêu cầu: "
            f"<strong>{safe_reference}</strong></p>"
        ),
    )


def _fetch_public_image(normalized_path: str, max_bytes: int) -> tuple[bytes, str] | None:
    """Tải một ảnh tĩnh của chính Bếp Việt; đường dẫn đã được kiểm tra ở nơi gọi."""
    settings = get_settings()
    public_base = str(settings.frontend_url).rstrip("/")
    asset_base = (settings.email_asset_base_url or public_base).rstrip("/")
    asset_url = urljoin(f"{asset_base}/", normalized_path.lstrip("/"))
    try:
        with httpx.Client(timeout=min(settings.email_timeout_seconds, 6)) as client:
            response = client.get(asset_url)
            response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return None
    content_type = response.headers.get("content-type", "").split(";", maxsplit=1)[0]
    if not content_type.startswith("image/") or len(response.content) > max_bytes:
        return None
    return response.content, content_type


def _email_image_source(
    image_path: str,
    image_index: int,
    remaining_bytes: int = 16_000_000,
    slug: str | None = None,
) -> tuple[str, tuple[str, bytes, str, str] | None]:
    settings = get_settings()
    public_base = str(settings.frontend_url).rstrip("/")
    # Recipe image paths come from our catalog. Never fetch arbitrary absolute URLs
    # from the backend: that would turn an admin email into an SSRF primitive.
    remote_image = image_path.startswith(("https://", "http://"))
    normalized_path = "" if remote_image else image_path.replace("\\", "/")
    if not remote_image and (
        normalized_path.startswith("//")
        or any(segment == ".." for segment in normalized_path.split("/"))
    ):
        return "", None
    if normalized_path and not normalized_path.startswith("/"):
        normalized_path = f"/{normalized_path}"
    public_url = image_path if remote_image else f"{public_base}{normalized_path}"
    if remaining_bytes <= 0:
        return public_url, None
    content_id = f"bep-viet-meal-{image_index}"

    # Ưu tiên ảnh tách nền; đổi WebP alpha sang PNG để email hiển thị ổn định.
    if slug and SAFE_SLUG.fullmatch(slug):
        cutout_paths = [f"/images/recipes/edited/{slug}-1600.webp"]
        if normalized_path.startswith("/images/recipes/edited/") and normalized_path.endswith(
            ".webp"
        ):
            cutout_paths.append(normalized_path)
        for cutout_path in dict.fromkeys(cutout_paths):
            cutout = _fetch_public_image(cutout_path, 8_000_000)
            if cutout is None:
                continue
            try:
                from PIL import Image

                from app.modules.auth.email_images import compose_dish_cutout
            except ImportError:
                # Pillow chưa cài: gửi ảnh WebP tách nền gốc.
                return f"cid:{content_id}", (
                    content_id,
                    cutout[0],
                    "image/webp",
                    f"{slug}.webp",
                )
            try:
                dish_png = compose_dish_cutout(cutout[0], max_bytes=remaining_bytes)
            except (OSError, ValueError, Image.DecompressionBombError):
                logger.warning("Không tối ưu được ảnh tách nền cho email món %s", slug)
                # Giữ ảnh tách nền nếu không tối ưu được; không dùng ảnh có nền.
                return f"{public_base}{cutout_path}", None
            return f"cid:{content_id}", (content_id, dish_png, "image/png", f"{slug}.png")

    if remote_image:
        return image_path, None
    if not normalized_path:
        return "", None
    original = _fetch_public_image(normalized_path, min(8_000_000, remaining_bytes))
    if original is None:
        return public_url, None
    filename = Path(normalized_path).name or f"mon-an-{image_index}"
    return f"cid:{content_id}", (content_id, original[0], original[1], filename)


def _email_button(url: str, label: str) -> str:
    """Nút “bulletproof”: bảng có nền màu nên vẫn hiện như nút trên Outlook."""
    return (
        "<table role='presentation' cellspacing='0' cellpadding='0' "
        "style='border-collapse:separate'><tr>"
        "<td bgcolor='#b43b2c' style='border-radius:999px;background:#b43b2c'>"
        f"<a href='{escape(url, quote=True)}' style='display:inline-block;padding:12px 24px;"
        "font-size:14px;font-weight:700;line-height:1;color:#ffffff;text-decoration:none;"
        f"border-radius:999px'>{escape(label)}</a></td></tr></table>"
    )


def send_meal_suggestion_email(
    *,
    recipient: str,
    recipient_name: str,
    meal_type: str,
    subject: str,
    intro_message: str,
    closing_message: str,
    recipes: list[dict[str, str]],
    plan_date: date | None = None,
) -> None:
    meal_label = "bữa trưa" if meal_type == "lunch" else "bữa tối"
    greeting_name = recipient_name.strip() or "bạn"
    safe_name = escape(greeting_name)
    safe_intro = escape(intro_message).replace("\n", "<br>")
    safe_closing = escape(closing_message).replace("\n", "<br>")
    settings = get_settings()
    site_base = str(settings.frontend_url).rstrip("/")
    inline_images: list[tuple[str, bytes, str, str]] = []
    inline_bytes = 0
    text_cards: list[str] = []
    html_cards: list[str] = []
    title_font = "Georgia,'Times New Roman',serif"

    for index, recipe in enumerate(recipes):
        slug = recipe["slug"]
        name = recipe["name"]
        excerpt = recipe.get("excerpt", "")
        recipe_url = f"{site_base}/recipes/{slug}"
        image_source, inline_image = _email_image_source(
            recipe["image_path"], index, remaining_bytes=16_000_000 - inline_bytes, slug=slug
        )
        if inline_image is not None:
            inline_images.append(inline_image)
            inline_bytes += len(inline_image[1])
        text_cards.append(f"{index + 1}. {name}\n{excerpt}\nXem công thức: {recipe_url}")
        safe_url = escape(recipe_url, quote=True)
        image_row = (
            "<tr><td bgcolor='#fbf8f3' style='padding:8px 16px 0;background:#fbf8f3;"
            "line-height:0;text-align:center'>"
            f"<a href='{safe_url}' style='display:block;text-decoration:none'>"
            f"<img src='{escape(image_source, quote=True)}' alt='{escape(name, quote=True)}' "
            "width='544' style='display:block;width:100%;max-width:544px;height:auto;margin:0 auto;"
            "border:0;outline:none'></a></td></tr>"
            if image_source
            else ""
        )
        html_cards.append(
            "<tr><td style='padding:0 0 22px'>"
            "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' "
            "style='width:100%;border:1px solid #ecdccb;border-radius:18px;overflow:hidden;"
            "border-collapse:separate;background:#ffffff;"
            "box-shadow:0 10px 26px rgba(74,47,27,0.08)'>"
            f"{image_row}"
            "<tr><td style='padding:20px 22px 22px'>"
            "<div style='margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:1.4px;"
            f"color:#b7791f'>MÓN {index + 1} / {len(recipes)}</div>"
            f"<h2 style='margin:0 0 8px;font-family:{title_font};font-size:23px;"
            f"font-weight:700;line-height:1.3;color:#2f2320'>{escape(name)}</h2>"
            f"<p style='margin:0 0 18px;font-size:14px;color:#6b5b51;line-height:1.65'>"
            f"{escape(excerpt)}</p>"
            f"{_email_button(recipe_url, 'Xem công thức')}"
            "</td></tr></table></td></tr>"
        )

    dish_names = ", ".join(recipe["name"] for recipe in recipes)
    if plan_date is None:
        hero_message = f"{len(recipes)} món được đề xuất cho {meal_label} ngon miệng tại nhà."
        hero_label = f"GỢI Ý {meal_label.upper()} · BẾP VIỆT"
    else:
        formatted_plan_date = plan_date.strftime("%d/%m/%Y")
        hero_message = (
            f"{len(recipes)} món đã có trong kế hoạch {meal_label} ngày {formatted_plan_date}."
        )
        hero_label = f"NHẮC LỊCH {meal_label.upper()} · BẾP VIỆT"
    text = (
        f"Chào {greeting_name},\n\n{intro_message}\n\n"
        f"{hero_message}\n\n"
        + "\n\n".join(text_cards)
        + (f"\n\n{closing_message}" if closing_message else "")
        + "\n\nThân mến,\nĐội ngũ Bếp Việt"
    )
    html = (
        "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' "
        "style='width:100%;border-collapse:separate;margin:0 0 24px;border-radius:18px;"
        "background:#fff6e9;border:1px solid #ead8c4'>"
        "<tr><td style='padding:24px 24px 22px'>"
        "<div style='font-size:11px;font-weight:700;letter-spacing:1.6px;color:#a74735'>"
        f"{hero_label}</div>"
        f"<h1 style='margin:10px 0 6px;font-family:{title_font};font-size:28px;"
        f"font-weight:700;line-height:1.25;color:#762b21'>Chào {safe_name},</h1>"
        "<p style='margin:0;font-size:14px;line-height:1.6;color:#65574f'>"
        f"{escape(hero_message)}</p>"
        "</td></tr></table>"
        f"<p style='margin:0 0 24px;color:#49382f;font-size:15px;line-height:1.75'>{safe_intro}</p>"
        "<table role='presentation' width='100%' cellspacing='0' cellpadding='0' "
        "style='width:100%;border-collapse:collapse'>"
        + "".join(html_cards)
        + "</table>"
        + (
            f"<p style='margin:4px 0 0;color:#49382f;font-size:15px;line-height:1.75'>"
            f"{safe_closing}</p>"
            if safe_closing
            else ""
        )
        + "<p style='margin:20px 0 0;color:#6b5b51;font-size:14px;line-height:1.6'>Thân mến,<br>"
        f"<strong style='font-family:{title_font};color:#762b21'>Đội ngũ Bếp Việt</strong></p>"
    )
    _send_message(
        recipient=recipient,
        subject=subject,
        text=text,
        html=html,
        inline_images=inline_images,
        preheader=f"{hero_message} {dish_names}"[:140],
    )


def send_meal_plan_reminder_email(
    *,
    recipient: str,
    recipient_name: str,
    meal_type: str,
    plan_date: date,
    recipes: list[dict[str, str]],
) -> None:
    meal_label = "bữa trưa" if meal_type == "lunch" else "bữa tối"
    formatted_plan_date = plan_date.strftime("%d/%m/%Y")
    send_meal_suggestion_email(
        recipient=recipient,
        recipient_name=recipient_name,
        meal_type=meal_type,
        subject=f"Nhắc kế hoạch {meal_label} ngày {formatted_plan_date} | Bếp Việt",
        intro_message=(
            f"Bếp Việt xin nhắc bạn về thực đơn {meal_label} ngày {formatted_plan_date}. "
            "Đây là những món bạn đã thêm vào kế hoạch của mình:"
        ),
        closing_message="Chúc bạn chuẩn bị bữa cơm thật vui và ngon miệng cùng gia đình.",
        recipes=recipes,
        plan_date=plan_date,
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
        logger.warning("Support email delivery failed; retry scheduled (%s).", type(exc).__name__)
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
