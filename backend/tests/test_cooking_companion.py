from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.modules.assistant import ai
from app.modules.cooking import companion
from tests.helpers import register_and_login

URL = "/api/v1/cooking/assistant"


def body(utterance: str, **overrides: Any) -> dict[str, Any]:
    return {
        "utterance": utterance,
        "recipe_name": "Canh chua cá",
        "servings": 4,
        "ingredients": ["Cá lóc: 500 g", "Me chua: 40 g"],
        "steps": [
            {"kind": "ingredients", "text": "Canh chua cá"},
            {"kind": "preparation", "text": "Ngâm me với nước ấm 15 phút rồi lọc lấy nước."},
            {"kind": "cooking", "text": "Ninh xương cá với lửa nhỏ 30 phút."},
            {"kind": "finish", "text": "Nêm lại cho vừa ăn."},
        ],
        "step_index": 2,
        "timers": [{"label": "Ngâm me", "remaining_seconds": 0}],
        "history": [{"role": "assistant", "content": "Bước 2: ninh xương cá."}],
        **overrides,
    }


@pytest.fixture
def headers(client: TestClient) -> dict[str, str]:
    return register_and_login(client, "companion@example.com")


def fake_ai(monkeypatch: pytest.MonkeyPatch, result: dict[str, Any] | None) -> dict[str, Any]:
    seen: dict[str, Any] = {}

    def generate_json(**kwargs: Any) -> dict[str, Any] | None:
        seen.update(kwargs)
        return result

    monkeypatch.setattr(ai, "generate_json", generate_json)
    return seen


def test_companion_understands_and_returns_a_safe_action(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen = fake_ai(
        monkeypatch,
        {
            "reply": "**Ok** nha, mình canh 30 phút cho nồi xương!",
            "action": "set_timer",
            "seconds": 1800,
            "label": "Ninh xương cá",
            "topic": "cooking",
        },
    )
    response = client.post(URL, json=body("nhắc mình khi ninh xong nhé"), headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["handled"] is True and data["off_topic"] is False
    assert data["reply"] == "Ok nha, mình canh 30 phút cho nồi xương!"  # bỏ markdown
    assert data["action"] == {
        "type": "set_timer",
        "seconds": 1800,
        "step": None,
        "label": "Ninh xương cá",
        "mode": None,
        "timer_id": None,
        "all_timers": False,
    }
    # AI thấy đủ bối cảnh: bước đang làm, chuông đang kêu, giờ Việt Nam, lời người dùng.
    prompt = seen["prompt"]
    assert "3. [cooking] Ninh xương cá với lửa nhỏ 30 phút. ← ĐANG LÀM" in prompt
    assert "Ngâm me: ĐANG KÊU" in prompt
    assert "<thoi_diem>" in prompt
    assert "<loi_nguoi_dung>nhắc mình khi ninh xong nhé</loi_nguoi_dung>" in prompt
    assert seen["history"] == [("assistant", "Bước 2: ninh xương cá.")]


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ({"action": "goto", "step": 2}, {"type": "goto", "step": 1, "seconds": None}),
        ({"action": "goto", "step": 99}, {"type": "none", "step": None, "seconds": None}),
        ({"action": "set_timer", "seconds": 2}, {"type": "none", "step": None, "seconds": None}),
        ({"action": "set_timer"}, {"type": "none", "step": None, "seconds": None}),
        ({"action": "snooze_timer"}, {"type": "snooze_timer", "step": None, "seconds": 300}),
        ({"action": "delete_everything"}, {"type": "none", "step": None, "seconds": None}),
        # Chuông "Ngâm me" trong mẫu đang kêu: "xong rồi" nghĩa là tắt chuông trước.
        ({"action": "next", "seconds": 60}, {"type": "stop_timer", "step": None, "seconds": None}),
    ],
)
def test_companion_never_trusts_unsafe_actions(
    client: TestClient,
    headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    raw: dict[str, Any],
    expected: dict[str, Any],
) -> None:
    fake_ai(monkeypatch, {"reply": "Được nè.", "topic": "cooking", **raw})
    action = client.post(URL, json=body("ờ"), headers=headers).json()["action"]
    assert {key: action[key] for key in expected} == expected


def test_companion_redirects_off_topic_and_falls_back_without_ai(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_ai(
        monkeypatch,
        {
            "reply": "Chuyện bóng đá để lát nha, nồi canh đang sôi kìa!",
            "action": "none",
            "topic": "off_topic",
        },
    )
    data = client.post(URL, json=body("tối qua đội nào thắng?"), headers=headers).json()
    assert data["handled"] and data["off_topic"] and data["action"]["type"] == "none"

    fake_ai(monkeypatch, None)  # AI tắt hoặc lỗi
    assert client.post(URL, json=body("xong rồi"), headers=headers).json() == {
        "handled": False,
        "reply": "",
        "action": {
            "type": "none",
            "seconds": None,
            "step": None,
            "label": None,
            "mode": None,
            "timer_id": None,
            "all_timers": False,
        },
        "off_topic": False,
    }


def test_companion_requires_login_and_valid_input(
    client: TestClient, headers: dict[str, str]
) -> None:
    assert client.post(URL, json=body("xong rồi")).status_code == 401
    too_long = client.post(URL, json=body("a" * 501), headers=headers)
    assert too_long.status_code == 422
    no_steps = client.post(URL, json=body("xong", steps=[]), headers=headers)
    assert no_steps.status_code == 422


def test_gemini_json_uses_schema_and_fast_model(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    from tests.test_assistant import _ai_settings

    sent: list[dict[str, Any]] = []

    def fake_post(url: str, **kwargs: Any) -> httpx.Response:
        sent.append({"url": url, **kwargs})
        return httpx.Response(
            200,
            json={
                "candidates": [
                    {
                        "finishReason": "STOP",
                        "content": {"parts": [{"text": '{"reply": "Ok!", "action": "next"}'}]},
                    }
                ]
            },
        )

    monkeypatch.setattr(ai, "get_settings", lambda: _ai_settings())
    monkeypatch.setattr(ai, "active_provider", lambda: "gemini")
    monkeypatch.setattr(ai.httpx, "post", fake_post)
    result = ai.generate_json(system="s", prompt="p", schema=companion.SCHEMA)
    assert result == {"reply": "Ok!", "action": "next"}
    config = sent[0]["json"]["generationConfig"]
    assert config["responseMimeType"] == "application/json"
    assert config["responseSchema"] is companion.SCHEMA
    assert config["thinkingConfig"] == {"thinkingBudget": 0}
    assert sent[0]["timeout"] == ai.JSON_TIMEOUT  # model đầu phải trả lời nhanh


@pytest.mark.parametrize(
    ("utterance", "overrides", "raw", "expected"),
    [
        # Người dùng nói rõ thời lượng: luôn đúng số đó dù AI "tự chỉnh".
        (
            "hẹn giờ một tiếng rưỡi",
            {},
            {"action": "set_timer", "seconds": 300},
            ("set_timer", 5400),
        ),
        ("hen gio 8 phut", {}, {"action": "set_timer", "seconds": 300}, ("set_timer", 480)),
        (
            "nhắc mình sau nửa tiếng",
            {},
            {"action": "set_timer", "seconds": 60},
            ("set_timer", 1800),
        ),
        # Không nói thời lượng: chỉ nhận số ghi trong bước, không tự bịa.
        (
            "nhắc mình khi ninh xong",
            {},
            {"action": "set_timer", "seconds": 1800},
            ("set_timer", 1800),
        ),
        (
            "nhắc mình nhé",
            {"step_index": 0},
            {"action": "set_timer", "seconds": 300},
            ("none", None),
        ),
        # Chưa tới cuối món thì không được kết thúc cả món.
        ("nấu xong rồi", {"step_index": 1, "timers": []}, {"action": "finish"}, ("next", None)),
        ("nấu xong rồi", {"step_index": 3, "timers": []}, {"action": "finish"}, ("finish", None)),
        # Không có chuông thì không có gì để tắt/hoãn.
        ("tắt đi", {"timers": []}, {"action": "stop_timer"}, ("none", None)),
    ],
)
def test_companion_guards_ai_decisions(
    client: TestClient,
    headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    utterance: str,
    overrides: dict[str, Any],
    raw: dict[str, Any],
    expected: tuple[str, int | None],
) -> None:
    fake_ai(monkeypatch, {"reply": "Được nè.", "topic": "cooking", **raw})
    action = client.post(URL, json=body(utterance, **overrides), headers=headers).json()["action"]
    assert (action["type"], action["seconds"]) == expected


@pytest.mark.parametrize(
    ("text", "seconds"),
    [
        ("hẹn giờ 15 phút", 900),
        ("một tiếng rưỡi", 5400),
        ("1 tiếng 30 phút", 5400),
        ("hai mươi lăm phút", 1500),
        ("mười lăm giây", 15),
        ("nửa tiếng", 1800),
        ("set a timer for ten minutes", 600),
        ("tạm dừng nhé", None),
        ("năm nay nấu canh", None),
    ],
)
def test_spoken_durations(text: str, seconds: int | None) -> None:
    from app.modules.cooking import durations

    assert durations.spoken_seconds(text) == seconds


def test_step_durations_include_ranges() -> None:
    from app.modules.cooking import durations

    assert durations.step_seconds("Thả cá vào, nấu lửa vừa 8-10 phút") == {480, 600}
    assert durations.step_seconds("Ngâm me 15 phút, đun 1,5 lít nước") == {900}


def test_reply_matches_the_guarded_action_when_alarm_is_ringing(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    fake_ai(monkeypatch, {"reply": "Giờ mình sang bước kế nha.", "action": "next"})
    ringing = body("xong rồi", timers=[{"label": "Ngâm me", "remaining_seconds": 0}])
    data = client.post(URL, json=ringing, headers=headers).json()
    assert data["action"]["type"] == "stop_timer"
    assert "tắt chuông" in data["reply"] and "sang bước kế nha" not in data["reply"]


# --- Hẹn giờ nói đa dạng: thêm/bớt/đổi/hủy chuông, giờ tuyệt đối --------------------------------
TWO_TIMERS = [
    {"id": "egg", "label": "Luộc trứng", "remaining_seconds": 300},
    {"id": "bone", "label": "Hầm xương", "remaining_seconds": 420},
]


@pytest.mark.parametrize(
    ("utterance", "overrides", "raw", "expected"),
    [
        # Thêm/bớt/đổi: số giây lấy từ lời nói, ý định đọc từ lời nói (AI nói sai mode vẫn đúng).
        (
            "thêm 5 phút cho nồi xương",
            {"timers": TWO_TIMERS},
            {"action": "adjust_timer", "timer": 2, "mode": "set", "seconds": 60},
            ("adjust_timer", 300, "add", "bone"),
        ),
        (
            "bớt 3 phút luộc trứng",
            {"timers": TWO_TIMERS},
            {"action": "adjust_timer", "timer": 1, "seconds": 180},
            ("adjust_timer", 180, "subtract", "egg"),
        ),
        (
            "đổi thành 20 phút",
            {"timers": TWO_TIMERS[:1]},
            {"action": "adjust_timer", "mode": "set", "seconds": 1200},
            ("adjust_timer", 1200, "set", "egg"),
        ),
        # Nhiều chuông mà AI không chỉ rõ chuông nào: không đoán.
        (
            "thêm 5 phút",
            {"timers": TWO_TIMERS},
            {"action": "adjust_timer", "mode": "add", "seconds": 300},
            ("none", None, None, None),
        ),
        # Không nói lượng thêm/bớt: hỏi lại thay vì tự bịa.
        (
            "thêm chút nữa cho nồi xương",
            {"timers": TWO_TIMERS},
            {"action": "adjust_timer", "timer": 2, "mode": "add", "seconds": 600},
            ("none", None, None, None),
        ),
        # Bớt quá thời gian còn lại.
        (
            "bớt 10 phút luộc trứng",
            {"timers": TWO_TIMERS},
            {"action": "adjust_timer", "timer": 1, "mode": "subtract"},
            ("none", None, None, None),
        ),
        # Chuông đang kêu + "thêm 5 phút" là hoãn chuông.
        (
            "thêm 5 phút nữa",
            {},
            {"action": "adjust_timer", "mode": "add"},
            ("snooze_timer", 300, None, None),
        ),
        # Không có chuông thì không có gì để chỉnh/hủy.
        (
            "hủy hẹn giờ",
            {"timers": []},
            {"action": "cancel_timer", "all": True},
            ("none", None, None, None),
        ),
        (
            "bỏ chuông luộc trứng",
            {"timers": TWO_TIMERS},
            {"action": "cancel_timer", "timer": 1},
            ("cancel_timer", None, None, "egg"),
        ),
        (
            "hủy hẹn giờ",
            {"timers": TWO_TIMERS},
            {"action": "cancel_timer", "timer": 9},
            ("none", None, None, None),
        ),
        # Giờ tuyệt đối: tính theo giờ máy người dùng (18:00 → 19:30 là 5400 giây).
        (
            "báo mình lúc 19h30 nhé",
            {"local_seconds": 18 * 3600},
            {"action": "set_timer", "seconds": 999},
            ("set_timer", 5400, None, None),
        ),
        # Đã qua 7 giờ tối thì hẹn 7 giờ tối mai.
        (
            "báo mình lúc 7 giờ tối",
            {"local_seconds": 20 * 3600},
            {"action": "set_timer"},
            ("set_timer", 23 * 3600, None, None),
        ),
        # Không có giờ máy người dùng thì không tự tính giờ tuyệt đối.
        (
            "báo mình lúc 7 giờ tối",
            {"step_index": 0},
            {"action": "set_timer", "seconds": 600},
            ("none", None, None, None),
        ),
        # Nhiều chuông trong một câu: AI chọn một trong các số đã nói.
        (
            "hẹn 10 phút luộc trứng và 25 phút hầm xương",
            {},
            {"action": "set_timer", "seconds": 1500, "label": "Hầm xương"},
            ("set_timer", 1500, None, None),
        ),
    ],
)
def test_companion_guards_timer_changes(
    client: TestClient,
    headers: dict[str, str],
    monkeypatch: pytest.MonkeyPatch,
    utterance: str,
    overrides: dict[str, Any],
    raw: dict[str, Any],
    expected: tuple[str, int | None, str | None, str | None],
) -> None:
    fake_ai(monkeypatch, {"reply": "Xong nè.", "topic": "cooking", **raw})
    data = client.post(URL, json=body(utterance, **overrides), headers=headers).json()
    action = data["action"]
    assert (action["type"], action["seconds"], action["mode"], action["timer_id"]) == expected


def test_companion_asks_which_timer_and_cancels_all(
    client: TestClient, headers: dict[str, str], monkeypatch: pytest.MonkeyPatch
) -> None:
    seen = fake_ai(monkeypatch, {"reply": "Đã thêm rồi nhé!", "action": "adjust_timer"})
    data = client.post(URL, json=body("thêm 5 phút", timers=TWO_TIMERS), headers=headers).json()
    # Lời nói khớp việc thật: không nói "đã thêm" khi chưa chỉnh chuông nào.
    assert data["action"]["type"] == "none"
    assert data["reply"] == "Bạn muốn mình chỉnh chuông nào: Luộc trứng, Hầm xương?"
    assert "- #2 Hầm xương: còn 420 giây" in seen["prompt"]

    fake_ai(monkeypatch, {"reply": "Đã xóa hết.", "action": "cancel_timer", "all": True})
    data = client.post(URL, json=body("xóa hết hẹn giờ", timers=TWO_TIMERS), headers=headers).json()
    assert data["action"]["type"] == "cancel_timer" and data["action"]["all_timers"] is True

    seen = fake_ai(monkeypatch, {"reply": "Ok.", "action": "none"})
    client.post(URL, json=body("mấy giờ rồi", local_seconds=19 * 3600 + 5 * 60), headers=headers)
    assert "Giờ trên máy người dùng: 19:05" in seen["prompt"]


def test_companion_rejects_bad_timer_context(client: TestClient, headers: dict[str, str]) -> None:
    bad_time = client.post(URL, json=body("xong", local_seconds=86_400), headers=headers)
    assert bad_time.status_code == 422
    long_id = [{"id": "x" * 65, "label": "A", "remaining_seconds": 10}]
    assert client.post(URL, json=body("xong", timers=long_id), headers=headers).status_code == 422


@pytest.mark.parametrize(
    ("text", "seconds"),
    [
        ("hẹn 10p", 600),
        ("10 phút nữa gọi mình", 600),
        ("canh giùm mình 15 phút", 900),
        ("1 tiếng 15", 4500),
        ("một tiếng mười lăm phút", 4500),
        ("nhắc mình sau mười phút", 600),
        ("nhac minh sau muoi phut", 600),
        ("hen gio hai muoi lam phut", 1500),
        ("remind me in half an hour", 1800),
        ("báo mình lúc 7 giờ tối", None),
        ("lúc 19h30", None),
        ("bay gio hen 5 phut", 300),
    ],
)
def test_more_spoken_durations(text: str, seconds: int | None) -> None:
    from app.modules.cooking import durations

    assert durations.spoken_seconds(text) == seconds


@pytest.mark.parametrize(
    ("text", "now", "seconds"),
    [
        ("báo mình lúc 7 giờ tối", 18 * 3600, 3600),
        ("lúc 19h30", 18 * 3600, 5400),
        ("at 7 pm", 18 * 3600 + 600, 3000),
        ("lúc 7 giờ sáng", 18 * 3600, 13 * 3600),  # sáng mai
        ("lúc 6 giờ", 18 * 3600 + 600, 12 * 3600 - 600),  # 18:00 đã qua → 6 giờ sáng mai
        ("hẹn 10 phút", 18 * 3600, None),
    ],
)
def test_clock_seconds_use_the_device_time(text: str, now: int, seconds: int | None) -> None:
    from app.modules.cooking import durations

    assert durations.clock_seconds(text, now) == seconds
