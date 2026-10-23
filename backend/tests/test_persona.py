from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import ai, persona
from tests.helpers import register_and_login
from tests.test_assistant import seed


def chat(client: TestClient, message: str, headers: dict[str, str]) -> dict[str, Any]:
    response = client.post("/api/v1/assistant/chat", json={"message": message}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["reply"]


def enable_sassy(client: TestClient, headers: dict[str, str], enabled: bool = True) -> None:
    current = client.get("/api/v1/account/preferences", headers=headers).json()
    assert current["assistant_sassy"] is False or enabled is False
    saved = client.put(
        "/api/v1/account/preferences",
        json={**current, "assistant_sassy": enabled},
        headers=headers,
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["assistant_sassy"] is enabled


def test_ai_gets_witty_tone_by_default_and_sassy_tone_when_enabled(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "tone@example.com")
    seen: list[str] = []

    def fake_generate(**kwargs: Any) -> str:
        seen.append(kwargs["persona"])
        return "Ăn **Canh chua cá** đi!"

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "generate_reply", fake_generate)
    chat(client, "Tối nay ăn gì?", headers)
    enable_sassy(client, headers)
    reply = chat(client, "Tối nay ăn gì?", headers)

    assert seen[0] == persona.FRIENDLY_PROMPT
    assert seen[1] == persona.SASSY_PROMPT
    assert "không chửi thề" in seen[1]
    # Giọng đổi nhưng thẻ món vẫn lấy đúng từ kho.
    assert [card["slug"] for card in reply["recipes"]] == ["canh-chua-ca"]


def test_local_engine_adds_a_sassy_quip_but_keeps_the_answer(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "sassy@example.com")
    normal = chat(client, "Gợi ý món canh", headers)
    enable_sassy(client, headers)
    sassy = chat(client, "Gợi ý món canh", headers)

    quips = {line for pool in persona._QUIPS.values() for lines in pool.values() for line in lines}
    assert normal["content"].split("\n\n")[0] not in quips
    first, _, rest = sassy["content"].partition("\n\n")
    assert first in quips and rest
    assert sassy["recipes"], "vẫn phải gợi ý món"

    memory_reply = chat(client, "Nhớ giúp mình: không ăn hành", headers)
    assert memory_reply["content"].split("\n\n")[0] in quips
    assert "Không ăn hành" in memory_reply["content"]


def test_guests_always_get_the_friendly_tone(client: TestClient) -> None:
    response = client.post("/api/v1/assistant/chat", json={"message": "Xin chào"})
    quips = {line for pool in persona._QUIPS.values() for lines in pool.values() for line in lines}
    assert response.json()["reply"]["content"].split("\n\n")[0] not in quips
