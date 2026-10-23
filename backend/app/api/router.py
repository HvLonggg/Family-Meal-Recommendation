from fastapi import APIRouter

from app.modules.account.router import router as account_router
from app.modules.admin.router import router as admin_router
from app.modules.articles.router import router as articles_router
from app.modules.assistant.router import router as assistant_router
from app.modules.auth.router import router as auth_router
from app.modules.cooking.router import router as cooking_router
from app.modules.favorites.router import router as favorites_router
from app.modules.health.router import router as health_router
from app.modules.planner.router import router as planner_router
from app.modules.recipes.router import router as recipes_router
from app.modules.saved_meals.router import router as saved_meals_router
from app.modules.submissions.router import router as submissions_router
from app.modules.support.router import router as support_router

api_router = APIRouter()
api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, tags=["auth"])
api_router.include_router(recipes_router, tags=["recipes"])
api_router.include_router(favorites_router, tags=["favorites"])
api_router.include_router(planner_router, tags=["planner"])
api_router.include_router(cooking_router, tags=["cooking"])
api_router.include_router(saved_meals_router, tags=["saved-meals"])
api_router.include_router(account_router, tags=["account"])
api_router.include_router(articles_router, tags=["articles"])
api_router.include_router(submissions_router, tags=["submissions"])
api_router.include_router(support_router, tags=["support"])
api_router.include_router(assistant_router, tags=["assistant"])
api_router.include_router(admin_router, tags=["admin"])
