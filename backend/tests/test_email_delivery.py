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
    EmailDeliveryError,
    send_security_notification,
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
    assert "trải nghiệm sử dụng tuyệt vời" in delivery["text"]
    assert "liên hệ bộ phận hỗ trợ Bếp Việt" in delivery["text"]


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
    finally:
        get_settings.cache_clear()


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
