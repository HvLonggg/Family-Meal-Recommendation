import re
import secrets
import unicodedata
from datetime import UTC, datetime
from uuid import UUID

from fastapi import status
from sqlalchemy import ColumnElement, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import DomainError
from app.core.images import decode_image_data_url
from app.modules.account.preferences import read_preferences
from app.modules.articles.models import Article
from app.modules.articles.schemas import (
    ArticleAuthor,
    ArticleCreate,
    ArticleDetail,
    ArticleSummary,
    ArticleUpdate,
)
from app.modules.auth.models import User

COVER_MAX_BYTES = 800 * 1024
WORDS_PER_MINUTE = 200


class ArticleNotFoundError(DomainError):
    code = "ARTICLE_NOT_FOUND"
    status_code = status.HTTP_404_NOT_FOUND


class ArticleForbiddenError(DomainError):
    code = "ARTICLE_FORBIDDEN"
    status_code = status.HTTP_403_FORBIDDEN


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFD", value.replace("đ", "d").replace("Đ", "D"))
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii").lower()
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-")
    return slug[:180] or "bai-viet"


def unique_slug(session: Session, title: str) -> str:
    base = slugify(title)
    candidate = base
    while session.scalar(select(Article.id).where(Article.slug == candidate)) is not None:
        candidate = f"{base}-{secrets.token_hex(3)}"
    return candidate


def reading_minutes(body: str) -> int:
    return max(1, round(len(body.split()) / WORDS_PER_MINUTE))


def author_of(article: Article) -> ArticleAuthor:
    author = article.author
    if article.kind == "editorial" or author is None:
        return ArticleAuthor(id=None, full_name="Bếp Việt", display="editorial")
    if not read_preferences(author.preferences).show_name_on_stories:
        return ArticleAuthor(id=None, full_name="", display="anonymous")
    return ArticleAuthor(id=author.id, full_name=author.full_name, avatar_url=author.avatar_url)


def to_summary(article: Article) -> ArticleSummary:
    return ArticleSummary(
        id=article.id,
        slug=article.slug,
        kind=article.kind,
        title=article.title,
        excerpt=article.excerpt,
        category=article.category,
        recipe_slug=article.recipe_slug,
        cover_url=article.cover_url,
        status=article.status,
        moderation_note=article.moderation_note,
        reading_minutes=article.reading_minutes,
        published_at=article.published_at,
        created_at=article.created_at,
        updated_at=article.updated_at,
        author=author_of(article),
    )


def to_detail(article: Article) -> ArticleDetail:
    return ArticleDetail(**to_summary(article).model_dump(), body=article.body)


def list_articles(
    session: Session,
    *,
    statuses: tuple[str, ...] | None = ("published",),
    kind: str | None = None,
    category: str | None = None,
    query: str | None = None,
    author_id: UUID | None = None,
    limit: int = 12,
    offset: int = 0,
) -> tuple[list[Article], int]:
    conditions: list[ColumnElement[bool]] = []
    if statuses:
        conditions.append(Article.status.in_(statuses))
    if kind:
        conditions.append(Article.kind == kind)
    if category:
        conditions.append(Article.category == category)
    if author_id:
        conditions.append(Article.author_id == author_id)
    if query and query.strip():
        pattern = f"%{query.strip()}%"
        conditions.append(or_(Article.title.ilike(pattern), Article.excerpt.ilike(pattern)))
    total = int(session.scalar(select(func.count()).select_from(Article).where(*conditions)) or 0)
    statement = (
        select(Article)
        .where(*conditions)
        .options(selectinload(Article.author))
        .order_by(
            func.coalesce(Article.published_at, Article.updated_at).desc(),
            Article.created_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    return list(session.scalars(statement)), total


def get_article(session: Session, article_id: UUID) -> Article:
    article = session.scalar(
        select(Article).where(Article.id == article_id).options(selectinload(Article.author))
    )
    if article is None:
        raise ArticleNotFoundError("Không tìm thấy bài viết.")
    return article


def can_manage(article: Article, user: User | None) -> bool:
    return user is not None and (user.role == "admin" or article.author_id == user.id)


def _apply_cover(article: Article, data_url: str | None, *, remove: bool = False) -> None:
    if data_url:
        image = decode_image_data_url(data_url, max_bytes=COVER_MAX_BYTES)
        article.cover_data = image.data
        article.cover_content_type = image.content_type
        article.cover_updated_at = datetime.now(UTC)
    elif remove:
        article.cover_data = None
        article.cover_content_type = None
        article.cover_updated_at = None


def _status_after_write(user: User, submit: bool) -> str:
    if not submit:
        return "draft"
    return "published" if user.role == "admin" else "pending"


def create_article(session: Session, user: User, payload: ArticleCreate) -> Article:
    status_value = _status_after_write(user, payload.submit)
    article = Article(
        author_id=user.id,
        kind=payload.kind if user.role == "admin" else "story",
        slug=unique_slug(session, payload.title),
        title=payload.title,
        excerpt=payload.excerpt,
        body=payload.body,
        category=payload.category,
        recipe_slug=payload.recipe_slug,
        status=status_value,
        reading_minutes=reading_minutes(payload.body),
        published_at=datetime.now(UTC) if status_value == "published" else None,
    )
    _apply_cover(article, payload.cover_image)
    session.add(article)
    session.commit()
    return get_article(session, article.id)


def update_article(
    session: Session, user: User, article_id: UUID, payload: ArticleUpdate
) -> Article:
    article = get_article(session, article_id)
    if not can_manage(article, user):
        raise ArticleForbiddenError("Bạn không có quyền chỉnh sửa bài viết này.")
    is_admin = user.role == "admin"
    article.title = payload.title
    article.excerpt = payload.excerpt
    article.body = payload.body
    article.category = payload.category
    article.recipe_slug = payload.recipe_slug
    article.reading_minutes = reading_minutes(payload.body)
    if is_admin:
        article.kind = payload.kind
    _apply_cover(article, payload.cover_image, remove=payload.remove_cover)

    if is_admin and article.author_id != user.id:
# Giữ trạng thái hiện tại khi biên tập, trừ khi yêu cầu xuất bản.
        if payload.submit and article.status != "published":
            article.status = "published"
    else:
        article.status = _status_after_write(user, payload.submit)
        article.moderation_note = None
    if article.status == "published" and article.published_at is None:
        article.published_at = datetime.now(UTC)
    session.commit()
    return get_article(session, article.id)


def moderate_article(
    session: Session, article_id: UUID, status_value: str, note: str | None
) -> Article:
    article = get_article(session, article_id)
    article.status = status_value
    article.moderation_note = (note or "").strip() or None
    if status_value == "published" and article.published_at is None:
        article.published_at = datetime.now(UTC)
    session.commit()
    return get_article(session, article.id)


def delete_article(session: Session, user: User, article_id: UUID) -> None:
    article = get_article(session, article_id)
    if not can_manage(article, user):
        raise ArticleForbiddenError("Bạn không có quyền xóa bài viết này.")
    session.delete(article)
    session.commit()
