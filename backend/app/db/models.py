"""Tập hợp model để Alembic nạp đầy đủ metadata."""

from app.modules.articles.models import Article
from app.modules.assistant.models import (
    AssistantConversation,
    AssistantKnowledgeChunk,
    AssistantKnowledgeDocument,
    AssistantMemory,
    AssistantMessage,
)
from app.modules.auth.models import (
    AuthIdentity,
    EmailOtpChallenge,
    PasswordResetToken,
    RefreshSession,
    SecurityEmailOutbox,
    User,
)
from app.modules.cooking.models import UserCookLog, UserCookTimer, UserPushSubscription
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.planner.models import (
    MealPlanEmailReminder,
    UserMealPlanEvent,
    UserMealPlanItem,
    UserVegetarianDay,
)
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep
from app.modules.saved_meals.models import SavedMeal
from app.modules.submissions.models import RecipeSubmission
from app.modules.support.models import AdminMealSuggestionEmail, SupportTicket

__all__ = [
    "Article",
    "AssistantConversation",
    "AssistantKnowledgeChunk",
    "AssistantKnowledgeDocument",
    "AssistantMemory",
    "AssistantMessage",
    "RecipeSubmission",
    "SupportTicket",
    "AdminMealSuggestionEmail",
    "AuthIdentity",
    "EmailOtpChallenge",
    "PasswordResetToken",
    "RefreshSession",
    "SecurityEmailOutbox",
    "User",
    "Recipe",
    "RecipeIngredient",
    "RecipeStep",
    "SavedMeal",
    "UserFavoriteRecipe",
    "UserMealPlanItem",
    "UserMealPlanEvent",
    "UserVegetarianDay",
    "MealPlanEmailReminder",
    "UserCookLog",
    "UserCookTimer",
    "UserPushSubscription",
]
