"""Send opt-in reminders for meals scheduled in a user's daily plan."""

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from uuid import UUID
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, sessionmaker

from app.modules.account.preferences import read_preferences
from app.modules.auth.email import EmailDeliveryError, send_meal_plan_reminder_email
from app.modules.auth.models import User
from app.modules.planner.models import MealPlanEmailReminder, UserMealPlanItem
from app.modules.recipes.models import Recipe

logger = logging.getLogger("bep_viet.planner.email_reminders")
VIETNAM_TIMEZONE = ZoneInfo("Asia/Ho_Chi_Minh")
MEAL_REMINDER_HOURS = {"lunch": 11, "dinner": 17}


def scheduled_meal_type(now: datetime) -> str | None:
    """Return the meal whose reminder window is open in Vietnam local time."""
    if now.tzinfo is None:
        raise ValueError("Reminder scheduler requires a timezone-aware datetime.")
    local_now = now.astimezone(VIETNAM_TIMEZONE)
    for meal_type, hour in MEAL_REMINDER_HOURS.items():
        if local_now.hour == hour:
            return meal_type
    return None


def enqueue_scheduled_meal_reminders(session: Session, now: datetime) -> list[UUID]:
    """Create one durable reminder snapshot per opted-in user and planned meal."""
    meal_type = scheduled_meal_type(now)
    if meal_type is None:
        return []

    local_now = now.astimezone(VIETNAM_TIMEZONE)
    now_utc = local_now.astimezone(UTC)
    rows = session.execute(
        select(UserMealPlanItem, User, Recipe)
        .join(User, User.id == UserMealPlanItem.user_id)
        .join(Recipe, Recipe.id == UserMealPlanItem.recipe_id)
        .where(
            UserMealPlanItem.plan_date == local_now.date(),
            UserMealPlanItem.meal_type == meal_type,
            UserMealPlanItem.completion_status == "planned",
            Recipe.status == "published",
        )
        .order_by(UserMealPlanItem.user_id, UserMealPlanItem.created_at, Recipe.name)
    ).all()

    grouped: dict[UUID, tuple[User, list[dict[str, str]]]] = {}
    for item, user, recipe in rows:
        if user.id not in grouped:
            grouped[user.id] = (user, [])
        grouped[user.id][1].append(
            {
                "slug": recipe.slug,
                "name": recipe.name,
                "excerpt": recipe.excerpt,
                "image_path": recipe.image_path,
                "servings": str(item.servings),
            }
        )

    created_ids: list[UUID] = []
    for user_id, (user, recipes) in grouped.items():
        preferences = read_preferences(user.preferences)
        if (
            not preferences.email_meal_plan_reminders
            or not user.email
            or not user.email_verified_at
        ):
            continue
        exists = session.scalar(
            select(MealPlanEmailReminder.id).where(
                MealPlanEmailReminder.user_id == user_id,
                MealPlanEmailReminder.plan_date == local_now.date(),
                MealPlanEmailReminder.meal_type == meal_type,
            )
        )
        if exists is not None:
            continue

        reminder = MealPlanEmailReminder(
            user_id=user_id,
            plan_date=local_now.date(),
            meal_type=meal_type,
            payload={"recipes": recipes},
            next_attempt_at=now_utc,
        )
        try:
            # The database uniqueness constraint also protects against two app workers
            # observing the same meal at the same time.
            with session.begin_nested():
                session.add(reminder)
                session.flush()
        except IntegrityError:
            continue
        created_ids.append(reminder.id)

    session.commit()
    return created_ids


def deliver_meal_plan_reminder(
    session: Session, reminder_id: UUID, now: datetime | None = None
) -> bool:
    """Claim and deliver one reminder, with bounded backoff handled by the worker."""
    now_utc = (now or datetime.now(UTC)).astimezone(UTC)
    reminder = session.scalar(
        select(MealPlanEmailReminder)
        .where(
            MealPlanEmailReminder.id == reminder_id,
            MealPlanEmailReminder.sent_at.is_(None),
            MealPlanEmailReminder.next_attempt_at <= now_utc,
        )
        .with_for_update(skip_locked=True)
    )
    if reminder is None:
        return False

    user = session.get(User, reminder.user_id)
    recipes = reminder.payload.get("recipes", [])
    if (
        user is None
        or not user.email
        or not user.email_verified_at
        or not read_preferences(user.preferences).email_meal_plan_reminders
        or not isinstance(recipes, list)
        or not recipes
    ):
        reminder.payload = {}
        reminder.sent_at = now_utc
        session.commit()
        return False

    reminder.next_attempt_at = now_utc.replace(microsecond=0) + timedelta(minutes=2)
    session.commit()
    try:
        send_meal_plan_reminder_email(
            recipient=user.email,
            recipient_name=user.full_name,
            meal_type=reminder.meal_type,
            plan_date=reminder.plan_date,
            recipes=recipes,
        )
    except EmailDeliveryError as exc:
        failed = session.get(MealPlanEmailReminder, reminder_id)
        if failed is not None and failed.sent_at is None:
            failed.attempts += 1
            retry_minutes = min(2 ** min(failed.attempts, 8), 360)
            failed.next_attempt_at = now_utc + timedelta(minutes=retry_minutes)
            session.commit()
        logger.warning(
            "Meal-plan reminder delivery failed; retry scheduled (%s).", type(exc).__name__
        )
        return False

    delivered = session.get(MealPlanEmailReminder, reminder_id)
    if delivered is not None and delivered.sent_at is None:
        delivered.sent_at = now_utc
        delivered.payload = {}
        session.commit()
    return True


def dispatch_due_meal_plan_reminders(
    now: datetime | None = None,
    session_factory: sessionmaker[Session] | None = None,
) -> None:
    from app.db.session import SessionLocal

    factory = session_factory or SessionLocal
    now_utc = (now or datetime.now(UTC)).astimezone(UTC)
    with factory() as session:
        enqueue_scheduled_meal_reminders(session, now_utc)
        reminder_ids = list(
            session.scalars(
                select(MealPlanEmailReminder.id)
                .where(
                    MealPlanEmailReminder.sent_at.is_(None),
                    MealPlanEmailReminder.next_attempt_at <= now_utc,
                )
                .order_by(MealPlanEmailReminder.created_at)
                .limit(50)
            )
        )

    for reminder_id in reminder_ids:
        with factory() as session:
            try:
                deliver_meal_plan_reminder(session, reminder_id, now=now_utc)
            except Exception as exc:  # Keep subsequent reminder cycles alive.
                session.rollback()
                logger.error("Meal-plan reminder worker failed (%s).", type(exc).__name__)


async def run_meal_plan_reminder_worker() -> None:
    while True:
        try:
            await asyncio.to_thread(dispatch_due_meal_plan_reminders)
        except Exception as exc:  # Keep the scheduler alive if a polling cycle fails.
            logger.error("Meal-plan reminder polling failed (%s).", type(exc).__name__)
        await asyncio.sleep(30)
