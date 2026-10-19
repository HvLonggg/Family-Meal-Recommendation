from datetime import UTC, date, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy.orm import Session, sessionmaker

from app.modules.account.preferences import read_preferences
from app.modules.auth.email import EmailDeliveryError
from app.modules.auth.models import User
from app.modules.planner.email_reminders import (
    deliver_meal_plan_reminder,
    enqueue_scheduled_meal_reminders,
    scheduled_meal_type,
)
from app.modules.planner.models import MealPlanEmailReminder, UserMealPlanItem
from app.modules.recipes.models import Recipe

VN = ZoneInfo("Asia/Ho_Chi_Minh")


def test_meal_plan_email_reminders_are_enabled_for_default_preferences() -> None:
    assert read_preferences({}).email_meal_plan_reminders
    assert read_preferences({"language": "vi"}).email_meal_plan_reminders


def seed_planned_meal(
    session: Session, *, opted_in: bool = True, verified: bool = True
) -> tuple[User, Recipe]:
    user = User(
        email="lan@example.com",
        full_name="Nguyễn Ngọc Lan",
        password_hash="test-hash",
        email_verified_at=datetime(2026, 1, 1, tzinfo=UTC) if verified else None,
        preferences={"email_meal_plan_reminders": opted_in},
    )
    recipe = Recipe(
        slug="ca-chep-kho-rieng",
        name="Cá chép kho riềng",
        excerpt="Món cá kho đậm đà, hợp bữa cơm nhà.",
        region="Bắc",
        category="Món mặn",
        difficulty="Dễ",
        prep_minutes=20,
        cook_minutes=40,
        base_servings=4,
        image_path="/images/recipes/edited/ca-chep-kho-rieng-1600.webp",
        image_alt="Cá chép kho riềng",
        serving="Dùng nóng.",
        tip="Kho nhỏ lửa.",
        source_name="Bếp Việt",
        source_url="https://bepviet.example/ca-chep-kho-rieng",
        status="published",
    )
    session.add_all([user, recipe])
    session.flush()
    session.add(
        UserMealPlanItem(
            user_id=user.id,
            recipe_id=recipe.id,
            plan_date=date(2026, 10, 19),
            meal_type="lunch",
            servings=4,
            completion_status="planned",
        )
    )
    session.commit()
    return user, recipe


def test_scheduler_uses_vietnam_lunch_and_dinner_hours() -> None:
    assert scheduled_meal_type(datetime(2026, 10, 19, 10, 59, tzinfo=VN)) is None
    assert scheduled_meal_type(datetime(2026, 10, 19, 11, 0, tzinfo=VN)) == "lunch"
    assert scheduled_meal_type(datetime(2026, 10, 19, 17, 0, tzinfo=VN)) == "dinner"
    assert scheduled_meal_type(datetime(2026, 10, 19, 18, 0, tzinfo=VN)) is None
    with pytest.raises(ValueError, match="timezone-aware"):
        scheduled_meal_type(datetime(2026, 10, 19, 11, 0))


def test_reminder_is_queued_once_and_sends_the_users_planned_dishes(
    database_session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.planner import email_reminders

    with database_session_factory() as session:
        user, _ = seed_planned_meal(session)
        now = datetime(2026, 10, 19, 11, 0, tzinfo=VN)
        reminder_ids = enqueue_scheduled_meal_reminders(session, now)
        assert len(reminder_ids) == 1
        assert enqueue_scheduled_meal_reminders(session, now) == []

    deliveries: list[dict[str, object]] = []
    monkeypatch.setattr(
        email_reminders,
        "send_meal_plan_reminder_email",
        lambda **message: deliveries.append(message),
    )
    with database_session_factory() as session:
        assert deliver_meal_plan_reminder(session, reminder_ids[0], now=now.astimezone(UTC))
        assert not deliver_meal_plan_reminder(session, reminder_ids[0], now=now.astimezone(UTC))
        reminder = session.get(MealPlanEmailReminder, reminder_ids[0])
        assert reminder is not None and reminder.sent_at is not None
        assert reminder.payload == {}

    assert len(deliveries) == 1
    assert deliveries[0]["recipient"] == user.email
    assert deliveries[0]["recipient_name"] == user.full_name
    assert deliveries[0]["meal_type"] == "lunch"
    assert deliveries[0]["plan_date"] == date(2026, 10, 19)
    assert deliveries[0]["recipes"][0]["name"] == "Cá chép kho riềng"


@pytest.mark.parametrize(
    ("opted_in", "verified"),
    [(False, True), (True, False)],
)
def test_only_opted_in_users_with_verified_email_are_queued(
    database_session_factory: sessionmaker[Session], opted_in: bool, verified: bool
) -> None:
    with database_session_factory() as session:
        seed_planned_meal(session, opted_in=opted_in, verified=verified)
        reminder_ids = enqueue_scheduled_meal_reminders(
            session, datetime(2026, 10, 19, 11, 0, tzinfo=VN)
        )
        assert reminder_ids == []
        assert session.query(MealPlanEmailReminder).count() == 0


def test_failed_reminder_is_retried_after_backoff(
    database_session_factory: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.modules.planner import email_reminders

    with database_session_factory() as session:
        seed_planned_meal(session)
        now = datetime(2026, 10, 19, 11, 0, tzinfo=VN)
        reminder_id = enqueue_scheduled_meal_reminders(session, now)[0]

    attempts: list[int] = []

    def fail_once(**_: object) -> None:
        attempts.append(1)
        raise EmailDeliveryError("test failure")

    monkeypatch.setattr(email_reminders, "send_meal_plan_reminder_email", fail_once)
    now_utc = now.astimezone(UTC)
    with database_session_factory() as session:
        assert not deliver_meal_plan_reminder(session, reminder_id, now=now_utc)
        reminder = session.get(MealPlanEmailReminder, reminder_id)
        assert reminder is not None
        assert reminder.attempts == 1
        retry_at = reminder.next_attempt_at
        assert retry_at is not None
        if retry_at.tzinfo is None:  # SQLite drops timezone metadata in this test fixture.
            retry_at = retry_at.replace(tzinfo=UTC)
        assert retry_at > now_utc
        assert not deliver_meal_plan_reminder(
            session, reminder_id, now=now_utc + timedelta(minutes=1)
        )
