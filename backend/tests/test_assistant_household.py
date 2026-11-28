"""Chú Rồng áp dụng Cài đặt tài khoản (dị ứng, số người, ăn cay…) khi gợi ý món."""

from collections.abc import Generator
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.modules.account.preferences import UserPreferences
from app.modules.assistant import ai, engine, household, service
from tests import test_assistant
from tests.helpers import register_and_login

EXTRA: list[dict[str, Any]] = [
    {
        "slug": "tom-rim-man",
        "name": "Tôm rim mặn ngọt",
        "category": "Món mặn",
        "region": "Nam",
        "minutes": (10, 15),
        "ingredients": ["Tôm sú", "Nước mắm", "Đường"],
        "tags": {"meal_type": ["trưa", "tối"], "main_ingredient": ["tôm"]},
    },
    {
        "slug": "canh-bi-nau-tom",
        "name": "Canh bí nấu tôm",
        "category": "Món canh",
        "region": "Bắc",
        "minutes": (10, 10),
        "ingredients": ["Bí xanh", "Tôm khô"],
        "tags": {"meal_type": ["trưa", "tối"], "main_ingredient": ["tôm"]},
    },
    {
        "slug": "ga-xao-sa-ot",
        "name": "Gà xào sả ớt",
        "category": "Món mặn",
        "region": "Trung",
        "minutes": (10, 15),
        "ingredients": ["Thịt gà", "Sả", "Ớt"],
        "tags": {"meal_type": ["trưa", "tối"], "main_ingredient": ["gà"], "spicy_level": 3},
    },
]
SHRIMP = {"tom-rim-man", "canh-bi-nau-tom"}


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    monkeypatch.setattr(test_assistant, "RECIPES", [*test_assistant.RECIPES, *EXTRA])
    monkeypatch.setattr(ai, "ai_enabled", lambda: False)
    engine.reset_catalog_cache()
    service.reset_rate_limits()
    yield
    engine.reset_catalog_cache()
    service.reset_rate_limits()


def _member(client: TestClient, email: str, **preferences: Any) -> dict[str, str]:
    headers = register_and_login(client, email)
    saved = client.put("/api/v1/account/preferences", headers=headers, json=preferences)
    assert saved.status_code == 200, saved.text
    return headers


def _ask(client: TestClient, message: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    response = client.post(
        "/api/v1/assistant/chat", headers=headers or {}, json={"message": message}
    )
    assert response.status_code == 200, response.text
    return dict(response.json()["reply"])


def _slugs(reply: dict[str, Any]) -> set[str]:
    return {card["slug"] for card in reply["recipes"]}


def test_allergy_text_maps_to_ingredient_groups() -> None:
    assert engine.exclusions_in("tôm") == ["tom"]
    assert set(engine.exclusions_in("Dị ứng đậu phộng, sữa và hải sản có vỏ")) >= {
        "dau phong",
        "sua",
        "tom",
        "cua",
    }
    assert "muc" in engine.exclusions_in("hải sản")


def test_shrimp_allergy_never_suggests_shrimp(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    test_assistant.seed(database_session_factory)
    headers = _member(client, "allergy@example.com", allergies="tôm")
    seen: set[str] = set()
    for message in ("Tối nay ăn gì?", "Gợi ý món canh", "Gợi ý cả mâm cơm", "Món có tôm"):
        for _ in range(3):
            reply = _ask(client, message, headers)
            seen |= _slugs(reply)
    assert seen, "phải có gợi ý"
    assert not seen & SHRIMP
    assert "dị ứng" in reply["content"]


def test_mild_spice_setting_excludes_spicy_dishes(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    test_assistant.seed(database_session_factory)
    headers = _member(client, "mild@example.com", spice_level="mild")
    seen: set[str] = set()
    for _ in range(8):
        seen |= _slugs(_ask(client, "Gợi ý món gà", headers))
    assert "ga-kho-gung" in seen
    assert "ga-xao-sa-ot" not in seen


def test_household_size_sets_meal_servings(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    test_assistant.seed(database_session_factory)
    members = [{"label": f"Người {index}", "age": 30} for index in range(5)]
    headers = _member(client, "five@example.com", household_members=members)
    reply = _ask(client, "Gợi ý cả mâm cơm", headers)
    assert reply["recipes"]
    assert "5 người" in reply["content"]
    # Tin nhắn nói rõ số người thì thắng Cài đặt.
    explicit = _ask(client, "Gợi ý cả mâm cơm cho 2 người", headers)
    assert "2 người" in explicit["content"]


def test_ai_prompt_receives_family_profile(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_assistant.seed(database_session_factory)
    seen: dict[str, Any] = {}

    def fake_generate(**kwargs: Any) -> str:
        seen.update(kwargs)
        return "Vì nhà bạn dị ứng tôm, mình gợi ý **Gà kho gừng** nhé!"

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "generate_reply", fake_generate)
    members = [{"label": "Bà Ngoại", "age": 80}, {"label": "Bố", "age": 50}]
    headers = _member(
        client, "ai@example.com", allergies="tôm", household_members=members, spice_level="mild"
    )
    reply = _ask(client, "Tối nay ăn gì?", headers)
    assert reply["mode"] == "ai"
    block = seen["memories"]
    assert "<ho_so_gia_dinh>" in block
    assert "tôm" in block and "không ăn cay" in block and "người lớn tuổi" in block
    # Không gửi tên thành viên cho mô hình.
    assert "Bà Ngoại" not in block
    assert not {entry.slug for entry in seen["candidates"]} & SHRIMP

    seen.clear()
    _ask(client, "Tối nay ăn gì?")
    assert "<ho_so_gia_dinh>" not in seen["memories"]


def test_profile_question_is_answered_from_settings(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    test_assistant.seed(database_session_factory)
    members = [{"label": "Bố", "age": 40}, {"label": "Mẹ", "age": 38}, {"label": "Bé", "age": 5}]
    headers = _member(client, "who@example.com", household_members=members, allergies="sữa")
    reply = _ask(client, "Nhà tôi mấy người?", headers)
    assert "Nhà bạn có 3 người" in reply["content"]
    assert "1 trẻ em" in reply["content"]
    assert "sữa" in reply["content"]
    assert reply["recipes"] == []
    about = _ask(client, "Bạn biết gì về tôi?", headers)
    assert "Theo Cài đặt của bạn" in about["content"]


def test_guest_is_unaffected_by_other_members_settings(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    test_assistant.seed(database_session_factory)
    _member(client, "other@example.com", allergies="tôm", spice_level="mild")
    seen: set[str] = set()
    for _ in range(10):
        reply = _ask(client, "Gợi ý món canh")
        assert "Theo Cài đặt" not in reply["content"]
        seen |= _slugs(reply)
    assert "canh-bi-nau-tom" in seen


def test_vegetarian_diet_and_explicit_spicy_override() -> None:
    prefs, applied = household.from_settings(
        UserPreferences(dietary_tags=["vegetarian"], spice_level="mild")
    )
    assert prefs.vegetarian and prefs.not_spicy and "chỉ món chay" in applied
    assert prefs.servings is None  # chưa khai báo thành viên thì không ép khẩu phần


def test_vegetarian_month_days_apply_on_matching_date() -> None:
    from datetime import datetime
    from zoneinfo import ZoneInfo

    from app.modules.account.preferences import read_preferences
    from app.modules.assistant import household

    settings = read_preferences({"vegetarian_month_days": [15], "vegetarian_months": [11]})
    tz = ZoneInfo("Asia/Ho_Chi_Minh")
    assert household._vegetarian_today(settings, datetime(2026, 11, 15, 9, tzinfo=tz))
    assert not household._vegetarian_today(settings, datetime(2026, 11, 16, 9, tzinfo=tz))
    assert not household._vegetarian_today(settings, datetime(2026, 12, 15, 9, tzinfo=tz))
