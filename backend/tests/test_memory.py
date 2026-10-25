from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import ai, engine, memory
from tests.helpers import register_and_login
from tests.test_assistant import seed


def chat(client: TestClient, message: str, headers: dict[str, str]) -> dict[str, Any]:
    response = client.post("/api/v1/assistant/chat", json={"message": message}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["reply"]


def test_parse_command_splits_facts_and_detects_intents() -> None:
    command = memory.parse_command(
        "Nhớ giúp mình: nhà mình không ăn cay, có 4 người, con dị ứng tôm"
    )
    assert command is not None and command.action == "remember"
    assert command.facts == ["Nhà mình không ăn cay", "Có 4 người", "Con dị ứng tôm"]
    assert [memory.classify(fact) for fact in command.facts] == ["diet", "household", "allergy"]

    assert memory.parse_command("Chú Rồng ơi, ghi nhớ là mình ăn chay trường").facts == [
        "Mình ăn chay trường"
    ]
    assert memory.parse_command("Bạn nhớ gì về mình?").action == "recall"
    assert memory.parse_command("Quên hết đi").action == "forget_all"
    forget = memory.parse_command("Quên chuyện dị ứng tôm")
    assert forget is not None and (forget.action, forget.target) == ("forget", "Dị ứng tôm")
    # Câu hỏi bình thường không phải lệnh ghi nhớ.
    assert memory.parse_command("Bạn có nhớ cách nấu phở không?") is None
    assert memory.parse_command("Tối nay ăn gì?") is None


def test_preferences_from_memories() -> None:
    prefs = engine.preferences_from(
        ["Nhà mình không ăn cay", "Có 4 người", "Con dị ứng tôm", "Mẹ dị ứng hải sản"]
    )
    assert prefs.not_spicy and prefs.servings == 4
    assert {"tom", "muc", "cua"} <= set(prefs.exclude)
    assert not prefs.vegetarian
    assert engine.preferences_from(["Ăn chay ngày rằm"]).vegetarian is False
    assert engine.preferences_from(["Mình ăn chay trường"]).vegetarian is True


def test_memories_are_saved_listed_and_applied_to_suggestions(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "nho@example.com")
    saved = chat(client, "Nhớ giúp mình: nhà mình không ăn gà, có 3 người", headers)
    assert "Nhà mình không ăn gà" in saved["content"]
    assert saved["actions"][0]["to"] == memory.SETTINGS_PATH

    listed = client.get("/api/v1/assistant/memories", headers=headers).json()
    assert [item["content"] for item in listed["data"]] == ["Nhà mình không ăn gà", "Có 3 người"]
    assert [item["kind"] for item in listed["data"]] == ["diet", "household"]

    again = chat(client, "Nhớ giúp mình: nhà mình không ăn gà", headers)
    assert "nhớ từ trước" in again["content"]

    for _ in range(4):
        reply = chat(client, "Gợi ý món mặn cho bữa tối", headers)
        assert "ga-kho-gung" not in [card["slug"] for card in reply["recipes"]]

    recall = chat(client, "Bạn nhớ gì về mình?", headers)
    assert "Có 3 người" in recall["content"]


def test_memories_reach_ai_and_unsafe_dishes_are_filtered(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "ai-nho@example.com")
    chat(client, "Ghi nhớ giúp mình: mình dị ứng cá", headers)
    seen: dict[str, Any] = {}

    def fake_generate(**kwargs: Any) -> str:
        seen.update(kwargs)
        return "Thử **Rau muống xào tỏi** nhé!"

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "generate_reply", fake_generate)
    chat(client, "Canh chua cá nấu sao?", headers)
    assert "Mình dị ứng cá" in seen["memories"]
    assert "canh-chua-ca" not in {entry.slug for entry in seen["candidates"]}


def test_memory_crud_is_private_to_each_user(client: TestClient) -> None:
    owner = register_and_login(client, "owner@example.com")
    other = register_and_login(client, "other@example.com")
    created = client.post(
        "/api/v1/assistant/memories", json={"content": "Thích ăn ngọt"}, headers=owner
    )
    assert created.status_code == 201, created.text
    memory_id = created.json()["id"]

    assert client.get("/api/v1/assistant/memories", headers=other).json()["data"] == []
    forbidden = client.patch(
        f"/api/v1/assistant/memories/{memory_id}", json={"content": "x y"}, headers=other
    )
    assert forbidden.status_code == 404
    assert (
        client.delete(f"/api/v1/assistant/memories/{memory_id}", headers=other).status_code == 404
    )

    edited = client.patch(
        f"/api/v1/assistant/memories/{memory_id}",
        json={"content": "Không ăn hành"},
        headers=owner,
    )
    assert edited.json()["content"] == "Không ăn hành" and edited.json()["kind"] == "diet"
    assert (
        client.delete(f"/api/v1/assistant/memories/{memory_id}", headers=owner).status_code == 204
    )
    assert client.get("/api/v1/assistant/memories").status_code == 401


def test_forget_commands_and_limit(client: TestClient) -> None:
    headers = register_and_login(client, "forget@example.com")
    chat(client, "Nhớ giúp mình: con dị ứng tôm, thích ăn canh", headers)
    forgot = chat(client, "Quên chuyện dị ứng tôm", headers)
    assert "Con dị ứng tôm" in forgot["content"]
    remaining = client.get("/api/v1/assistant/memories", headers=headers).json()["data"]
    assert [item["content"] for item in remaining] == ["Thích ăn canh"]

    chat(client, "Quên hết đi", headers)
    assert client.get("/api/v1/assistant/memories", headers=headers).json()["data"] == []

    many = ", ".join(f"Ghi chú số {index}" for index in range(memory.MAX_MEMORIES + 2))
    reply = chat(client, f"Nhớ giúp mình: {many}", headers)
    assert f"tối đa {memory.MAX_MEMORIES}" in reply["content"]
    assert len(client.get("/api/v1/assistant/memories", headers=headers).json()["data"]) == 30
    full = client.post("/api/v1/assistant/memories", json={"content": "Thêm nữa"}, headers=headers)
    assert full.status_code == 409


def test_guest_is_asked_to_sign_in_before_remembering(client: TestClient) -> None:
    response = client.post(
        "/api/v1/assistant/chat", json={"message": "Nhớ giúp mình: không ăn cay"}
    )
    reply = response.json()["reply"]
    assert "đăng nhập" in reply["content"]
    assert reply["actions"][0]["to"] == "/login"
