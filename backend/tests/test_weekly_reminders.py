import re
from datetime import UTC, datetime, timedelta
from email.message import EmailMessage

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings, get_settings
from app.modules.account.preferences import read_preferences
from app.modules.auth import email as auth_email
from app.modules.auth.email import EmailDeliveryError, send_security_notification
from app.modules.auth.models import User
from app.modules.planner.models import UserMealPlanItem
from app.modules.recipes.models import Recipe
from app.modules.reminders.weekly import (
    coming_monday,
    make_unsubscribe_token,
    read_unsubscribe_token,
    send_weekly_reminders,
)

CRON_SECRET = "test-cron-secret-0123456789-not-real"
ENDPOINT = "/api/v1/internal/reminders/weekly"
UNSUBSCRIBE_ENDPOINT = "/api/v1/reminders/weekly/unsubscribe"


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> list[EmailMessage]:
    """Email thật đi qua toàn bộ template, nhưng bước gửi SMTP được thay bằng hộp thư giả."""
    monkeypatch.setenv("BEP_VIET_EMAIL_PROVIDER", "smtp")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_HOST", "smtp.test.invalid")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_USERNAME", "sender@test.invalid")
    monkeypatch.setenv("BEP_VIET_EMAIL_SMTP_PASSWORD", "not-a-real-password")
    monkeypatch.setenv("BEP_VIET_EMAIL_FROM_ADDRESS", "sender@test.invalid")
    monkeypatch.setenv("BEP_VIET_CRON_SECRET", CRON_SECRET)
    get_settings.cache_clear()
    messages: list[EmailMessage] = []
    monkeypatch.setattr(auth_email, "_send_via_smtp", messages.append)
    return messages


def add_user(
    factory: sessionmaker[Session],
    email: str | None,
    *,
    verified: bool = True,
    preferences: dict[str, object] | None = None,
    status: str = "active",
    name: str = "Nguyễn Ngọc Lan",
) -> User:
    with factory() as session:
        user = User(
            email=email,
            full_name=name,
            password_hash="test-hash",
            status=status,
            email_verified_at=datetime(2026, 1, 1, tzinfo=UTC) if verified else None,
            preferences=preferences or {},
        )
        session.add(user)
        session.commit()
        return user


def call_cron(client: TestClient, secret: str | None = CRON_SECRET, **params: int) -> dict:
    headers = {"X-Cron-Secret": secret} if secret is not None else {}
    response = client.post(ENDPOINT, headers=headers, params=params)
    assert response.status_code == 200, response.text
    body: dict = response.json()
    return body


def body_of(message: EmailMessage, kind: str) -> str:
    part = message.get_body(preferencelist=(kind,))
    assert part is not None
    content = part.get_content()
    assert isinstance(content, str)
    return content


def recipients(outbox: list[EmailMessage]) -> list[str]:
    return sorted(str(message["To"]) for message in outbox)


def test_endpoint_is_disabled_until_a_cron_secret_is_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BEP_VIET_CRON_SECRET", "")
    get_settings.cache_clear()
    response = client.post(ENDPOINT, headers={"X-Cron-Secret": "anything"})
    assert response.status_code == 503
    assert response.json()["code"] == "CRON_DISABLED"

    # Người gọi không gửi header hoặc gửi header rỗng cũng không mở được endpoint.
    assert client.post(ENDPOINT, headers={"X-Cron-Secret": ""}).status_code == 503
    assert client.post(ENDPOINT).status_code == 503
    # Mặc định không đặt khóa nào: tắt.
    assert Settings.model_fields["cron_secret"].default is None


@pytest.mark.parametrize("secret", [None, "", "wrong-secret", "đúng-khóa-nhưng-có-dấu"])
def test_wrong_or_missing_secret_is_rejected_and_sends_nothing(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
    secret: str | None,
) -> None:
    add_user(database_session_factory, "lan@example.com")
    headers = {"X-Cron-Secret": secret.encode("utf-8")} if secret is not None else {}
    response = client.post(ENDPOINT, headers=headers)
    assert response.status_code == 401
    assert response.json()["code"] == "CRON_UNAUTHORIZED"
    assert outbox == []


def test_run_requires_email_delivery_to_be_configured(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("BEP_VIET_CRON_SECRET", CRON_SECRET)
    get_settings.cache_clear()
    response = client.post(ENDPOINT, headers={"X-Cron-Secret": CRON_SECRET})
    assert response.status_code == 503
    assert response.json()["code"] == "EMAIL_NOT_CONFIGURED"


def test_every_active_opted_in_email_account_receives_the_reminder(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
) -> None:
    add_user(database_session_factory, "ok@example.com")
    add_user(database_session_factory, "explicit-on@example.com", preferences={"language": "vi"})
    # Đăng ký bằng email là đủ, không cần đã xác minh.
    add_user(database_session_factory, "unverified@example.com", verified=False)
    add_user(
        database_session_factory,
        "opted-out@example.com",
        preferences={"weekly_reminder_email": False},
    )
    # Nút "Nhắc kế hoạch tuần" cũ đã tắt: vẫn được tôn trọng.
    add_user(
        database_session_factory,
        "legacy-off@example.com",
        preferences={"notify_weekly_plan": False},
    )
    add_user(database_session_factory, "locked@example.com", status="disabled")
    add_user(database_session_factory, None)

    result = call_cron(client)

    assert recipients(outbox) == [
        "explicit-on@example.com",
        "ok@example.com",
        "unverified@example.com",
    ]
    assert result["sent"] == 3
    assert result["failed"] == 0
    assert result["opted_out"] == 2
    assert result["has_more"] is False
    assert result["week_start"] == coming_monday(datetime.now(UTC)).isoformat()


def test_reminder_is_sent_once_per_week_and_again_the_next_week(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
) -> None:
    user = add_user(database_session_factory, "lan@example.com")

    first = call_cron(client)
    second = call_cron(client)
    assert (first["sent"], second["sent"]) == (1, 0)
    assert len(outbox) == 1

    monday = coming_monday(datetime.now(UTC))
    with database_session_factory() as session:
        stored = session.get(User, user.id)
        assert stored is not None
        assert stored.weekly_reminder_week == monday

        # Tuần sau (Chủ nhật kế tiếp) lại được gửi một email mới, rồi cũng không trùng.
        next_sunday = datetime.now(UTC) + timedelta(days=7)
        assert send_weekly_reminders(session, next_sunday).sent == 1
        assert send_weekly_reminders(session, next_sunday).sent == 0
    assert len(outbox) == 2


def make_recipe(slug: str, name: str) -> Recipe:
    return Recipe(
        slug=slug,
        name=name,
        excerpt="Món ngon, hợp bữa cơm nhà.",
        region="Bắc",
        category="Món mặn",
        difficulty="Dễ",
        prep_minutes=20,
        cook_minutes=40,
        base_servings=4,
        image_path=f"/images/recipes/edited/{slug}-1600.webp",
        image_alt=name,
        serving="Dùng nóng.",
        tip="Kho nhỏ lửa.",
        source_name="Bếp Việt",
        source_url=f"https://bepviet.example/{slug}",
        status="published",
    )


def test_email_has_cta_unsubscribe_and_settings_links_and_week_summary(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
) -> None:
    user = add_user(database_session_factory, "lan@example.com", name="Nguyễn <b>Lan</b>")
    monday = coming_monday(datetime.now(UTC))
    with database_session_factory() as session:
        recipe = make_recipe("ca-chep-kho-rieng", "Cá chép kho riềng")
        soup = make_recipe("canh-chua-ca", "Canh chua cá")
        session.add_all([recipe, soup])
        session.flush()
        for offset, meal_type, dish in [
            (0, "lunch", recipe),
            (0, "dinner", recipe),
            (0, "dinner", soup),  # hai món cùng một bữa chỉ tính một bữa
            (3, "dinner", recipe),
            (7, "lunch", recipe),  # ngoài tuần tới: không tính
        ]:
            session.add(
                UserMealPlanItem(
                    user_id=user.id,
                    recipe_id=dish.id,
                    plan_date=monday + timedelta(days=offset),
                    meal_type=meal_type,
                    servings=4,
                    completion_status="planned",
                )
            )
        session.commit()

    call_cron(client)

    assert len(outbox) == 1
    message = outbox[0]
    text = body_of(message, "plain")
    html = body_of(message, "html")
    week_label = f"{monday:%d/%m} – {monday + timedelta(days=6):%d/%m}"
    assert week_label in message["Subject"]
    assert "Bếp Việt" in message["Subject"]

    site = str(get_settings().frontend_url).rstrip("/")
    for body in (text, html):
        assert f"{site}/planner" in body
        assert f"{site}/account/settings" in body
        assert f"{site}/api/v1/reminders/weekly/unsubscribe?token=" in body
        assert "3/21" in body
    assert "Lên kế hoạch tuần tới" in html and "Lên kế hoạch tuần tới" in text
    assert "Hủy nhận email nhắc tuần" in html
    assert "Nguyễn <b>Lan</b>" not in html  # tên người dùng được escape
    assert "Nguyễn &lt;b&gt;Lan&lt;/b&gt;" in html

    unsubscribe = message["List-Unsubscribe"]
    assert unsubscribe.startswith(f"<{site}/api/v1/reminders/weekly/unsubscribe?token=")
    assert message["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"


def test_email_says_no_meals_planned_when_the_week_is_empty(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
) -> None:
    add_user(database_session_factory, "lan@example.com")
    call_cron(client)
    assert "chưa có bữa nào" in body_of(outbox[0], "plain")
    assert "chưa có bữa nào" in body_of(outbox[0], "html")


def unsubscribe_token_from(message: EmailMessage) -> str:
    match = re.search(r"unsubscribe\?token=([\w.\-]+)", body_of(message, "plain"))
    assert match is not None
    return match.group(1)


def test_unsubscribe_link_turns_the_preference_off_and_stops_future_emails(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
) -> None:
    user = add_user(database_session_factory, "lan@example.com")
    call_cron(client)
    token = unsubscribe_token_from(outbox[0])

    response = client.get(UNSUBSCRIBE_ENDPOINT, params={"token": token})
    assert response.status_code == 200
    assert "text/html" in response.headers["content-type"]
    assert "Đã hủy nhận email nhắc tuần" in response.text
    assert "unsafe-inline" in response.headers["content-security-policy"]
    assert "script" not in response.headers["content-security-policy"]

    with database_session_factory() as session:
        stored = session.get(User, user.id)
        assert stored is not None
        assert read_preferences(stored.preferences).weekly_reminder_email is False

    # Gọi lại vẫn thành công (idempotent) và POST một chạm (RFC 8058) cũng được.
    assert client.get(UNSUBSCRIBE_ENDPOINT, params={"token": token}).status_code == 200
    assert (
        client.post(
            UNSUBSCRIBE_ENDPOINT,
            params={"token": token},
            data={"List-Unsubscribe": "One-Click"},
        ).status_code
        == 200
    )

    outbox.clear()
    with database_session_factory() as session:
        next_week = datetime.now(UTC) + timedelta(days=7)
        assert send_weekly_reminders(session, next_week).sent == 0
    assert outbox == []


def test_unsubscribe_keeps_other_preferences_untouched(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    user = add_user(
        database_session_factory,
        "lan@example.com",
        preferences={"email_meal_plan_reminders": False, "manual_servings": 6},
    )
    response = client.get(UNSUBSCRIBE_ENDPOINT, params={"token": make_unsubscribe_token(user.id)})
    assert response.status_code == 200
    with database_session_factory() as session:
        stored = session.get(User, user.id)
        assert stored is not None
        preferences = read_preferences(stored.preferences)
        assert preferences.weekly_reminder_email is False
        assert preferences.email_meal_plan_reminders is False
        assert preferences.manual_servings == 6


def test_unsubscribe_rejects_invalid_or_tampered_tokens(
    client: TestClient, database_session_factory: sessionmaker[Session]
) -> None:
    victim = add_user(database_session_factory, "lan@example.com")
    other = add_user(database_session_factory, "minh@example.com")
    valid = make_unsubscribe_token(victim.id)
    forged_for_other = f"{other.id.hex}.{valid.split('.', 1)[1]}"

    for token in ["", "abc", "x.y", f"{victim.id.hex}.", f"{valid}0", forged_for_other]:
        response = client.get(UNSUBSCRIBE_ENDPOINT, params={"token": token})
        assert response.status_code == 400
        assert "Liên kết không hợp lệ" in response.text
    assert client.get(UNSUBSCRIBE_ENDPOINT).status_code == 400

    with database_session_factory() as session:
        for user in (victim, other):
            stored = session.get(User, user.id)
            assert stored is not None
            assert read_preferences(stored.preferences).weekly_reminder_email is True
    assert read_unsubscribe_token(valid) == victim.id


def test_one_failed_email_does_not_block_others_and_is_retried_next_run(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    broken = add_user(database_session_factory, "broken@example.com")
    add_user(database_session_factory, "fine@example.com")

    def fake_smtp(message: EmailMessage) -> None:
        if message["To"] == "broken@example.com":
            raise EmailDeliveryError("mailbox rejected")
        outbox.append(message)

    monkeypatch.setattr(auth_email, "_send_via_smtp", fake_smtp)
    first = call_cron(client)
    assert (first["sent"], first["failed"]) == (1, 1)
    assert recipients(outbox) == ["fine@example.com"]
    with database_session_factory() as session:
        stored = session.get(User, broken.id)
        assert stored is not None
        assert stored.weekly_reminder_week is None  # trả lại chỗ để gửi lại được

    monkeypatch.setattr(auth_email, "_send_via_smtp", outbox.append)
    second = call_cron(client)
    assert (second["sent"], second["failed"]) == (1, 0)
    assert recipients(outbox) == ["broken@example.com", "fine@example.com"]


def test_unexpected_error_for_one_user_is_isolated(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    add_user(database_session_factory, "crash@example.com")
    add_user(database_session_factory, "fine@example.com")

    def fake_smtp(message: EmailMessage) -> None:
        if message["To"] == "crash@example.com":
            raise RuntimeError("template bug")
        outbox.append(message)

    monkeypatch.setattr(auth_email, "_send_via_smtp", fake_smtp)
    result = call_cron(client)
    assert (result["sent"], result["failed"]) == (1, 1)
    assert recipients(outbox) == ["fine@example.com"]


def test_run_aborts_after_repeated_delivery_failures(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    for index in range(8):
        add_user(database_session_factory, f"user{index}@example.com")

    def always_fail(_: EmailMessage) -> None:
        raise EmailDeliveryError("gmail quota")

    monkeypatch.setattr(auth_email, "_send_via_smtp", always_fail)

    result = call_cron(client)
    assert outbox == []
    assert result["sent"] == 0
    assert result["failed"] == 5
    assert result["aborted"] is True
    assert result["has_more"] is True


def test_batch_limit_and_time_budget_leave_the_rest_for_the_next_call(
    client: TestClient,
    database_session_factory: sessionmaker[Session],
    outbox: list[EmailMessage],
) -> None:
    for index in range(3):
        add_user(database_session_factory, f"user{index}@example.com")

    first = call_cron(client, limit=2)
    assert (first["sent"], first["has_more"]) == (2, True)
    second = call_cron(client, limit=2)
    assert (second["sent"], second["has_more"]) == (1, False)
    assert len(outbox) == 3
    assert len(set(recipients(outbox))) == 3

    assert (
        client.post(
            ENDPOINT, headers={"X-Cron-Secret": CRON_SECRET}, params={"limit": 0}
        ).status_code
        == 422
    )

    add_user(database_session_factory, "late@example.com")
    with database_session_factory() as session:
        run = send_weekly_reminders(session, datetime.now(UTC), time_budget_seconds=0)
    assert (run.sent, run.has_more) == (0, True)


def test_coming_monday_is_the_next_vietnam_week() -> None:
    sunday_evening = datetime(2026, 11, 29, 14, 0, tzinfo=UTC)  # 21:00 Chủ nhật, UTC+7
    assert coming_monday(sunday_evening).isoformat() == "2026-11-30"
    saturday_utc_sunday_vn = datetime(2026, 11, 28, 18, 0, tzinfo=UTC)  # 01:00 Chủ nhật VN
    assert coming_monday(saturday_utc_sunday_vn).isoformat() == "2026-11-30"
    monday = datetime(2026, 11, 30, 3, 0, tzinfo=UTC)
    assert coming_monday(monday).isoformat() == "2026-12-07"
    with pytest.raises(ValueError, match="timezone-aware"):
        coming_monday(datetime(2026, 11, 29, 14, 0))


def test_weekly_reminder_preference_defaults_to_on_and_inherits_legacy_opt_out() -> None:
    assert read_preferences({}).weekly_reminder_email is True
    assert read_preferences({"notify_weekly_plan": False}).weekly_reminder_email is False
    assert read_preferences({"notify_weekly_plan": True}).weekly_reminder_email is True
    both = read_preferences({"notify_weekly_plan": False, "weekly_reminder_email": True})
    assert both.weekly_reminder_email is True


def test_welcome_email_mentions_the_sunday_reminder(monkeypatch: pytest.MonkeyPatch) -> None:
    deliveries: list[dict[str, str]] = []
    monkeypatch.setattr(auth_email, "_send_message", lambda **message: deliveries.append(message))

    send_security_notification(recipient="lan@example.com", event="registration")

    assert len(deliveries) == 1
    for body in (deliveries[0]["text"], deliveries[0]["html"]):
        assert "Chủ nhật" in body
        assert "21:00" in body
        assert "Cài đặt" in body
