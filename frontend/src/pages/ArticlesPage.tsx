import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { ArticleCover } from '@/components/articles/ArticleCover';
import { ArticleByline } from '@/components/articles/ArticleByline';
import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { EmptyState, LoadingBlock, Pagination } from '@/components/ui/Workspace';
import {
  articleCategories,
  listArticles,
  type ArticleCategory,
  type ArticleKind,
} from '@/features/articles/articlesApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const PAGE_SIZE = 9;
const kindTabs: { id: ArticleKind | 'all'; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'editorial', label: 'Bài viết từ Bếp Việt' },
  { id: 'story', label: 'Câu chuyện căn bếp' },
];

export function ArticlesPage() {
  const { t } = useI18n();
  const [params, setParams] = useSearchParams();
  const kind = (params.get('kind') as ArticleKind | null) ?? undefined;
  const category = (params.get('category') as ArticleCategory | null) ?? undefined;
  const query = params.get('q') ?? '';
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const [search, setSearch] = useState(query);

  const articles = useQuery({
    queryKey: ['articles', kind, category, query, offset],
    queryFn: ({ signal }) =>
      listArticles({ kind, category, q: query || undefined, limit: PAGE_SIZE, offset }, signal),
    placeholderData: keepPreviousData,
  });

  const setFilter = (updates: Record<string, string | undefined>) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('offset');
      for (const [key, value] of Object.entries(updates)) {
        if (value) next.set(key, value);
        else next.delete(key);
      }
      return next;
    });
  };

  const items = articles.data?.data ?? [];
  const showFeatured = offset === 0 && !query && items.length > 0;
  const featured = showFeatured ? items[0] : undefined;
  const rest = showFeatured ? items.slice(1) : items;

  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--articles">
        <div className="container">
          <span className="section-label">{t('Bài viết & câu chuyện')}</span>
          <h1>{t('Chuyện hay từ căn bếp Việt')}</h1>
          <p>
            {t('Mẹo thực tế, câu chuyện món nhà và cảm hứng để mỗi lần vào bếp đều nhẹ nhàng.')}
          </p>
          <div className="page-hero__actions">
            <Link className="button button--primary" to="/stories/new">
              <AppIcon name="pen" size={17} /> {t('Chia sẻ câu chuyện của bạn')}
            </Link>
          </div>
        </div>
      </section>

      <section className="content-section">
        <div className="container">
          <div className="article-toolbar">
            <div className="tab-pills" role="tablist" aria-label={t('Loại bài viết')}>
              {kindTabs.map((tab) => {
                const active = (kind ?? 'all') === tab.id;
                return (
                  <button
                    aria-selected={active}
                    className={active ? 'is-active' : ''}
                    key={tab.id}
                    onClick={() => setFilter({ kind: tab.id === 'all' ? undefined : tab.id })}
                    role="tab"
                    type="button"
                  >
                    {t(tab.label)}
                  </button>
                );
              })}
            </div>
            <form
              className="article-toolbar__search"
              onSubmit={(event) => {
                event.preventDefault();
                setFilter({ q: search.trim() || undefined });
              }}
            >
              <SearchField
                actionLabel={t('Tìm')}
                label={t('Tìm bài viết')}
                onChange={setSearch}
                placeholder={t('Tìm theo tiêu đề hoặc nội dung…')}
                value={search}
              />
            </form>
          </div>
          <div className="chip-group chip-group--scroll" aria-label={t('Chuyên mục')}>
            <button
              aria-pressed={!category}
              className={`chip${!category ? ' is-active' : ''}`}
              onClick={() => setFilter({ category: undefined })}
              type="button"
            >
              {t('Mọi chuyên mục')}
            </button>
            {articleCategories.map((item) => (
              <button
                aria-pressed={category === item.id}
                className={`chip${category === item.id ? ' is-active' : ''}`}
                key={item.id}
                onClick={() => setFilter({ category: item.id })}
                type="button"
              >
                {t(item.label)}
              </button>
            ))}
          </div>

          {articles.isLoading ? (
            <LoadingBlock label={t('Đang tải bài viết…')} />
          ) : articles.isError ? (
            <EmptyState
              action={
                <button
                  className="button button--outline"
                  onClick={() => void articles.refetch()}
                  type="button"
                >
                  {t('Thử lại')}
                </button>
              }
              description={errorMessage(articles.error, t)}
              icon="book"
              title={t('Chưa tải được bài viết')}
            />
          ) : items.length === 0 ? (
            <EmptyState
              action={
                <Link className="button button--primary" to="/stories/new">
                  {t('Viết câu chuyện đầu tiên')}
                </Link>
              }
              description={t('Thử bỏ bớt bộ lọc hoặc trở thành người đầu tiên chia sẻ.')}
              icon="book"
              title={t('Chưa có bài viết phù hợp')}
            />
          ) : (
            <>
              {featured ? (
                <article className="featured-article">
                  <ArticleCover article={featured} eager />
                  <div>
                    <span className="section-label">
                      {t(
                        articleCategories.find((item) => item.id === featured.category)?.label ??
                          '',
                      )}
                      {' · '}
                      {t('Nổi bật')}
                    </span>
                    <h2>{featured.title}</h2>
                    <p>{featured.excerpt}</p>
                    <ArticleByline article={featured} />
                    <Link className="button button--primary" to={`/articles/${featured.slug}`}>
                      {t('Đọc bài viết')} <AppIcon name="arrow" size={17} />
                    </Link>
                  </div>
                </article>
              ) : null}
              <div className="article-list">
                {rest.map((article) => (
                  <article key={article.id}>
                    <Link
                      aria-label={article.title}
                      className="article-list__media"
                      to={`/articles/${article.slug}`}
                    >
                      <ArticleCover article={article} />
                      <span className={`article-kind article-kind--${article.kind}`}>
                        {article.kind === 'story' ? t('Câu chuyện') : t('Bếp Việt')}
                      </span>
                    </Link>
                    <div>
                      <small>
                        {t(
                          articleCategories.find((item) => item.id === article.category)?.label ??
                            '',
                        )}
                      </small>
                      <h3>
                        <Link to={`/articles/${article.slug}`}>{article.title}</Link>
                      </h3>
                      <p>{article.excerpt}</p>
                      <ArticleByline article={article} compact />
                    </div>
                  </article>
                ))}
              </div>
              <Pagination
                labels={{
                  next: t('Trang sau'),
                  previous: t('Trang trước'),
                  summary: t('{from}–{to} trong {total} bài viết', {
                    from: offset + 1,
                    to: Math.min(offset + PAGE_SIZE, articles.data?.total ?? 0),
                    total: articles.data?.total ?? 0,
                  }),
                }}
                limit={PAGE_SIZE}
                offset={offset}
                onChange={(nextOffset) => {
                  setParams((current) => {
                    const next = new URLSearchParams(current);
                    if (nextOffset) next.set('offset', String(nextOffset));
                    else next.delete('offset');
                    return next;
                  });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                total={articles.data?.total ?? 0}
              />
            </>
          )}
        </div>
      </section>

      <section className="story-band">
        <div className="container story-band__inner">
          <div>
            <span className="section-label section-label--light">{t('Góc cộng đồng')}</span>
            <h2>{t('Món ăn nào gắn với kỷ niệm của bạn?')}</h2>
            <p>
              {t(
                'Kể lại hành trình nấu một món ăn, mẹo nhỏ của bà, của mẹ hay lần đầu bạn tự vào bếp.',
              )}
            </p>
          </div>
          <Link className="button button--cream" to="/stories/new">
            {t('Viết câu chuyện')} <AppIcon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}
