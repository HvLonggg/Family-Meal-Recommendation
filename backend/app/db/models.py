"""Tập hợp model để Alembic nạp đầy đủ metadata."""

from app.modules.auth.models import (
    AuthIdentity,
    PasswordResetToken,
    PhoneOtpChallenge,
    RefreshSession,
    User,
)
from app.modules.recipes.models import Recipe, RecipeIngredient, RecipeStep

__all__ = [
    "AuthIdentity",
    "PasswordResetToken",
    "PhoneOtpChallenge",
    "RefreshSession",
    "User",
    "Recipe",
    "RecipeIngredient",
    "RecipeStep",
]
