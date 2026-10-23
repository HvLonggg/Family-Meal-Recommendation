import json
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session, sessionmaker

from app.modules.assistant import ai, engine, knowledge, rag
from app.modules.assistant.models import AssistantMessage
from tests.helpers import register_and_login
from tests.test_assistant import _ai_settings, seed

VN = ZoneInfo("Asia/Ho_Chi_Minh")


def events(response: httpx.Response) -> list[tuple[str, dict[str, Any]]]:
    parsed: list[tuple[str, dict[str, Any]]] = []
    for block in response.text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        parsed.append((lines["event"], json.loads(lines["data"])))
    return parsed


def stream(client: TestClient, message: str, **kwargs: Any) -> httpx.Response:
    return client.post(
        "/api/v1/assistant/chat/stream",
        json={"message": message, **kwargs.pop("json", {})},
        **kwargs,
    )


def test_stream_sends_text_as_it_is_written_then_saves_the_reply(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    seen: dict[str, Any] = {}

    def fake_stream(**kwargs: Any) -> Iterator[str]:
        seen.update(kwargs)
        yield "Trưa nay thử "
        yield "**Canh chua cá** nhé"
        yield " [1]!"

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "stream_reply", fake_stream)
    headers = register_and_login(client, "stream@example.com")
    response = stream(client, "Trưa nay ăn gì?", headers=headers)
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/event-stream")
    assert response.headers["x-accel-buffering"] == "no"

    sequence = events(response)
    assert [name for name, _ in sequence] == ["start", "delta", "delta", "delta", "done"]
    assert "".join(data["text"] for name, data in sequence if name == "delta").startswith(
        "Trưa nay thử"
    )
    done = sequence[-1][1]
    reply = done["reply"]
    assert reply["mode"] == "ai"
    assert "[1]" not in reply["content"]  # chú thích nguồn được tách ra khỏi nội dung
    assert [card["slug"] for card in reply["recipes"]] == ["canh-chua-ca"]
    # AI biết giờ Việt Nam để gợi ý đúng bữa.
    assert seen["moment"].startswith("<thoi_diem>Bây giờ là")

    with database_session_factory() as session:
        saved = session.scalars(
            select(AssistantMessage).order_by(AssistantMessage.created_at)
        ).all()
        assert [item.role for item in saved] == ["user", "assistant"]
        assert str(saved[0].conversation_id) == done["conversation_id"]

    # Lượt sau trong cùng cuộc trò chuyện vẫn nối đúng lịch sử.
    follow = stream(
        client,
        "Còn món nào khác?",
        headers=headers,
        json={"conversation_id": done["conversation_id"]},
    )
    assert events(follow)[-1][1]["conversation_id"] == done["conversation_id"]
    assert len(seen["history"]) == 2


def test_stream_answers_instantly_without_ai_and_falls_back_when_ai_is_silent(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    monkeypatch.setattr(ai, "ai_enabled", lambda: False)
    local = events(stream(client, "Tối nay ăn gì?"))
    assert [name for name, _ in local] == ["done"]
    assert local[0][1]["reply"]["mode"] == "local" and local[0][1]["conversation_id"] is None

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "stream_reply", lambda **_: iter(()))
    fallback = events(stream(client, "Tối nay ăn gì?"))
    assert fallback[-1][0] == "done"
    assert fallback[-1][1]["reply"]["mode"] == "local"
    assert fallback[-1][1]["reply"]["recipes"]


def test_stream_errors_before_opening_and_hides_failures_inside(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    seed(database_session_factory)
    headers = register_and_login(client, "stream-err@example.com")
    missing = stream(
        client,
        "Chào",
        headers=headers,
        json={"conversation_id": "0f8fad5b-d9cb-469f-a165-70867728950e"},
    )
    assert missing.status_code == 404

    def broken(**_: Any) -> Iterator[str]:
        yield "Đang"
        raise RuntimeError("secret internal detail")

    monkeypatch.setattr(ai, "ai_enabled", lambda: True)
    monkeypatch.setattr(ai, "stream_reply", broken)
    sequence = events(stream(client, "Tối nay ăn gì?"))
    assert sequence[-1] == ("error", {"message": "Đã có lỗi xảy ra. Vui lòng thử lại."})
    assert "secret" not in json.dumps(sequence)


class FakeStream:
    def __init__(self, status: int, lines: list[str]) -> None:
        self.status_code = status
        self._lines = lines

    def iter_lines(self) -> Iterator[str]:
        yield from self._lines


def test_gemini_stream_parses_sse_and_switches_model_when_busy(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls: list[tuple[str, dict[str, Any]]] = []

    def chunk(text: str, finish: str | None = None, thought: bool = False) -> str:
        candidate: dict[str, Any] = {"content": {"parts": [{"text": text, "thought": thought}]}}
        if finish:
            candidate["finishReason"] = finish
        return "data: " + json.dumps({"candidates": [candidate]})

    @contextmanager
    def fake_stream(method: str, url: str, **kwargs: Any) -> Iterator[FakeStream]:
        model = url.split("/models/")[1].split(":")[0]
        calls.append((model, kwargs["json"]))
        if len(calls) == 1:
            yield FakeStream(503, [])
            return
        yield FakeStream(
            200,
            [
                chunk("(nghĩ thầm)", thought=True),
                "",
                chunk("Trưa nay "),
                ": keep-alive",
                chunk("ăn phở nhé!", finish="STOP"),
            ],
        )

    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    monkeypatch.setattr(ai, "active_provider", lambda: "gemini")
    monkeypatch.setattr(ai.httpx, "stream", fake_stream)
    parts = list(
        ai.stream_reply(
            message="Trưa nay ăn gì?",
            history=[],
            candidates=[],
            attachments=[],
            language="vi",
            knowledge="",
            memories="",
            persona="",
            moment="<thoi_diem/>",
        )
    )
    assert parts == ["Trưa nay ", "ăn phở nhé!"]
    assert [model for model, _ in calls] == ["gemini-flash-latest", "gemini-flash-lite-latest"]
    flash, lite = (body["generationConfig"] for _, body in calls)
    # Tắt "suy nghĩ" để trả lời tức thì; bản lite không nhận tham số này.
    assert flash["thinkingConfig"] == {"thinkingBudget": 0}
    assert "thinkingConfig" not in lite
    system = [part["text"] for part in calls[0][1]["systemInstruction"]["parts"]]
    assert "<thoi_diem/>" in system


def test_gemini_stream_stops_quietly_on_network_error(monkeypatch: pytest.MonkeyPatch) -> None:
    @contextmanager
    def failing(*_: Any, **__: Any) -> Iterator[FakeStream]:
        raise httpx.ConnectError("down")
        yield FakeStream(200, [])  # pragma: no cover

    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    monkeypatch.setattr(ai, "active_provider", lambda: "gemini")
    monkeypatch.setattr(ai.httpx, "stream", failing)
    assert (
        list(
            ai.stream_reply(
                message="Chào",
                history=[],
                candidates=[],
                attachments=[],
                language="vi",
                knowledge="",
                memories="",
                persona="",
                moment="",
            )
        )
        == []
    )


@pytest.mark.parametrize(
    ("hour", "minute", "part", "meal"),
    [
        (6, 30, "sang", "sang"),
        (9, 59, "sang", "sang"),
        (10, 0, "sang", "sang"),
        (10, 30, "trua", "trua"),
        (12, 15, "trua", "trua"),
        (15, 0, "chieu", "toi"),
        (18, 30, "toi", "toi"),
        (21, 30, "khuya", "an nhe"),
        (2, 0, "khuya", "an nhe"),
    ],
)
def test_day_part_follows_vietnam_time(hour: int, minute: int, part: str, meal: str) -> None:
    now = datetime(2026, 10, 22, hour, minute, tzinfo=VN)
    assert engine.day_part(now) == part
    assert engine.current_meal(now) == meal


def test_day_part_converts_from_other_time_zones() -> None:
    # 05:00 UTC là 12:00 trưa ở Việt Nam.
    utc_noon_vn = datetime(2026, 10, 22, 5, 0, tzinfo=ZoneInfo("UTC"))
    assert engine.day_part(utc_noon_vn) == "trua"
    block = engine.moment_block(utc_noon_vn)
    assert "12:00 Thứ Năm 22/10/2026 (giờ Việt Nam), buổi trưa" in block
    assert "bữa trưa" in block


def test_query_embedding_pauses_after_quota_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []

    def quota(*_: Any, **__: Any) -> httpx.Response:
        calls.append(1)
        return httpx.Response(429, json={})

    monkeypatch.setattr(knowledge, "embedding_model", lambda: "gemini-embedding-2")
    monkeypatch.setattr(knowledge, "_gemini_key", lambda: "<test-key>")
    monkeypatch.setattr(knowledge.httpx, "post", quota)
    assert not knowledge.query_embedding_paused()
    assert knowledge.embed_texts(["phở"], query=True) is None
    assert knowledge.query_embedding_paused()
    assert rag.QUERY_EMBED_TIMEOUT <= 3
    # Đồng bộ tài liệu (không phải câu hỏi) không làm tạm dừng embedding câu hỏi.
    knowledge.reset_sync_state()
    knowledge.embed_texts(["tài liệu"], query=False)
    assert not knowledge.query_embedding_paused()
    assert len(calls) == 2


def test_slow_model_is_skipped_for_a_fast_one_and_paused(monkeypatch: pytest.MonkeyPatch) -> None:
    import threading
    import time

    calls: list[str] = []
    hang = threading.Event()

    @contextmanager
    def fake_stream(method: str, url: str, **kwargs: Any) -> Iterator[FakeStream]:
        model = url.split("/models/")[1].split(":")[0]
        calls.append(model)
        if model == "gemini-flash-latest":
            # Google xếp hàng: không trả về gì (kể cả header) cho tới khi test kết thúc.
            hang.wait(5)
            raise httpx.ReadTimeout("queued")
        yield FakeStream(
            200, ['data: {"candidates": [{"content": {"parts": [{"text": "Nhanh!"}]}}]}']
        )

    monkeypatch.setattr(ai, "FIRST_CHUNK_TIMEOUT", 0.3)
    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    monkeypatch.setattr(ai, "active_provider", lambda: "gemini")
    monkeypatch.setattr(ai.httpx, "stream", fake_stream)
    kwargs: dict[str, Any] = dict(
        message="Chào",
        history=[],
        candidates=[],
        attachments=[],
        language="vi",
        knowledge="",
        memories="",
        persona="",
        moment="",
    )
    try:
        started = time.monotonic()
        assert list(ai.stream_reply(**kwargs)) == ["Nhanh!"]
        # Hạn chót tính theo đồng hồ thật: không phải chờ model treo hết timeout của httpx.
        assert time.monotonic() - started < 2
        assert calls == ["gemini-flash-latest", "gemini-flash-lite-latest"]
        # Lượt sau đi thẳng tới model nhanh, không chờ lại model đang chậm.
        calls.clear()
        assert list(ai.stream_reply(**kwargs)) == ["Nhanh!"]
        assert calls == ["gemini-flash-lite-latest"]
    finally:
        hang.set()
    ai.reset_model_pauses()
    assert ai._gemini_models()[0] == "gemini-flash-latest"


def test_cache_serves_the_old_value_while_rebuilding_in_background(
    monkeypatch: pytest.MonkeyPatch, database_session_factory: sessionmaker[Session]
) -> None:
    import threading
    from types import SimpleNamespace

    from app.modules.assistant import warm_cache

    monkeypatch.setattr(warm_cache, "get_settings", lambda: SimpleNamespace(app_env="development"))
    cache: warm_cache.StaleWhileRevalidate[str] = warm_cache.StaleWhileRevalidate("demo")
    release = threading.Event()
    built: list[str] = []

    def slow_build(_: Session) -> str:
        release.wait(5)
        built.append("v2")
        return "v2"

    with database_session_factory() as session:
        assert cache.get(session, 1, lambda _: "v1") == "v1"  # chưa có gì: dựng ngay
        # Dữ liệu đổi: trả bản cũ tức thì, bản mới dựng ở nền.
        assert cache.get(session, 2, slow_build) == "v1"
        assert cache.get(session, 2, slow_build) == "v1"  # không dựng trùng lần hai
        release.set()
        for _ in range(50):
            if built:
                break
            threading.Event().wait(0.05)
        threading.Event().wait(0.05)
        assert cache.get(session, 2, slow_build) == "v2"
    assert built == ["v2"]
