from decimal import Decimal
from typing import Any

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import engine, traits
from app.modules.recipes.models import Recipe, RecipeIngredient
from tests.helpers import register_and_login

DISHES: list[dict[str, Any]] = [
    {
        "slug": "canh-bi-do",
        "name": "Canh bí đỏ thịt bằm",
        "category": "Món canh",
        "excerpt": "Nước canh ngọt thanh tự nhiên từ bí đỏ, ăn mát và dễ chịu.",
        "methods": ["nấu"],
        "ingredients": [
            ("Bí đỏ", "500", "g"),
            ("Thịt nạc", "150", "g"),
            ("Dầu ăn", "1", "thìa cà phê"),
        ],
    },
    {
        "slug": "ga-chien-gion",
        "name": "Gà chiên giòn",
        "category": "Món mặn",
        "excerpt": "Da gà vàng giòn rụm, thịt mọng.",
        "methods": ["chiên"],
        "ingredients": [("Thịt gà", "800", "g"), ("Dầu ăn", "500", "ml")],
    },
    {
        "slug": "ca-hap-gung",
        "name": "Cá hấp gừng hành",
        "category": "Món mặn",
        "excerpt": "Cá hấp giữ vị ngọt, thơm gừng, thanh đạm.",
        "methods": ["hấp"],
        "ingredients": [("Cá diêu hồng", "700", "g"), ("Gừng", "1", "củ")],
    },
    {
        "slug": "thit-kho-tieu",
        "name": "Thịt kho tiêu",
        "category": "Món mặn",
        "excerpt": "Thịt kho keo lại đậm đà, rất đưa cơm.",
        "methods": ["kho"],
        "ingredients": [("Thịt ba chỉ", "500", "g"), ("Dầu ăn", "2", "muỗng canh")],
    },
]


def seed(factory: sessionmaker[Session]) -> None:
    with factory() as session:
        for item in DISHES:
            recipe = Recipe(
                slug=item["slug"],
                name=item["name"],
                excerpt=item["excerpt"],
                region="Ba miền",
                category=item["category"],
                difficulty="Dễ",
                prep_minutes=10,
                cook_minutes=20,
                base_servings=4,
                image_path=f"/images/{item['slug']}.jpg",
                image_alt=item["name"],
                serving="Ăn nóng với cơm.",
                tip="Nêm vừa ăn.",
                source_name="Bếp Việt",
                source_url="",
                status="published",
                content={"tags": {"meal_type": ["trưa", "tối"], "cooking_method": item["methods"]}},
                search_text=engine.normalize_search(item["name"]),
            )
            for position, (name, amount, unit) in enumerate(item["ingredients"], start=1):
                recipe.ingredients.append(
                    RecipeIngredient(
                        group_name="Chính",
                        name=name,
                        amount=Decimal(amount),
                        unit=unit,
                        scalable=True,
                        position=position,
                    )
                )
            session.add(recipe)
        session.commit()


def chat(
    client: TestClient, message: str, headers: dict[str, str] | None = None, **extra: Any
) -> dict[str, Any]:
    response = client.post(
        "/api/v1/assistant/chat", json={"message": message, **extra}, headers=headers
    )
    assert response.status_code == 200, response.text
    return response.json()


def test_detect_traits_without_false_friends() -> None:
    norm = engine.normalize_search
    assert traits.detect(norm("Gợi ý món ít dầu, ngọt thanh nhé")) == ["low_oil", "light_sweet"]
    assert traits.detect(norm("Mình chưa biết ăn gì, nhé")) == []
    assert traits.detect(norm("trời lạnh muốn món ấm bụng")) == ["warming"]
    assert traits.detect(norm("món đậm đà đưa cơm")) == ["rich"]


def test_oil_estimate_reads_only_real_fats() -> None:
    assert traits.oil_amount("dau an", 2, "muong canh") == 30
    assert traits.oil_amount("dau an", 500, "ml") == 500
    assert traits.oil_amount("bo", 20, "g") == 20
    assert traits.oil_amount("thit bo", 300, "g") == 0
    assert traits.oil_amount("dau phu", 2, "mieng") == 0
    assert traits.oil_amount("dau hao", 1, "muong canh") == 0


def test_low_oil_light_sweet_request_ranks_matching_dishes_first(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    for _ in range(5):
        reply = chat(client, "Gợi ý món ít dầu, ngọt thanh cho bữa tối")["reply"]
        slugs = [card["slug"] for card in reply["recipes"]]
        assert slugs[0] == "canh-bi-do", slugs
        assert "ga-chien-gion" not in slugs
    assert "ít dầu mỡ" in reply["content"] and "ngọt thanh" in reply["content"]

    rich = chat(client, "Có món nào đậm đà đưa cơm không?")["reply"]
    assert rich["recipes"][0]["slug"] == "thit-kho-tieu"


def test_follow_up_hints_appear_only_now_and_then(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "hints@example.com")
    first = chat(client, "Gợi ý món canh", headers=headers)
    conversation_id = first["conversation_id"]
    assert first["reply"]["suggestions"]
    assert "Bấm vào món" in first["reply"]["content"]

    replies = [
        chat(client, "Gợi ý món mặn", headers=headers, conversation_id=conversation_id)["reply"]
        for _ in range(3)
    ]
    assert [bool(reply["suggestions"]) for reply in replies] == [False, False, True]
    assert "Bấm vào món" not in replies[0]["content"]
    assert all(reply["recipes"] for reply in replies), "vẫn gợi ý món khi được hỏi"


def test_sassy_quip_refers_to_what_the_user_asked(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "sassy-traits@example.com")
    current = client.get("/api/v1/account/preferences", headers=headers).json()
    client.put(
        "/api/v1/account/preferences", json={**current, "assistant_sassy": True}, headers=headers
    )
    reply = chat(client, "Món ít dầu ngọt thanh", headers=headers)["reply"]
    quip, _, answer = reply["content"].partition("\n\n")
    assert "ít dầu mỡ, ngọt thanh" in quip
    assert reply["recipes"][0]["slug"] == "canh-bi-do" and answer

    odd = chat(client, "xyz blah blah", headers=headers)["reply"]
    assert "“xyz blah blah”" in odd["content"]
