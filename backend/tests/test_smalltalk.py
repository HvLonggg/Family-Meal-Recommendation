from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import ai, smalltalk
from tests.helpers import register_and_login
from tests.test_assistant import seed


def chat(client: TestClient, message: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    response = client.post("/api/v1/assistant/chat", json={"message": message}, headers=headers)
    assert response.status_code == 200, response.text
    return response.json()["reply"]


def pool(key: str, *, sassy: bool) -> set[str]:
    topic = next(topic for topic in smalltalk.TOPICS if topic.key == key)
    return set((topic.sassy if sassy else topic.friendly)["vi"])


@pytest.mark.parametrize(
    ("message", "key"),
    [
        ("Chiến nhau không?", "fight"),
        ("solo không bạn", "fight"),
        ("Bạn khỏe không?", "how_are_you"),
        ("Bạn thích ăn gì?", "favorite_food"),
        ("Bạn là bot hả?", "bot"),
        ("đi ngủ đây", "bye"),
        ("bạn ngu thế", "insult"),
        ("Kể chuyện cười đi", "joke"),
        ("haha", "laugh"),
        ("ok", "ack"),
    ],
)
def test_detects_off_topic_chat(message: str, key: str) -> None:
    topic = smalltalk.detect(message)
    assert topic is not None and topic.key == key


@pytest.mark.parametrize(
    "message",
    [
        "Món này chiên không?",
        "Gợi ý món canh",
        "Món này tuyệt vời không, nấu thế nào cho ngon vậy?",
    ],
)
def test_cooking_questions_are_not_small_talk(message: str) -> None:
    assert smalltalk.detect(message) is None


def test_off_topic_chat_gets_a_human_reply_without_dish_spam(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    reply = chat(client, "Chiến nhau không?")
    assert reply["content"] in pool("fight", sassy=False)
    assert reply["recipes"] == [] and reply["suggestions"] == []

    favorite = chat(client, "Bạn thích ăn gì?")
    assert favorite["content"] in pool("favorite_food", sassy=False)
    assert favorite["recipes"] == []


def test_sassy_mode_talks_back_off_topic(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "banter@example.com")
    current = client.get("/api/v1/account/preferences", headers=headers).json()
    client.put(
        "/api/v1/account/preferences", json={**current, "assistant_sassy": True}, headers=headers
    )
    assert chat(client, "Chiến nhau không?", headers)["content"] in pool("fight", sassy=True)
    assert chat(client, "bạn ngu thế", headers)["content"] in pool("insult", sassy=True)


def test_light_feelings_get_empathy_then_the_requested_dishes(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    reply = chat(client, "Buồn quá, gợi ý món canh")
    first, _, rest = reply["content"].partition("\n\n")
    assert first in pool("sad", sassy=False)
    assert rest and reply["recipes"]


def test_ai_handles_small_talk_itself_when_enabled(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(
        ai, "generate_reply", lambda **_: "Chiến thì chiến, nhưng đấu bằng chảo nha!"
    )
    reply = chat(client, "Chiến nhau không?")
    assert reply["mode"] == "ai"
    assert reply["content"] == "Chiến thì chiến, nhưng đấu bằng chảo nha!"
