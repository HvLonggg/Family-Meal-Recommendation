from fastapi.testclient import TestClient


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
