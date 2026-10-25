import base64
from collections.abc import Generator
from decimal import Decimal
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import ai, engine, profile, service
from app.modules.recipes.models import Recipe, RecipeIngredient
from tests.helpers import PNG_DATA_URL, register_and_login

RECIPES: list[dict[str, Any]] = [
    {
        "slug": "ga-kho-gung",
        "name": "Gà kho gừng",
        "category": "Món mặn",
        "region": "Bắc",
        "minutes": (10, 25),
        "ingredients": ["Thịt gà", "Gừng", "Nước mắm"],
        "tags": {
            "meal_type": ["trưa", "tối"],
            "main_ingredient": ["gà"],
            "cooking_method": ["kho"],
        },
    },
    {
        "slug": "trung-chien-ca-chua",
        "name": "Trứng sốt cà chua",
        "category": "Món mặn",
        "region": "Ba miền",
        "minutes": (5, 10),
        "ingredients": ["Trứng gà", "Cà chua", "Hành lá"],
        "tags": {"meal_type": ["sáng", "trưa", "tối"], "main_ingredient": ["trứng"]},
    },
    {
        "slug": "canh-chua-ca",
        "name": "Canh chua cá",
        "category": "Món canh",
        "region": "Nam",
        "minutes": (15, 20),
        "ingredients": ["Cá lóc", "Cà chua", "Dứa"],
        "tags": {"meal_type": ["trưa", "tối"], "main_ingredient": ["cá"]},
    },
    {
        "slug": "rau-muong-xao-toi",
        "name": "Rau muống xào tỏi",
        "category": "Món rau",
        "region": "Ba miền",
        "minutes": (5, 5),
        "ingredients": ["Rau muống", "Tỏi"],
        "tags": {"meal_type": ["trưa", "tối"], "cooking_method": ["xào"]},
    },
    {
        "slug": "dau-hu-sot-nam",
        "name": "Đậu hũ sốt nấm",
        "category": "Món chay",
        "region": "Ba miền",
        "minutes": (10, 15),
        "ingredients": ["Đậu phụ", "Nấm đùi gà", "Nước tương"],
        "tags": {"meal_type": ["trưa", "tối"], "main_ingredient": ["đậu phụ", "nấm"]},
    },
    {
        "slug": "pho-bo-ha-noi",
        "name": "Phở bò Hà Nội",
        "category": "Món nước",
        "region": "Bắc",
        "minutes": (40, 180),
        "ingredients": ["Bánh phở", "Thịt bò", "Xương bò"],
        "tags": {"meal_type": ["sáng"], "main_ingredient": ["bò"]},
    },
]


@pytest.fixture(autouse=True)
def fresh_assistant_state() -> Generator[None, None, None]:
    engine.reset_catalog_cache()
    service.reset_rate_limits()
    yield
    engine.reset_catalog_cache()
    service.reset_rate_limits()


def seed(factory: sessionmaker[Session]) -> None:
    with factory() as session:
        for item in RECIPES:
            prep, cook = item["minutes"]
            recipe = Recipe(
                slug=item["slug"],
                name=item["name"],
                excerpt=f"{item['name']} đậm đà cho bữa cơm nhà.",
                region=item["region"],
                category=item["category"],
                difficulty="Dễ",
                prep_minutes=prep,
                cook_minutes=cook,
                base_servings=4,
                image_path=f"/images/{item['slug']}.jpg",
                image_alt=item["name"],
                serving="Ăn nóng.",
                tip="Nêm vừa ăn.",
                source_name="Bếp Việt",
                source_url="",
                status="published",
                content={"tags": item["tags"]},
                search_text=engine.normalize_search(item["name"]),
            )
            for position, name in enumerate(item["ingredients"], start=1):
                recipe.ingredients.append(
                    RecipeIngredient(
                        group_name="Nguyên liệu chính",
                        name=name,
                        amount=Decimal("1"),
                        unit="phần",
                        scalable=True,
                        position=position,
                    )
                )
            session.add(recipe)
        session.commit()


def chat(client: TestClient, message: str, **extra: Any) -> dict[str, Any]:
    response = client.post("/api/v1/assistant/chat", json={"message": message, **extra})
    assert response.status_code == 200, response.text
    return response.json()


def slugs(body: dict[str, Any]) -> list[str]:
    return [card["slug"] for card in body["reply"]["recipes"]]


def test_status_reports_local_mode_without_api_key(client: TestClient) -> None:
    body = client.get("/api/v1/assistant/status").json()
    assert body["mode"] == "local"
    assert body["name"] == "Chú Rồng"
    assert "image/png" in body["accepts"]


def test_assistant_answers_public_team_and_contact_questions(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai, "ai_enabled", lambda: False)
    monkeypatch.setattr(
        profile,
        "get_settings",
        lambda: SimpleNamespace(support_email="hvlongg@gmail.com"),
    )

    founder = chat(client, "Ai là tác giả và nhà sáng lập Bếp Việt?")
    assert "Hoàng Văn Long" in founder["reply"]["content"]
    assert "Nhà sáng lập & phụ trách sản phẩm" in founder["reply"]["content"]
    assert "Hà Nội" in founder["reply"]["content"]

    chef = chat(client, "Đầu bếp của Bếp Việt là ai?")
    assert "Phạm Thu Quyên" in chef["reply"]["content"]

    contact = chat(client, "Số điện thoại, email hỗ trợ và địa chỉ Bếp Việt là gì?")
    content = contact["reply"]["content"]
    assert "0364892903" in content
    assert "hvlongg@gmail.com" in content
    assert "Ngõ 80/57 Mễ Trì Hạ" in content
    assert contact["reply"]["actions"][0]["to"] == "/contact"

    english = chat(client, "What is Bếp Việt's support email?", language="en")
    assert "hvlongg@gmail.com" in english["reply"]["content"]


def test_guest_gets_recipe_suggestions_from_the_catalog(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    dinner = chat(client, "Tối nay ăn gì?")
    assert dinner["conversation_id"] is None
    assert dinner["reply"]["mode"] == "local"
    assert dinner["reply"]["recipes"]
    assert "pho-bo-ha-noi" not in slugs(dinner)  # phở chỉ gắn bữa sáng
    assert dinner["reply"]["suggestions"]

    fridge = chat(client, "Tủ lạnh còn trứng và cà chua")
    assert slugs(fridge) == ["trung-chien-ca-chua"]
    assert "cà chua" in fridge["reply"]["content"]

    chicken = chat(client, "có gà không?")
    # "Trứng gà" và "nấm đùi gà" không phải món gà.
    assert slugs(chicken) == ["ga-kho-gung"]

    vegetarian = chat(client, "món chay cho bữa trưa")
    assert slugs(vegetarian) == ["dau-hu-sot-nam"]

    no_beef = chat(client, "không ăn bò, gợi ý món nước")
    assert "pho-bo-ha-noi" not in slugs(no_beef)

    meal = chat(client, "Gợi ý mâm cơm 4 người")
    categories = {card["category"] for card in meal["reply"]["recipes"]}
    assert {"Món mặn", "Món canh", "Món rau"} <= categories

    recipe = chat(client, "cách nấu phở bò")
    assert slugs(recipe) == ["pho-bo-ha-noi"]
    assert "Phở bò Hà Nội" in recipe["reply"]["content"]

    topic = chat(client, "lịch âm dùng thế nào?")
    assert any(action["to"] == "/planner" for action in topic["reply"]["actions"])

    english = chat(client, "What's for dinner?", language="en")
    assert english["reply"]["content"].startswith(("Here are", "How about"))


def test_member_conversations_are_saved_private_and_manageable(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    lan = register_and_login(client, "lan@example.com")
    first = client.post(
        "/api/v1/assistant/chat", headers=lan, json={"message": "Tối nay ăn gì?"}
    ).json()
    conversation_id = first["conversation_id"]
    assert conversation_id
    assert first["title"] == "Tối nay ăn gì?"

    second = client.post(
        "/api/v1/assistant/chat",
        headers=lan,
        json={"message": "Đổi món khác", "conversation_id": conversation_id},
    ).json()
    assert second["conversation_id"] == conversation_id

    listed = client.get("/api/v1/assistant/conversations", headers=lan).json()["data"]
    assert [item["id"] for item in listed] == [conversation_id]
    assert listed[0]["message_count"] == 4

    detail = client.get(f"/api/v1/assistant/conversations/{conversation_id}", headers=lan).json()
    assert [message["role"] for message in detail["messages"]] == [
        "user",
        "assistant",
        "user",
        "assistant",
    ]
    assert detail["messages"][1]["recipes"]

    binh = register_and_login(client, "binh@example.com", "Trần Bình")
    assert (
        client.get(f"/api/v1/assistant/conversations/{conversation_id}", headers=binh).status_code
        == 404
    )
    assert client.get("/api/v1/assistant/conversations").status_code == 401

    renamed = client.patch(
        f"/api/v1/assistant/conversations/{conversation_id}",
        headers=lan,
        json={"title": "  Bữa tối   cả nhà "},
    )
    assert renamed.json()["title"] == "Bữa tối cả nhà"
    deleted = client.delete(f"/api/v1/assistant/conversations/{conversation_id}", headers=lan)
    assert deleted.status_code == 204
    assert client.get("/api/v1/assistant/conversations", headers=lan).json()["data"] == []


def test_attachments_are_read_but_not_stored(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    note = base64.b64encode("Trong tủ: rau muống, tỏi".encode()).decode()
    with_list = chat(
        client,
        "Nấu gì từ danh sách này?",
        attachments=[
            {
                "name": "tu-lanh.txt",
                "content_type": "text/plain",
                "data": f"data:text/plain;base64,{note}",
            }
        ],
    )
    assert slugs(with_list) == ["rau-muong-xao-toi"]
    assert with_list["user_message"]["attachments"][0]["kind"] == "text"

    photo = chat(
        client,
        "",
        attachments=[{"name": "anh.png", "content_type": "image/png", "data": PNG_DATA_URL}],
    )
    assert "ảnh" in photo["reply"]["content"]
    assert photo["user_message"]["attachments"][0]["kind"] == "image"

    fake = client.post(
        "/api/v1/assistant/chat",
        json={
            "message": "xem giúp",
            "attachments": [
                {
                    "name": "virus.exe",
                    "content_type": "application/octet-stream",
                    "data": "data:application/octet-stream;base64,TVqQAAMAAAAEAAAA",
                }
            ],
        },
    )
    assert fake.status_code == 400
    empty = client.post("/api/v1/assistant/chat", json={"message": "   "})
    assert empty.status_code == 422


def test_rate_limit_protects_the_assistant(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    for _ in range(service.RATE_PER_MINUTE):
        chat(client, "xin chào")
    limited = client.post("/api/v1/assistant/chat", json={"message": "xin chào"})
    assert limited.status_code == 429


def test_ai_mode_uses_claude_reply_with_catalog_cards(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    seen: dict[str, Any] = {}

    def fake_generate(**kwargs: Any) -> str:
        seen.update(kwargs)
        return "Tối nay thử **Canh chua cá** với **Rau muống xào tỏi** nhé!"

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "generate_reply", fake_generate)
    body = chat(client, "Tối nay ăn gì cho mát?")
    assert body["reply"]["mode"] == "ai"
    assert slugs(body) == ["canh-chua-ca", "rau-muong-xao-toi"]
    assert {entry.slug for entry in seen["candidates"]} >= {"canh-chua-ca"}

    monkeypatch.setattr(ai, "generate_reply", lambda **_: None)
    fallback = chat(client, "Tối nay ăn gì?")
    assert fallback["reply"]["mode"] == "local"
    assert fallback["reply"]["recipes"]


def test_blank_api_key_keeps_local_mode(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings

    monkeypatch.setenv("BEP_VIET_ANTHROPIC_API_KEY", "  ")
    get_settings.cache_clear()
    assert client.get("/api/v1/assistant/status").json()["mode"] == "local"


def test_member_chats_are_included_in_data_export(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    lan = register_and_login(client, "lan@example.com")
    client.post("/api/v1/assistant/chat", headers=lan, json={"message": "Tối nay ăn gì?"})
    exported = client.get("/api/v1/account/export", headers=lan).json()
    [conversation] = exported["assistant_conversations"]
    assert conversation["title"] == "Tối nay ăn gì?"
    assert [message["role"] for message in conversation["messages"]] == ["user", "assistant"]


def _ai_settings(**overrides: object) -> object:
    from types import SimpleNamespace

    from pydantic import SecretStr

    values: dict[str, object] = {
        "anthropic_api_key": None,
        "gemini_api_key": SecretStr("<test-key>"),
        "gemini_model": "gemini-flash-latest",
        "gemini_fallback_models": ["gemini-flash-lite-latest"],
        "assistant_provider": "auto",
        "assistant_timeout_seconds": 5,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_gemini_is_used_when_only_its_key_is_set(monkeypatch: pytest.MonkeyPatch) -> None:
    from pydantic import SecretStr

    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    assert ai.active_provider() == "gemini"
    monkeypatch.setattr(
        ai, "get_settings", lambda: _ai_settings(anthropic_api_key=SecretStr("<claude>"))
    )
    assert ai.active_provider() == "claude"
    monkeypatch.setattr(
        ai,
        "get_settings",
        lambda: _ai_settings(anthropic_api_key=SecretStr("<claude>"), assistant_provider="gemini"),
    )
    assert ai.active_provider() == "gemini"
    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings(gemini_api_key=SecretStr(" ")))
    assert ai.active_provider() is None


def test_gemini_reply_sends_catalog_and_falls_back_on_quota(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import httpx

    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    sent: dict[str, object] = {}

    def fake_post(url: str, **kwargs: object) -> httpx.Response:
        sent.update(url=url, **kwargs)
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {"parts": [{"text": "Thử Canh chua cá nhé!"}]},
                    }
                ]
            },
        )

    monkeypatch.setattr(ai.httpx, "post", fake_post)
    reply = ai.generate_reply(
        message="Tối nay ăn gì?",
        history=[("assistant", "Chào bạn!"), ("user", "Mình thích món chua")],
        candidates=[],
        attachments=[],
        language="vi",
    )
    assert reply == "Thử Canh chua cá nhé!"
    assert "gemini-flash-latest:generateContent" in str(sent["url"])
    body = sent["json"]
    assert isinstance(body, dict)
    # Tin đầu tiên phải là của người dùng; lời chào cũ của bot bị bỏ.
    assert [item["role"] for item in body["contents"]] == ["user", "user"]
    assert "<kho_mon>" in body["contents"][-1]["parts"][0]["text"]

    monkeypatch.setattr(ai.httpx, "post", lambda *_, **__: httpx.Response(429, json={}))
    assert (
        ai.generate_reply(
            message="Tối nay ăn gì?", history=[], candidates=[], attachments=[], language="vi"
        )
        is None
    )


def test_gemini_falls_back_to_a_lighter_model_when_busy(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    calls: list[str] = []

    def fake_post(url: str, **_: Any) -> httpx.Response:
        calls.append(url.split("/models/")[1].split(":")[0])
        if len(calls) == 1:
            return httpx.Response(503, json={"error": {"message": "high demand"}})
        return httpx.Response(
            200,
            json={
                "candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "Ok!"}]}}]
            },
        )

    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    monkeypatch.setattr(ai.httpx, "post", fake_post)
    reply = ai.generate_reply(
        message="Chào", history=[], candidates=[], attachments=[], language="vi"
    )
    assert reply == "Ok!"
    assert calls == ["gemini-flash-latest", "gemini-flash-lite-latest"]
