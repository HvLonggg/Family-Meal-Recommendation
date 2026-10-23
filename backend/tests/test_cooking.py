import hashlib
import hmac
import struct
import uuid
from datetime import UTC, date, datetime, timedelta
from typing import Any

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import get_settings
from app.modules.cooking import service, webpush
from app.modules.cooking.models import UserCookTimer, UserPushSubscription
from tests.helpers import register_and_login
from tests.test_planner import seed_planner_recipes

API = "/api/v1"
FCM = "https://fcm.googleapis.com/fcm/send/abc123"


def _plan(client: TestClient, headers: dict[str, str], slug: str, meal: str = "dinner") -> str:
    response = client.post(
        f"{API}/planner/items",
        json={"recipe_slug": slug, "plan_date": date.today().isoformat(), "meal_type": meal},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


def _items(client: TestClient, headers: dict[str, str]) -> dict[str, str]:
    today = date.today().isoformat()
    response = client.get(
        f"{API}/planner/items", params={"from": today, "to": today}, headers=headers
    )
    assert response.status_code == 200, response.text
    return {item["id"]: item["completion_status"] for item in response.json()}


def test_manual_cook_log_history_and_summary(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_planner_recipes(database_session_factory)
    headers = register_and_login(client, "cook@example.com")

    created = client.post(
        f"{API}/cooking/logs",
        json={"recipe_slug": "canh-chua-ca", "note": "  bớt me  "},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    log = created.json()
    assert log["recipe_name"] == "Canh chua cá"
    assert log["servings"] == 2 and log["source"] == "manual" and log["note"] == "bớt me"

    # Bấm lặp lại ngay không tạo thêm lần nấu.
    again = client.post(
        f"{API}/cooking/logs", json={"recipe_slug": "canh-chua-ca"}, headers=headers
    )
    assert again.json()["id"] == log["id"]

    client.post(
        f"{API}/cooking/logs",
        json={"recipe_slug": "bun-cha-ha-noi", "source": "cook_mode", "duration_seconds": 1500},
        headers=headers,
    )
    history = client.get(f"{API}/cooking/logs", headers=headers).json()
    assert history["total"] == 2
    assert history["data"][0]["recipe_slug"] == "bun-cha-ha-noi"
    assert history["stats"] == {"total": 2, "dishes": 2, "last_7_days": 2, "total_minutes": 25}

    summary = client.get(f"{API}/cooking/recipes/canh-chua-ca", headers=headers).json()
    assert summary["count"] == 1 and summary["last_log_id"] == log["id"]

    # Người khác không thấy và không xóa được lịch sử của mình.
    other = register_and_login(client, "other-cook@example.com")
    assert client.get(f"{API}/cooking/logs", headers=other).json()["total"] == 0
    assert client.delete(f"{API}/cooking/logs/{log['id']}", headers=other).status_code == 404

    assert client.delete(f"{API}/cooking/logs/{log['id']}", headers=headers).status_code == 204
    assert client.get(f"{API}/cooking/recipes/canh-chua-ca", headers=headers).json()["count"] == 0
    missing = client.post(f"{API}/cooking/logs", json={"recipe_slug": "khong-co"}, headers=headers)
    assert missing.status_code == 404


def test_planned_dish_marked_cooked_updates_plan_and_meal_status(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_planner_recipes(database_session_factory)
    headers = register_and_login(client, "planner-cook@example.com")
    soup = _plan(client, headers, "canh-chua-ca")
    noodles = _plan(client, headers, "bun-cha-ha-noi")

    mismatch = client.post(
        f"{API}/cooking/logs",
        json={"recipe_slug": "bun-cha-ha-noi", "plan_item_id": soup},
        headers=headers,
    )
    assert mismatch.status_code == 422

    log = client.post(
        f"{API}/cooking/logs",
        json={"recipe_slug": "canh-chua-ca", "plan_item_id": soup},
        headers=headers,
    ).json()
    assert log["source"] == "planner" and log["plan_item_id"] == soup
    assert _items(client, headers) == {soup: "completed", noodles: "planned"}

    # Ghi lại cùng món kế hoạch (ví dụ khi hoàn tất chế độ vào bếp) chỉ cập nhật thời lượng.
    repeat = client.post(
        f"{API}/cooking/logs",
        json={
            "recipe_slug": "canh-chua-ca",
            "plan_item_id": soup,
            "source": "cook_mode",
            "duration_seconds": 600,
        },
        headers=headers,
    ).json()
    assert repeat["id"] == log["id"] and repeat["duration_seconds"] == 600

    today = date.today().isoformat()
    meals = client.get(
        f"{API}/planner/history/meals", params={"through": today}, headers=headers
    ).json()
    assert meals["data"][0]["completion_status"] == "planned"  # mới nấu một trong hai món

    client.post(
        f"{API}/cooking/logs",
        json={"recipe_slug": "bun-cha-ha-noi", "plan_item_id": noodles, "source": "cook_mode"},
        headers=headers,
    )
    meals = client.get(
        f"{API}/planner/history/meals", params={"through": today}, headers=headers
    ).json()
    assert meals["data"][0]["completion_status"] == "completed"

    unmarked = client.delete(f"{API}/cooking/plan-items/{soup}", headers=headers)
    assert unmarked.status_code == 200 and unmarked.json()["completion_status"] == "planned"
    assert client.get(f"{API}/cooking/logs", headers=headers).json()["total"] == 1

    # Xóa lần nấu trong lịch sử cũng mở lại món trong kế hoạch.
    noodle_log = client.get(f"{API}/cooking/logs", headers=headers).json()["data"][0]
    client.delete(f"{API}/cooking/logs/{noodle_log['id']}", headers=headers)
    assert _items(client, headers) == {soup: "planned", noodles: "planned"}

    events = client.get(f"{API}/planner/history", headers=headers).json()["data"]
    assert {event["action"] for event in events} >= {"completed", "reopened"}

    other = register_and_login(client, "intruder@example.com")
    stolen = client.post(
        f"{API}/cooking/logs",
        json={"recipe_slug": "canh-chua-ca", "plan_item_id": soup},
        headers=other,
    )
    assert stolen.status_code == 404
    assert client.delete(f"{API}/cooking/plan-items/{soup}", headers=other).status_code == 404


def test_timers_start_snooze_and_finish(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_planner_recipes(database_session_factory)
    headers = register_and_login(client, "timer@example.com")
    timer_id = str(uuid.uuid4())
    payload = {
        "id": timer_id,
        "label": "Hầm xương",
        "recipe_slug": "canh-chua-ca",
        "seconds": 1800,
        "return_path": "/cook?dish=canh-chua-ca",
    }
    started = client.put(f"{API}/cooking/timers", json=payload, headers=headers)
    assert started.status_code == 200, started.text
    timer = started.json()
    due = datetime.fromisoformat(timer["due_at"]).replace(tzinfo=UTC)
    started_at = datetime.fromisoformat(timer["started_at"]).replace(tzinfo=UTC)
    assert timedelta(seconds=1795) <= due - started_at <= timedelta(seconds=1805)
    assert [item["id"] for item in client.get(f"{API}/cooking/timers", headers=headers).json()] == [
        timer_id
    ]

    for bad_path in ("https://evil.example", "//evil.example", "/account"):
        rejected = client.put(
            f"{API}/cooking/timers", json={**payload, "return_path": bad_path}, headers=headers
        )
        assert rejected.status_code == 422

    snoozed = client.patch(
        f"{API}/cooking/timers/{timer_id}",
        json={"action": "snooze", "seconds": 300},
        headers=headers,
    ).json()
    assert snoozed["status"] == "running"
    # "Đổi thành 3 tiếng": chỉnh thời gian còn lại tới tối đa 24 giờ như khi đặt chuông.
    for seconds, status in ((3 * 3600, 200), (86_400, 200), (86_401, 422), (4, 422)):
        adjusted = client.patch(
            f"{API}/cooking/timers/{timer_id}",
            json={"action": "snooze", "seconds": seconds},
            headers=headers,
        )
        assert adjusted.status_code == status, adjusted.text

    other = register_and_login(client, "timer-other@example.com")
    assert (
        client.patch(
            f"{API}/cooking/timers/{timer_id}", json={"action": "done"}, headers=other
        ).status_code
        == 404
    )
    # Không chiếm được id chuông của người khác.
    assert client.put(f"{API}/cooking/timers", json=payload, headers=other).status_code == 409

    # Giới hạn số chuông đang chạy để không bị lạm dụng gửi thông báo hàng loạt.
    monkeypatch.setattr(service, "MAX_ACTIVE_TIMERS", 1)
    flood = client.put(
        f"{API}/cooking/timers", json={**payload, "id": str(uuid.uuid4())}, headers=headers
    )
    assert flood.status_code == 429

    done = client.patch(
        f"{API}/cooking/timers/{timer_id}", json={"action": "done"}, headers=headers
    )
    assert done.json()["status"] == "done"
    assert client.get(f"{API}/cooking/timers", headers=headers).json() == []


def _decrypt(body: bytes, receiver: ec.EllipticCurvePrivateKey, auth: bytes) -> bytes:
    """Giải mã phía trình duyệt theo RFC 8291 để kiểm tra bản mã máy chủ tạo."""
    salt, record_size, id_length = body[:16], *struct.unpack("!IB", body[16:21])
    assert record_size == 4096
    sender_public = body[21 : 21 + id_length]
    ciphertext = body[21 + id_length :]
    sender = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), sender_public)
    shared = receiver.exchange(ec.ECDH(), sender)
    ua_public = receiver.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )

    def mac(key: bytes, data: bytes) -> bytes:
        return hmac.new(key, data, hashlib.sha256).digest()

    ikm = mac(mac(auth, shared), b"WebPush: info\x00" + ua_public + sender_public + b"\x01")
    prk = mac(salt, ikm)
    cek = mac(prk, b"Content-Encoding: aes128gcm\x00\x01")[:16]
    nonce = mac(prk, b"Content-Encoding: nonce\x00\x01")[:12]
    plain = AESGCM(cek).decrypt(nonce, ciphertext, None)
    assert plain.endswith(b"\x02")
    return plain[:-1]


def _browser_keys() -> tuple[ec.EllipticCurvePrivateKey, str, bytes, str]:
    receiver = ec.generate_private_key(ec.SECP256R1())
    public = receiver.public_key().public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    auth = b"0123456789abcdef"
    return receiver, webpush.b64url_encode(public), auth, webpush.b64url_encode(auth)


def test_web_push_payload_round_trips() -> None:
    receiver, p256dh, auth, auth_b64 = _browser_keys()
    body = webpush.encrypt(b'{"title":"Het gio"}', p256dh, auth_b64)
    assert _decrypt(body, receiver, auth) == b'{"title":"Het gio"}'


@pytest.mark.parametrize(
    ("endpoint", "allowed"),
    [
        (FCM, True),
        ("https://updates.push.services.mozilla.com/wpush/v2/x", True),
        ("https://web.push.apple.com/abc", True),
        ("http://fcm.googleapis.com/fcm/send/x", False),
        ("https://fcm.googleapis.com.evil.example/x", False),
        ("https://127.0.0.1/x", False),
        ("https://user@fcm.googleapis.com/x", False),
        ("https://fcm.googleapis.com:8443/x", False),
    ],
)
def test_push_endpoints_are_restricted_to_browser_services(endpoint: str, allowed: bool) -> None:
    assert webpush.allowed_endpoint(endpoint) is allowed


@pytest.fixture
def vapid(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BEP_VIET_WEB_PUSH_VAPID_PRIVATE_KEY", webpush.generate_private_key())
    get_settings.cache_clear()


@pytest.mark.usefixtures("vapid")
def test_due_timer_pushes_notification_and_drops_dead_subscriptions(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_planner_recipes(database_session_factory)
    headers = register_and_login(client, "push@example.com")
    config = client.get(f"{API}/cooking/push", headers=headers).json()
    assert config["enabled"] and len(webpush.b64url_decode(config["public_key"])) == 65

    _, p256dh, _, auth = _browser_keys()
    bad = client.put(
        f"{API}/cooking/push/subscriptions",
        json={"endpoint": "https://evil.example/push", "keys": {"p256dh": p256dh, "auth": auth}},
        headers=headers,
    )
    assert bad.status_code == 422
    for endpoint in (FCM, f"{FCM}-gone"):
        saved = client.put(
            f"{API}/cooking/push/subscriptions",
            json={"endpoint": endpoint, "keys": {"p256dh": p256dh, "auth": auth}},
            headers=headers,
        )
        assert saved.status_code == 204, saved.text

    timer_id = str(uuid.uuid4())
    client.put(
        f"{API}/cooking/timers",
        json={
            "id": timer_id,
            "label": "Hầm xương",
            "recipe_slug": "canh-chua-ca",
            "seconds": 60,
            "return_path": "/cook?dish=canh-chua-ca",
        },
        headers=headers,
    )
    sent: list[tuple[str, dict[str, Any]]] = []

    def fake_send(target: webpush.PushTarget, message: dict[str, Any], **_: Any) -> bool:
        if target.endpoint.endswith("-gone"):
            raise webpush.PushGoneError
        sent.append((target.endpoint, message))
        return True

    monkeypatch.setattr(webpush, "send", fake_send)
    now = datetime.now(UTC)
    assert service.dispatch_due_timers(now, database_session_factory) == 0  # chưa đến giờ
    later = now + timedelta(seconds=61)
    assert service.dispatch_due_timers(later, database_session_factory) == 1
    assert service.dispatch_due_timers(later, database_session_factory) == 0  # không đẩy lặp
    assert len(sent) == 1
    endpoint, message = sent[0]
    assert endpoint == FCM
    assert message["timer_id"] == timer_id
    assert message["url"] == f"/cook?dish=canh-chua-ca&timer={timer_id}"
    assert "Hầm xương" in message["body"]

    with database_session_factory() as session:
        endpoints = session.scalars(select(UserPushSubscription.endpoint)).all()
        assert endpoints == [FCM]

    # Hoãn thêm 5 phút thì chuông được đẩy lại khi đến hạn mới.
    client.patch(
        f"{API}/cooking/timers/{timer_id}",
        json={"action": "snooze", "seconds": 300},
        headers=headers,
    )
    assert (
        service.dispatch_due_timers(later + timedelta(seconds=400), database_session_factory) == 1
    )

    # Chuông bỏ dở quá lâu không bị đẩy nữa.
    with database_session_factory() as session:
        timer = session.get(UserCookTimer, uuid.UUID(timer_id))
        assert timer is not None
        timer.notified_at = None
        session.commit()
    assert service.dispatch_due_timers(later + timedelta(hours=3), database_session_factory) == 0

    client.post(f"{API}/cooking/push/subscriptions/delete", json={"endpoint": FCM}, headers=headers)
    with database_session_factory() as session:
        assert session.scalars(select(UserPushSubscription)).all() == []


def test_push_disabled_without_vapid_key(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    headers = register_and_login(client, "nopush@example.com")
    assert client.get(f"{API}/cooking/push", headers=headers).json() == {
        "enabled": False,
        "public_key": None,
    }
    _, p256dh, _, auth = _browser_keys()
    response = client.put(
        f"{API}/cooking/push/subscriptions",
        json={"endpoint": FCM, "keys": {"p256dh": p256dh, "auth": auth}},
        headers=headers,
    )
    assert response.status_code == 503
