import base64
import json
from collections.abc import Callable
from email import message_from_bytes
from email.message import EmailMessage
from email.policy import default
from unittest.mock import MagicMock, patch

import httpx
import pytest

from app.core.config import get_settings
from app.modules.auth.email import (
    EMAIL_LOGO_CID,
    EmailDeliveryError,
    send_meal_suggestion_email,
    send_security_notification,
    send_support_reply_email,
    send_support_ticket_notification,
    send_verification_email,
)


def test_account_created_email_welcomes_user_and_mentions_support(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    deliveries: list[dict[str, str]] = []
    monkeypatch.setattr(
        auth_email,
        "_send_message",
        lambda **message: deliveries.append(message),
    )

    send_security_notification(recipient="lan@example.com", event="registration")

    assert len(deliveries) == 1
    delivery = deliveries[0]
    assert delivery["recipient"] == "lan@example.com"
    assert "Chào mừng bạn đến với Bếp Việt" in delivery["subject"]
    assert "được tạo thành công" in delivery["text"]
    assert "những bữa cơm ngon" in delivery["text"]
    assert "Bếp Việt" in delivery["html"]


def test_gmail_smtp_sends_an_otp_over_starttls(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PORT", "587")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_USERNAME", "hvlongg@gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PASSWORD", "abcdefghijklmnop")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "hvlongg@gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_USE_SSL", "false")
    monkeypatch.setenv("BEP_VIET_EMAIL_STARTTLS", "true")
    get_settings.cache_clear()

    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    smtp.send_message.return_value = {}
    try:
        with patch("app.modules.auth.email.smtplib.SMTP", return_value=smtp) as smtp_factory:
            send_verification_email(
                recipient="lan@example.com",
                code="04281",
                purpose="registration",
            )

        assert smtp_factory.call_args.args == ("smtp.gmail.com", 587)
        assert smtp.starttls.call_count == 1
        smtp.login.assert_called_once_with("hvlongg@gmail.com", "abcdefghijklmnop")
        message = smtp.send_message.call_args.args[0]
        assert message["From"] == "Bếp Việt <hvlongg@gmail.com>"
        assert message["To"] == "lan@example.com"
        assert "Bếp Việt" in message["Subject"]
        plain_body = message.get_body(preferencelist=("plain",)).get_content()
        assert "04281" in plain_body
        assert "5 phút" in plain_body
        assert "BẾP VIỆT" in plain_body
        assert "Hỗ trợ: hvlongg@gmail.com" in plain_body

        html_part = next(part for part in message.walk() if part.get_content_type() == "text/html")
        assert f"cid:{EMAIL_LOGO_CID}" in html_part.get_content()
        inline_logo = next(
            part for part in message.walk() if part.get_content_type() == "image/png"
        )
        assert inline_logo["Content-ID"] == f"<{EMAIL_LOGO_CID}>"
        assert inline_logo.get_content_disposition() == "inline"
        assert len(inline_logo.get_payload(decode=True) or b"") > 10_000
    finally:
        get_settings.cache_clear()


def test_support_notification_uses_the_branded_email_content(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    deliveries: list[dict[str, str]] = []
    monkeypatch.setattr(
        auth_email,
        "_send_message",
        lambda **message: deliveries.append(message),
    )

    send_support_ticket_notification(
        name="Hoàng Long",
        sender="customer@example.com",
        topic_id="recipe",
        subject="Không mở được công thức",
        body="Trang bị lỗi khi mở món.",
        created_at=None,
        reference="BV-TEST1234",
    )

    assert len(deliveries) == 1
    assert deliveries[0]["reply_to"] == "customer@example.com"
    assert "BV-TEST1234" in deliveries[0]["html"]
    assert "Yêu cầu hỗ trợ mới" in deliveries[0]["html"]


def test_support_reply_and_meal_suggestion_use_branded_safe_email(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(auth_email, "_send_message", lambda **message: deliveries.append(message))
    monkeypatch.setattr(
        auth_email,
        "_email_image_source",
        lambda path, index, **kwargs: (
            f"cid:meal-{index}",
            (f"meal-{index}", b"test-photo", "image/jpeg", path.rsplit("/", 1)[-1]),
        ),
    )

    send_support_reply_email(
        recipient="lan@example.com",
        recipient_name="Lan <script>",
        subject="Bếp Việt phản hồi",
        body="Cảm ơn bạn <script>alert(1)</script>",
        reference="BV-REPLY01",
    )
    send_meal_suggestion_email(
        recipient="lan@example.com",
        recipient_name="Lan <script>",
        meal_type="dinner",
        subject="Gợi ý bữa tối",
        intro_message="Bếp Việt gợi ý món cho bạn.",
        closing_message="Chúc bạn ngon miệng.",
        recipes=[
            {
                "slug": "bun-cha-ha-noi",
                "name": "Bún chả Hà Nội",
                "excerpt": "Thịt nướng thơm.",
                "image_path": "/images/recipes/bun-cha.jpg",
            }
        ],
    )

    assert len(deliveries) == 2
    reply = deliveries[0]
    assert reply["recipient"] == "lan@example.com"
    assert "&lt;script&gt;" in str(reply["html"])
    assert "<script>" not in str(reply["html"])

    suggestion = deliveries[1]
    assert suggestion["subject"] == "Gợi ý bữa tối"
    assert "Bếp Việt" in str(suggestion["html"])
    assert "1 món được đề xuất cho bữa tối ngon miệng tại nhà." in str(suggestion["html"])
    assert "chọn riêng" not in str(suggestion["html"])
    assert "background:#fff6e9" in str(suggestion["html"])
    assert "cid:meal-0" in str(suggestion["html"])
    assert "/recipes/bun-cha-ha-noi" in str(suggestion["html"])
    assert suggestion["inline_images"] == [("meal-0", b"test-photo", "image/jpeg", "bun-cha.jpg")]


def test_meal_plan_reminder_uses_a_formal_subject_and_planned_meal_copy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from datetime import date

    from app.modules.auth import email as auth_email

    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(auth_email, "_send_message", lambda **message: deliveries.append(message))
    monkeypatch.setattr(
        auth_email,
        "_email_image_source",
        lambda path, index, **kwargs: ("", None),
    )

    auth_email.send_meal_plan_reminder_email(
        recipient="lan@example.com",
        recipient_name="Lan",
        meal_type="dinner",
        plan_date=date(2026, 10, 19),
        recipes=[
            {
                "slug": "ca-chep-kho-rieng",
                "name": "Cá chép kho riềng",
                "excerpt": "Món cá kho đậm đà.",
                "image_path": "/images/ca-chep.webp",
            }
        ],
    )

    message = deliveries[0]
    assert message["subject"] == "Nhắc kế hoạch bữa tối ngày 19/10/2026 | Bếp Việt"
    assert "NHẮC LỊCH BỮA TỐI · BẾP VIỆT" in str(message["html"])
    assert "1 món đã có trong kế hoạch bữa tối ngày 19/10/2026." in str(message["html"])
    assert "được đề xuất" not in str(message["html"])
    assert "Bếp Việt xin nhắc bạn về thực đơn bữa tối" in str(message["text"])


def test_email_image_source_does_not_fetch_arbitrary_or_traversal_paths(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.modules.auth import email as auth_email

    monkeypatch.setattr(
        auth_email.httpx,
        "Client",
        lambda **kwargs: pytest.fail("unsafe recipe paths must not trigger an HTTP request"),
    )
    external, external_inline = auth_email._email_image_source("http://127.0.0.1/admin", 0)
    traversal, traversal_inline = auth_email._email_image_source("/images/../../secret", 1)

    assert external == "http://127.0.0.1/admin"
    assert external_inline is None
    assert traversal == ""
    assert traversal_inline is None


def test_smtp_refusal_is_not_reported_as_success(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_HOST", "smtp.gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_USERNAME", "hvlongg@gmail.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PASSWORD", "abcdefghijklmnop")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "hvlongg@gmail.com")
    get_settings.cache_clear()

    smtp = MagicMock()
    smtp.__enter__.return_value = smtp
    smtp.send_message.return_value = {"lan@example.com": (550, b"rejected")}
    try:
        with (
            patch("app.modules.auth.email.smtplib.SMTP", return_value=smtp),
            pytest.raises(EmailDeliveryError),
        ):
            send_verification_email(
                recipient="lan@example.com",
                code="04281",
                purpose="password_reset",
            )
    finally:
        get_settings.cache_clear()


def _configure_gmail_api(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.modules.auth import email as auth_email

    monkeypatch.setenv("BEP_VIET_EMAIL_PROVIDER", "gmail_api")
    monkeypatch.setenv("BEP_VIET_EMAIL_GMAIL_CLIENT_ID", "client-id.apps.googleusercontent.com")
    monkeypatch.setenv("BEP_VIET_EMAIL_GMAIL_CLIENT_SECRET", "client-secret")
    monkeypatch.setenv("BEP_VIET_EMAIL_GMAIL_REFRESH_TOKEN", "refresh-token")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "hvlongg@gmail.com")
    monkeypatch.setattr(auth_email, "_gmail_access_token", None)
    get_settings.cache_clear()


def _mock_google(
    monkeypatch: pytest.MonkeyPatch, handler: Callable[[httpx.Request], httpx.Response]
) -> None:
    from app.modules.auth import email as auth_email

    real_client = httpx.Client
    monkeypatch.setattr(
        auth_email.httpx,
        "Client",
        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs),
    )


def test_gmail_api_sends_an_otp_over_https(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_gmail_api(monkeypatch)
    requests: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "access-1", "expires_in": 3599})
        return httpx.Response(200, json={"id": "msg-1"})

    _mock_google(monkeypatch, handler)
    try:
        send_verification_email(recipient="lan@example.com", code="04281", purpose="registration")
        send_verification_email(recipient="minh@example.com", code="13579", purpose="registration")

        token_requests = [r for r in requests if r.url.host == "oauth2.googleapis.com"]
        send_requests = [r for r in requests if r.url.host == "gmail.googleapis.com"]
        assert len(token_requests) == 1, "access token should be cached between sends"
        assert b"grant_type=refresh_token" in token_requests[0].content
        assert len(send_requests) == 2
        assert send_requests[0].headers["Authorization"] == "Bearer access-1"

        raw = json.loads(send_requests[0].content)["raw"]
        message = message_from_bytes(base64.urlsafe_b64decode(raw), policy=default)
        assert isinstance(message, EmailMessage)
        assert message["From"] == "Bếp Việt <hvlongg@gmail.com>"
        assert message["To"] == "lan@example.com"
        plain_body = message.get_body(preferencelist=("plain",))
        assert plain_body is not None
        assert "04281" in plain_body.get_content()
    finally:
        get_settings.cache_clear()


def test_gmail_api_revoked_refresh_token_is_not_reported_as_success(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_gmail_api(monkeypatch)
    _mock_google(
        monkeypatch,
        lambda request: httpx.Response(400, json={"error": "invalid_grant"}),
    )
    try:
        with pytest.raises(EmailDeliveryError, match="invalid_grant"):
            send_verification_email(
                recipient="lan@example.com", code="04281", purpose="password_reset"
            )
    finally:
        get_settings.cache_clear()


def test_gmail_api_rejection_is_not_reported_as_success(monkeypatch: pytest.MonkeyPatch) -> None:
    _configure_gmail_api(monkeypatch)

    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.host == "oauth2.googleapis.com":
            return httpx.Response(200, json={"access_token": "access-1", "expires_in": 3599})
        return httpx.Response(403, json={"error": {"message": "Insufficient Permission"}})

    _mock_google(monkeypatch, handler)
    try:
        with pytest.raises(EmailDeliveryError, match="HTTP 403"):
            send_verification_email(
                recipient="lan@example.com", code="04281", purpose="registration"
            )
    finally:
        get_settings.cache_clear()
