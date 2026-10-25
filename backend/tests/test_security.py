import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr, ValidationError

from app.core.config import Settings
from app.main import create_app
from tests.helpers import PASSWORD


def test_unexpected_errors_never_leak_internals() -> None:
    app = create_app()

    @app.get("/api/v1/_boom")
    def boom() -> None:
        raise RuntimeError("database password=<SECRET> at /srv/app/secret.py line 42")

    with TestClient(app, raise_server_exceptions=False) as client:
        response = client.get("/api/v1/_boom")
    assert response.status_code == 500
    body = response.json()
    assert body["code"] == "INTERNAL_ERROR"
    assert "SECRET" not in response.text and "Traceback" not in response.text
    assert "secret.py" not in response.text
    assert body["trace_id"] == response.headers["X-Request-ID"]


def test_security_headers_and_safe_request_ids(client: TestClient) -> None:
    response = client.get(
        "/api/v1/assistant/status", headers={"X-Request-ID": "x\r\nSet-Cookie: hacked=1"}
    )
    headers = response.headers
    assert headers["X-Content-Type-Options"] == "nosniff"
    assert headers["X-Frame-Options"] == "DENY"
    assert "frame-ancestors 'none'" in headers["Content-Security-Policy"]
    assert headers["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert "hacked" not in headers["X-Request-ID"] and len(headers["X-Request-ID"]) == 36

    kept = client.get("/api/v1/assistant/status", headers={"X-Request-ID": "trace-12345678"})
    assert kept.headers["X-Request-ID"] == "trace-12345678"


def test_oversized_requests_are_rejected_before_parsing(client: TestClient) -> None:
    response = client.post(
        "/api/v1/assistant/chat",
        content=b"{}",
        headers={"Content-Type": "application/json", "Content-Length": str(20 * 1024 * 1024)},
    )
    assert response.status_code == 413
    assert response.json()["code"] == "PAYLOAD_TOO_LARGE"


def test_api_docs_and_schema_are_hidden_outside_local_development() -> None:
    staging = Settings(app_env="staging", jwt_secret=SecretStr("s" * 48))
    assert staging.docs_enabled is False
    assert staging.secure_cookies is True
    assert Settings(app_env="development").docs_enabled is True
    with pytest.raises(ValidationError, match="32"):
        Settings(app_env="staging", jwt_secret=SecretStr("short"))


def test_unknown_routes_and_methods_do_not_reveal_details(client: TestClient) -> None:
    missing = client.get("/api/v1/does-not-exist")
    assert missing.status_code == 404
    assert missing.json()["message"] == "Không tìm thấy tài nguyên được yêu cầu."


def test_login_is_throttled_after_repeated_wrong_passwords(client: TestClient) -> None:
    created = client.post(
        "/api/v1/auth/register",
        json={"full_name": "Thử Khóa", "email": "brute@example.com", "password": PASSWORD},
    )
    assert created.status_code == 201
    for _ in range(5):
        wrong = client.post(
            "/api/v1/auth/login", json={"email": "brute@example.com", "password": "Sai-mat-khau-1"}
        )
        assert wrong.status_code == 401
        assert wrong.json()["message"] == "Thông tin đăng nhập chưa đúng."
    blocked = client.post(
        "/api/v1/auth/login", json={"email": "BRUTE@example.com", "password": PASSWORD}
    )
    assert blocked.status_code == 429
    assert blocked.json()["code"] == "LOGIN_RATE_LIMITED"
