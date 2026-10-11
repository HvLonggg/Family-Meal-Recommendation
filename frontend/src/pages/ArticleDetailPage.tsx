import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useParams } from 'react-router';

import { ArticleByline } from '@/components/articles/ArticleByline';
import { ArticleCover } from '@/components/articles/ArticleCover';
import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { LoadingBlock, StatusBadge } from '@/components/ui/Workspace';
import { getRecipe } from '@/data/recipes';
import {
  articleCategories,
  articleStatusLabels,
  articleStatusTone,
  getArticle,
  listArticles,
} from '@/features/articles/articlesApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { ApiError } from '@/lib/api/client';
import { NotFoundPage } from '@/pages/NotFoundPage';

export function ArticleDetailPage() {
  const { slug = '' } = useParams();
  const { user } = useAuth();
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const article = useQuery({
    queryKey: ['article', slug, user?.id],
    queryFn: ({ signal }) => getArticle(slug, signal),
    retry: (count, error) => !(error instanceof ApiError && error.status === 404) && count < 1,
  });
  const more = useQuery({
    queryKey: ['articles', 'more', slug],
    queryFn: ({ signal }) => listArticles({ limit: 4 }, signal),
    enabled: article.isSuccess,
  });

  if (article.isLoading) return <LoadingBlock label={t('Đang mở bài viết…')} />;
  if (article.isError || !article.data) return <NotFoundPage />;

  const data = article.data;
  const recipe = data.recipe_slug ? getRecipe(data.recipe_slug) : undefined;
  const canEdit = Boolean(
    user && (user.role === 'admin' || (data.author.id !== null && data.author.id === user.id)),
  );
  const paragraphs = data.body.split(/\n{2,}/).filter((block) => block.trim());
  const related = (more.data?.data ?? []).filter((item) => item.id !== data.id).slice(0, 3);

  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: data.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      // Người dùng hủy chia sẻ: không cần thông báo.
    }
  };

  return (
    <div className="page-wrap article-page">
      <div className="container breadcrumb">
        <Link to="/">{t('Trang chủ')}</Link>
        <span>/</span>
        <Link to="/articles">{t('Bài viết & câu chuyện')}</Link>
        <span>/</span>
        <span>{data.title}</span>
      </div>
      <article className="container article-reader">
        <header className="article-reader__head">
          <div className="article-reader__tags">
            <span className="section-label">
              {t(articleCategories.find((item) => item.id === data.category)?.label ?? '')}
            </span>
            {data.status !== 'published' ? (
              <StatusBadge tone={articleStatusTone[data.status]}>
                {t(articleStatusLabels[data.status])}
              </StatusBadge>
            ) : null}
          </div>
          <h1>{data.title}</h1>
          <p className="article-reader__lead">{data.excerpt}</p>
          <div className="article-reader__meta">
            <ArticleByline article={data} />
            <div className="article-reader__actions">
              <button className="button button--outline" onClick={() => void share()} type="button">
                <AppIcon name={copied ? 'check' : 'external'} size={16} />
                {copied ? t('Đã sao chép liên kết') : t('Chia sẻ')}
              </button>
              {canEdit ? (
                <Link className="button button--outline" to={`/stories/${data.id}/edit`}>
                  <AppIcon name="pen" size={16} /> {t('Chỉnh sửa')}
                </Link>
              ) : null}
            </div>
          </div>
        </header>
        <figure className="article-reader__cover">
          <ArticleCover article={data} eager />
        </figure>
        {data.status === 'rejected' && data.moderation_note ? (
          <p className="ws-notice ws-notice--warning">
            <AppIcon name="message" size={16} />
            <span>
              {t('Ghi chú từ ban biên tập')}: {data.moderation_note}
            </span>
          </p>
        ) : null}
        <div className="article-reader__body">
          {paragraphs.map((block, index) => (
            <p key={index}>
              {block.split('\n').map((line, lineIndex, lines) => (
                <span key={lineIndex}>
                  {line}
                  {lineIndex < lines.length - 1 ? <br /> : null}
                </span>
              ))}
            </p>
          ))}
        </div>
        {recipe ? (
          <aside className="article-reader__recipe">
            <span className="section-label">{t('Món ăn trong bài')}</span>
            <RecipeCard recipe={recipe} />
          </aside>
        ) : null}
      </article>

      {related.length ? (
        <section className="content-section content-section--tint">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="section-label">{t('Đọc tiếp')}</span>
                <h2>{t('Bài viết khác')}</h2>
              </div>
              <Link className="view-all" to="/articles">
                {t('Xem tất cả')} <AppIcon name="arrow" size={17} />
              </Link>
            </div>
            <div className="article-list">
              {related.map((item) => (
                <article key={item.id}>
                  <Link
                    aria-label={item.title}
                    className="article-list__media"
                    to={`/articles/${item.slug}`}
                  >
                    <ArticleCover article={item} />
                  </Link>
                  <div>
                    <small>
                      {t(
                        articleCategories.find((entry) => entry.id === item.category)?.label ?? '',
                      )}
                    </small>
                    <h3>
                      <Link to={`/articles/${item.slug}`}>{item.title}</Link>
                    </h3>
                    <p>{item.excerpt}</p>
                    <ArticleByline article={item} compact />
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}
