"""Thời tiết (Open-Meteo, mock httpx), độ chính xác bộ lọc món và tài liệu nền cho Chú Rồng."""

from collections.abc import Generator
from pathlib import Path
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import ai, engine, knowledge, rag, seed, service, weather
from app.modules.assistant.models import AssistantKnowledgeChunk, AssistantKnowledgeDocument
from tests.test_assistant import chat, slugs
from tests.test_assistant import seed as seed_recipes


@pytest.fixture(autouse=True)
def fresh_state(monkeypatch: pytest.MonkeyPatch) -> Generator[None, None, None]:
    engine.reset_catalog_cache()
    service.reset_rate_limits()
    weather.reset_cache()
    monkeypatch.setattr(ai, "ai_enabled", lambda: False)
    yield
    engine.reset_catalog_cache()
    service.reset_rate_limits()
    weather.reset_cache()


def _forecast(code: int, temp: float, *, feels: float | None = None) -> dict[str, Any]:
    return {
        "current": {
            "time": "2026-11-28T14:00",
            "temperature_2m": temp,
            "apparent_temperature": feels if feels is not None else temp,
            "relative_humidity_2m": 70,
            "precipitation": 0.0,
            "weather_code": code,
            "wind_speed_10m": 9.4,
        },
        "daily": {
            "temperature_2m_max": [temp + 3],
            "temperature_2m_min": [temp - 4],
            "precipitation_probability_max": [40],
        },
    }


class FakeHttp:
    def __init__(self, payloads: dict[str, Any] | None = None, *, fail: bool = False) -> None:
        self.payloads = payloads or {}
        self.fail = fail
        self.calls: list[tuple[str, dict[str, Any]]] = []

    def __call__(self, url: str, *, params: dict[str, Any], timeout: float) -> httpx.Response:
        self.calls.append((url, params))
        assert timeout <= 5
        if self.fail:
            raise httpx.ConnectTimeout("timeout")
        payload = self.payloads[url]
        return httpx.Response(200, json=payload, request=httpx.Request("GET", url))


def test_detects_weather_questions_but_not_food_talk() -> None:
    for message in (
        "thời tiết hôm nay thế nào",
        "Hà Nội có mưa không",
        "trời Sài Gòn nóng không",
        "Đà Lạt có lạnh không",
        "What's the weather in Da Nang?",
        "is it raining in Hue?",
    ):
        assert weather.detect(message), message
    for message in (
        "trời ơi ngon quá",
        "trời lạnh quá ăn gì",
        "hôm nay có mua thịt không",
        "mua sắm ở đâu",
        "Hà Nội có món gì ngon không",
    ):
        assert not weather.detect(message), message


def test_finds_cities_with_or_without_diacritics() -> None:
    assert weather.find_place("thời tiết Sai Gon")[0].name == "TP. Hồ Chí Minh"  # type: ignore[union-attr]
    assert weather.find_place("TP.HCM nóng không")[0].name == "TP. Hồ Chí Minh"  # type: ignore[union-attr]
    assert weather.find_place("Huế có mưa không")[0].name == "Huế"  # type: ignore[union-attr]
    assert weather.find_place("thời tiết ở Vinh hôm nay") == (None, "Vinh")
    assert weather.find_place("thời tiết hôm nay") == (None, None)
    assert weather.describe_code(63) == "mưa vừa"
    assert weather.describe_code(None) == "thời tiết thay đổi"


def test_weather_reply_uses_real_numbers_cache_and_warm_dishes(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_recipes(database_session_factory)
    fake = FakeHttp({weather.FORECAST_URL: _forecast(63, 16)})
    monkeypatch.setattr(weather.httpx, "get", fake)

    body = chat(client, "Hà Nội hôm nay có mưa không?")
    reply = body["reply"]
    assert "Thời tiết Hà Nội" in reply["content"]
    assert "mưa vừa" in reply["content"] and "16°C" in reply["content"]
    assert "Open-Meteo" in reply["content"]
    assert reply["recipes"], "phải gợi ý món hợp trời"
    # Mưa lạnh: món kho/món nước được ưu tiên.
    assert slugs(body)[0] in {"ga-kho-gung", "pho-bo-ha-noi", "canh-chua-ca"}
    assert fake.calls[0][1]["latitude"] == pytest.approx(21.0285)
    assert fake.calls[0][1]["timezone"] == "Asia/Ho_Chi_Minh"

    chat(client, "thời tiết Hà Nội thế nào")
    assert len(fake.calls) == 1  # Lần hai lấy từ bộ nhớ đệm.


def test_weather_geocodes_unknown_city(monkeypatch: pytest.MonkeyPatch) -> None:
    fake = FakeHttp(
        {
            weather.GEOCODE_URL: {
                "results": [{"name": "Vinh", "latitude": 18.67, "longitude": 105.68}]
            },
            weather.FORECAST_URL: _forecast(0, 34, feels=38),
        }
    )
    monkeypatch.setattr(weather.httpx, "get", fake)
    found = weather.lookup("thời tiết ở Vinh hôm nay")
    assert found.place.name == "Vinh"
    assert found.report is not None and found.report.mood == "hot"
    assert fake.calls[0][0] == weather.GEOCODE_URL
    assert fake.calls[0][1]["language"] == "vi"


def test_weather_failure_is_graceful_and_tells_ai_not_to_guess(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_recipes(database_session_factory)
    monkeypatch.setattr(weather.httpx, "get", FakeHttp(fail=True))
    body = chat(client, "thời tiết hôm nay thế nào?")
    assert "chưa lấy được số liệu thời tiết" in body["reply"]["content"]
    with database_session_factory() as session:
        result = weather.reply("thời tiết hôm nay", engine.load_catalog(session))
    assert not result.ok
    assert "không đoán" in result.context


def test_ai_prompt_receives_weather_facts(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed_recipes(database_session_factory)
    monkeypatch.setattr(weather.httpx, "get", FakeHttp({weather.FORECAST_URL: _forecast(0, 35)}))
    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    captured: dict[str, Any] = {}

    def fake_reply(**kwargs: Any) -> str:
        captured.update(kwargs)
        return "Trời nắng nóng 35°C, ăn canh chua cá cho mát nhé."

    monkeypatch.setattr(ai, "generate_reply", fake_reply)
    body = chat(client, "trời Sài Gòn nóng không")
    assert "<thoi_tiet>" in captured["knowledge"]
    assert "35°C" in captured["knowledge"]
    assert captured["candidates"], "AI phải nhận món hợp trời"
    assert body["reply"]["mode"] == "ai"


@pytest.mark.parametrize(
    ("message", "check"),
    [
        ("kiêng hải sản", lambda i: "tom" in i.exclude and "muc" in i.exclude),
        ("món ít calo", lambda i: i.kind == "suggest" and "low_oil" in i.traits),
        ("món cho trẻ em", lambda i: i.kind == "suggest" and i.not_spicy),
        ("món ăn tối cho bé", lambda i: i.not_spicy and i.meal == "toi"),
        ("nấu cho 4 người", lambda i: i.kind == "suggest" and i.servings == 4),
        ("món không cay", lambda i: i.kind == "suggest" and i.not_spicy),
        ("tôi có trứng và cà chua", lambda i: set(i.include) == {"trung", "ca chua"}),
        ("nấu nhanh dưới 30 phút", lambda i: i.max_minutes == 30),
        ("món canh miền Nam", lambda i: "Món canh" in i.categories and i.regions == {"Nam"}),
        ("món xào cho bữa trưa", lambda i: "xao" in i.methods and i.meal == "trua"),
    ],
)
def test_parse_intent_respects_common_requests(message: str, check: Any) -> None:
    assert check(engine.parse_intent(message, []))


def test_seafood_ban_filters_shrimp_dishes(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    seed_recipes(database_session_factory)
    with database_session_factory() as session:
        catalog = engine.load_catalog(session)
    intent = engine.parse_intent("kiêng hải sản, gợi ý món canh", catalog)
    picks, _ = engine.pick_recipes(intent, catalog, limit=10)
    assert all(not any(engine._contains(entry, w) for w in engine.SEAFOOD) for entry in picks)


def test_seed_documents_are_idempotent_and_indexed(
    database_session_factory: sessionmaker[Session], tmp_path: Path
) -> None:
    files = seed.load_seed_documents()
    assert 6 <= len(files) <= 10
    assert all(item.file_name.startswith("seed:") and item.text for item in files)
    with database_session_factory() as session:
        assert seed.seed_knowledge_documents(session) == len(files)
        assert seed.seed_knowledge_documents(session) == 0
        # Quản trị viên tắt một tài liệu: lần nạp sau không bật lại, không thêm bản trùng.
        first = session.scalars(select(AssistantKnowledgeDocument)).first()
        assert first is not None and first.source == "note"
        first.active = False
        session.commit()
        assert seed.seed_knowledge_documents(session) == 0
        total = session.scalars(select(AssistantKnowledgeDocument)).all()
        assert len(total) == len(files)

        knowledge.sync_documents(session)
        doc_chunks = session.scalars(
            select(AssistantKnowledgeChunk).where(AssistantKnowledgeChunk.source_type == "doc")
        ).all()
        assert doc_chunks
        assert all(chunk.source_key != str(first.id) for chunk in doc_chunks)

    extra = tmp_path / "moi.md"
    extra.write_text("# Tài liệu mới\n\nNội dung mới.", encoding="utf-8")
    with database_session_factory() as session:
        assert seed.seed_knowledge_documents(session, tmp_path) == 1


@pytest.mark.parametrize(
    ("question", "title"),
    [
        ("Cài ứng dụng Bếp Việt trên iPhone thế nào?", "Hướng dẫn sử dụng"),
        ("Điều khoản sử dụng quy định tài khoản bao nhiêu tuổi?", "Tóm tắt Điều khoản"),
        ("Món đặc trưng ẩm thực miền Trung là gì?", "ẩm thực ba miền"),
    ],
)
def test_seed_documents_answer_site_questions_without_ai(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    question: str,
    title: str,
) -> None:
    with database_session_factory() as session:
        seed.seed_knowledge_documents(session)
        knowledge.sync_documents(session)
    rag.reset_index_cache()
    with database_session_factory() as session:
        hits = rag.retrieve(session, question, use_vectors=False)
    assert hits and any(title in hit.chunk.title for hit in hits[:3]), [h.chunk.title for h in hits]


def test_weather_falls_back_to_wttr_when_open_meteo_is_rate_limited(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    weather.reset_cache()
    wttr = {
        "current_condition": [
            {
                "temp_C": "19",
                "FeelsLikeC": "20",
                "humidity": "81",
                "precipMM": "0.0",
                "weatherCode": "296",
                "windspeedKmph": "6",
            }
        ],
        "weather": [
            {"maxtempC": "25", "mintempC": "17", "hourly": [{"chanceofrain": "70"}]}
        ],
    }

    def fake_get(url: str, *, params: dict[str, Any], timeout: float) -> httpx.Response:
        request = httpx.Request("GET", url)
        if url == weather.FORECAST_URL:
            return httpx.Response(429, json={"error": True}, request=request)
        return httpx.Response(200, json=wttr, request=request)

    monkeypatch.setattr(weather.httpx, "get", fake_get)
    found = weather.lookup("Thời tiết Hà Nội hôm nay thế nào?")
    assert found.report is not None
    assert found.report.source == "wttr.in"
    assert found.report.temperature == 19
    assert found.report.rain_chance == 70
    assert "19°C" in weather.facts(found.report)
