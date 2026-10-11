from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import get_db_session
from app.modules.auth.dependencies import get_current_user
from app.modules.auth.models import User
from app.modules.favorites.models import UserFavoriteRecipe
from app.modules.favorites.schemas import FavoriteRecipeResponse
from app.modules.recipes.models import Recipe

router = APIRouter(prefix="/favorites")


@router.get("", response_model=list[FavoriteRecipeResponse], summary="List favorite recipes")
def list_favorites(
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> list[FavoriteRecipeResponse]:
    rows = session.execute(
        select(Recipe.slug, UserFavoriteRecipe.created_at)
        .join(UserFavoriteRecipe, UserFavoriteRecipe.recipe_id == Recipe.id)
        .where(
            UserFavoriteRecipe.user_id == current_user.id,
            Recipe.status == "published",
        )
        .order_by(UserFavoriteRecipe.created_at.desc())
    ).all()
    return [FavoriteRecipeResponse(slug=slug, created_at=created_at) for slug, created_at in rows]


@router.post(
    "/{slug}",
    response_model=FavoriteRecipeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Save a recipe to favorites",
)
def add_favorite(
    slug: str,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> FavoriteRecipeResponse:
    recipe = session.scalar(select(Recipe).where(Recipe.slug == slug, Recipe.status == "published"))
    if recipe is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipe not found")

    favorite = session.scalar(
        select(UserFavoriteRecipe).where(
            UserFavoriteRecipe.user_id == current_user.id,
            UserFavoriteRecipe.recipe_id == recipe.id,
        )
    )
    if favorite is None:
        favorite = UserFavoriteRecipe(user_id=current_user.id, recipe_id=recipe.id)
        session.add(favorite)
        try:
            session.commit()
        except IntegrityError:
            session.rollback()
            favorite = session.scalar(
                select(UserFavoriteRecipe).where(
                    UserFavoriteRecipe.user_id == current_user.id,
                    UserFavoriteRecipe.recipe_id == recipe.id,
                )
            )
            if favorite is None:
                raise
        session.refresh(favorite)

    return FavoriteRecipeResponse(slug=recipe.slug, created_at=favorite.created_at)


@router.delete(
    "/{slug}", status_code=status.HTTP_204_NO_CONTENT, summary="Remove a favorite recipe"
)
def remove_favorite(
    slug: str,
    session: Annotated[Session, Depends(get_db_session)],
    current_user: Annotated[User, Depends(get_current_user)],
) -> None:
    recipe_id = session.scalar(select(Recipe.id).where(Recipe.slug == slug))
    if recipe_id is not None:
        session.execute(
            delete(UserFavoriteRecipe).where(
                UserFavoriteRecipe.user_id == current_user.id,
                UserFavoriteRecipe.recipe_id == recipe_id,
            )
        )
        session.commit()
