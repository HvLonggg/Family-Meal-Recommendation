from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload, undefer

from app.db.session import get_db_session
from app.modules.articles.models import Article
from app.modules.articles.schemas import (
    ArticleCategory,
    ArticleCreate,
    ArticleDetail,
    ArticleKind,
    ArticleListResponse,
    ArticleUpdate,
)
from app.modules.articles.service import (
    ArticleNotFoundError,
    can_manage,
    create_article,
    delete_article,
    get_article,
    list_articles,
    to_detail,
    to_summary,
    update_article,
)
from app.modules.auth.dependencies import get_current_user, get_optional_user
from app.modules.auth.models import User

router = APIRouter(prefix="/articles")

DatabaseSession = Annotated[Session, Depends(get_db_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]


@router.get("", response_model=ArticleListResponse, summary="List published articles")
def published_articles(
    session: DatabaseSession,
    kind: ArticleKind | None = None,
    category: ArticleCategory | None = None,
    q: Annotated[str | None, Query(max_length=100)] = None,
    limit: Annotated[int, Query(ge=1, le=50)] = 12,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ArticleListResponse:
    items, total = list_articles(
        session, kind=kind, category=category, query=q, limit=limit, offset=offset
    )
    return ArticleListResponse(data=[to_summary(item) for item in items], total=total)


@router.get("/mine", response_model=ArticleListResponse, summary="List my stories")
def my_articles(
    session: DatabaseSession,
    current_user: CurrentUser,
    limit: Annotated[int, Query(ge=1, le=50)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> ArticleListResponse:
    items, total = list_articles(
        session, statuses=None, author_id=current_user.id, limit=limit, offset=offset
    )
    return ArticleListResponse(data=[to_summary(item) for item in items], total=total)


@router.post(
    "",
    response_model=ArticleDetail,
    status_code=status.HTTP_201_CREATED,
    summary="Create a story or article",
)
def create(
    payload: ArticleCreate, session: DatabaseSession, current_user: CurrentUser
) -> ArticleDetail:
    return to_detail(create_article(session, current_user, payload))


@router.get("/by-id/{article_id}", response_model=ArticleDetail, summary="Get article for editing")
def article_for_editing(
    article_id: UUID, session: DatabaseSession, current_user: CurrentUser
) -> ArticleDetail:
    article = get_article(session, article_id)
    if not can_manage(article, current_user):
        raise ArticleNotFoundError("Không tìm thấy bài viết.")
    return to_detail(article)


@router.patch("/{article_id}", response_model=ArticleDetail, summary="Update article")
def update(
    article_id: UUID,
    payload: ArticleUpdate,
    session: DatabaseSession,
    current_user: CurrentUser,
) -> ArticleDetail:
    return to_detail(update_article(session, current_user, article_id, payload))


@router.delete("/{article_id}", status_code=status.HTTP_204_NO_CONTENT, summary="Delete article")
def delete(article_id: UUID, session: DatabaseSession, current_user: CurrentUser) -> None:
    delete_article(session, current_user, article_id)


@router.get("/{article_id}/cover", summary="Get article cover image")
def cover_image(article_id: UUID, session: DatabaseSession) -> Response:
    article = session.scalar(
        select(Article).where(Article.id == article_id).options(undefer(Article.cover_data))
    )
    if article is None or not article.cover_data or not article.cover_content_type:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND)
    return Response(
        content=article.cover_data,
        media_type=article.cover_content_type,
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/{slug}", response_model=ArticleDetail, summary="Read an article")
def article_detail(slug: str, session: DatabaseSession, viewer: OptionalUser) -> ArticleDetail:
    article = session.scalar(
        select(Article).where(Article.slug == slug).options(selectinload(Article.author))
    )
    if article is None or (article.status != "published" and not can_manage(article, viewer)):
        raise ArticleNotFoundError("Không tìm thấy bài viết.")
    return to_detail(article)
