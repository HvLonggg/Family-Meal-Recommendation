import pytest
from fastapi.testclient import TestClient

from app.core.config import get_settings


def test_liveness_returns_standard_response(client: TestClient) -> None:
    response = client.get("/api/v1/livez")

    assert response.status_code == 200
    assert response.json() == {"data": {"status": "ok", "service": "api"}}
    assert response.headers["X-Request-ID"]


def test_readiness_returns_ready(client: TestClient) -> None:
    response = client.get("/api/v1/readyz")

    assert response.status_code == 200
    assert response.json()["data"]["status"] == "ready"


def test_not_found_uses_vietnamese_error_contract(client: TestClient) -> None:
    response = client.get("/api/v1/khong-ton-tai")

    payload = response.json()
    assert response.status_code == 404
    assert payload["code"] == "RESOURCE_NOT_FOUND"
    assert payload["message"] == "Không tìm thấy tài nguyên được yêu cầu."
    assert payload["field_errors"] == {}
    assert payload["trace_id"] == response.headers["X-Request-ID"]


def test_status_reports_normal_operation(client: TestClient) -> None:
    response = client.get("/api/v1/status")

    assert response.status_code == 200
    assert response.json() == {"data": {"maintenance": False, "message": None, "ends_at": None}}
    assert response.headers["Cache-Control"] == "no-store"


def test_maintenance_blocks_api_but_keeps_status_open(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BEP_VIET_MAINTENANCE_MODE", "true")
    monkeypatch.setenv("BEP_VIET_MAINTENANCE_MESSAGE", "Nâng cấp kho món.")
    monkeypatch.setenv("BEP_VIET_MAINTENANCE_ENDS_AT", "2030-01-01T10:00:00+07:00")
    get_settings.cache_clear()
    try:
        blocked = client.get("/api/v1/recipes/catalog?limit=1")
        assert blocked.status_code == 503
        assert blocked.json()["code"] == "MAINTENANCE"
        assert blocked.json()["message"] == "Nâng cấp kho món."
        assert int(blocked.headers["Retry-After"]) >= 60

        status_response = client.get("/api/v1/status")
        assert status_response.status_code == 200
        assert status_response.json()["data"]["maintenance"] is True
        assert status_response.json()["data"]["message"] == "Nâng cấp kho món."
        assert client.get("/api/v1/livez").status_code == 200
    finally:
        monkeypatch.delenv("BEP_VIET_MAINTENANCE_MODE")
        get_settings.cache_clear()


def test_blank_maintenance_values_do_not_break_startup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEP_VIET_MAINTENANCE_MESSAGE", "")
    monkeypatch.setenv("BEP_VIET_MAINTENANCE_ENDS_AT", "")
    get_settings.cache_clear()
    try:
        settings = get_settings()
        assert settings.maintenance_message is None
        assert settings.maintenance_ends_at is None
    finally:
        get_settings.cache_clear()
