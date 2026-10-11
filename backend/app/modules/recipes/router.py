from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.modules.recipes.schemas import (
    RecipeCatalogResponse,
    RecipeDetailResponse,
    RecipeListResponse,
    RecipeSummaryResponse,
)
from app.modules.recipes.service import get_recipe_by_slug, list_recipes

router = APIRouter(prefix="/recipes")


@router.get("", response_model=RecipeListResponse, summary="List published recipes")
def recipes(
    session: Annotated[Session, Depends(get_db_session)],
    q: Annotated[str | None, Query(max_length=100)] = None,
    region: Annotated[str | None, Query(max_length=32)] = None,
    category: Annotated[str | None, Query(max_length=48)] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RecipeListResponse:
    items, total = list_recipes(
        session,
        query=q,
        region=region,
        category=category,
        limit=limit,
        offset=offset,
    )
    return RecipeListResponse(
        data=[RecipeSummaryResponse.model_validate(item) for item in items], total=total
    )


@router.get(
    "/catalog",
    response_model=RecipeCatalogResponse,
    summary="Get complete published recipe catalog",
)
def recipe_catalog(
    session: Annotated[Session, Depends(get_db_session)],
    limit: Annotated[int, Query(ge=1, le=100)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> RecipeCatalogResponse:
    items, total = list_recipes(session, limit=limit, offset=offset, with_details=True)
    return RecipeCatalogResponse(
        data=[RecipeDetailResponse.model_validate(item) for item in items], total=total
    )


@router.get("/{slug}", response_model=RecipeDetailResponse, summary="Get a recipe by slug")
def recipe_detail(
    slug: str, session: Annotated[Session, Depends(get_db_session)]
) -> RecipeDetailResponse:
    recipe = get_recipe_by_slug(session, slug)
    if recipe is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Không tìm thấy công thức món ăn.",
        )
    return RecipeDetailResponse.model_validate(recipe)
