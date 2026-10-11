import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router';

import bunChaImage from '@/assets/auth/bun-cha-pho-hoi.webp';
import familyMealImage from '@/assets/auth/mam-com-nha.webp';
import phoImage from '@/assets/auth/pho-bep-nha.webp';
import { ArticleByline } from '@/components/articles/ArticleByline';
import { ArticleCover } from '@/components/articles/ArticleCover';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { EmptyState, Pagination } from '@/components/ui/Workspace';
import {
  articleCategories,
  listArticles,
  type ArticleCategory,
  type ArticleKind,
  type ArticleSummary,
} from '@/features/articles/articlesApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const PAGE_SIZE = 9;
const kindTabs: { id: ArticleKind | 'all'; label: string; icon: IconName }[] = [
  { id: 'all', label: 'Tất cả', icon: 'book' },
  { id: 'editorial', label: 'Bài viết từ Bếp Việt', icon: 'chef' },
  { id: 'story', label: 'Câu chuyện căn bếp', icon: 'heart' },
];
const categoryIcons: Record<ArticleCategory, IconName> = {
  kitchen_story: 'home',
  tips: 'sparkles',
  ingredients: 'leaf',
  culture: 'globe',
  events: 'calendar',
};
const fallbackCollage = [familyMealImage, phoImage, bunChaImage];

export function ArticlesPage() {
  const { formatNumber, t } = useI18n();
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
  const total = articles.data?.total ?? 0;
  const showFeatured = offset === 0 && !query && items.length > 0;
  const featured = showFeatured ? items[0] : undefined;
  const rest = showFeatured ? items.slice(1) : items;
  const categoryLabel = (article: ArticleSummary) =>
    t(articleCategories.find((item) => item.id === article.category)?.label ?? '');
  const hasFilters = Boolean(kind || category || query);
  const storyPrompts = [
    t('Món của mẹ'),
    t('Lần đầu vào bếp'),
    t('Mẹo của bà'),
    t('Mâm cơm ngày Tết'),
  ];

  return (
    <div className="page-wrap articles-page">
      <section className="articles-hero">
        <div className="container articles-hero__inner">
          <div className="articles-hero__copy">
            <span className="section-label">{t('Bài viết & câu chuyện')}</span>
            <h1>
              {t('Chuyện hay từ')} <em>{t('căn bếp Việt')}</em>
            </h1>
            <p>
              {t('Mẹo thực tế, câu chuyện món nhà và cảm hứng để mỗi lần vào bếp đều nhẹ nhàng.')}
            </p>
            <div className="articles-hero__actions">
              <Link className="button button--primary" to="/stories/new">
                <AppIcon name="pen" size={17} /> {t('Chia sẻ câu chuyện của bạn')}
              </Link>
              <a className="button button--outline" href="#article-feed">
                <AppIcon name="book" size={17} /> {t('Đọc bài mới nhất')}
              </a>
            </div>
            <dl className="articles-hero__stats">
              <div>
                <dt>{t('Bài viết')}</dt>
                <dd>{articles.data ? formatNumber(total) : '—'}</dd>
              </div>
              <div>
                <dt>{t('Chuyên mục')}</dt>
                <dd>{formatNumber(articleCategories.length)}</dd>
              </div>
              <div>
                <dt>{t('Tác giả')}</dt>
                <dd>{t('Bếp Việt & cộng đồng')}</dd>
              </div>
            </dl>
          </div>
          <div aria-hidden="true" className="articles-hero__collage">
            {fallbackCollage.map((image, index) => {
              const article = items[index];
              return (
                <figure
                  className={`articles-hero__photo articles-hero__photo--${index + 1}`}
                  key={index}
                >
                  {article ? <ArticleCover article={article} eager /> : <img alt="" src={image} />}
                </figure>
              );
            })}
            <span className="articles-hero__badge articles-hero__badge--tips">
              <AppIcon name="sparkles" size={16} /> {t('Mẹo vào bếp')}
            </span>
            <span className="articles-hero__badge articles-hero__badge--story">
              <AppIcon name="heart" size={16} /> {t('Câu chuyện căn bếp')}
            </span>
          </div>
        </div>
      </section>

      <section className="content-section articles-feed" id="article-feed">
        <div className="container">
          <div className="articles-toolbar">
            <div className="articles-tabs" role="tablist" aria-label={t('Loại bài viết')}>
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
                    <AppIcon name={tab.icon} size={16} />
                    {t(tab.label)}
                  </button>
                );
              })}
            </div>
            <form
              className="articles-toolbar__search"
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
          <div className="articles-categories" aria-label={t('Chuyên mục')} role="group">
            <button
              aria-pressed={!category}
              className={!category ? 'is-active' : ''}
              onClick={() => setFilter({ category: undefined })}
              type="button"
            >
              <AppIcon name="book" size={16} />
              {t('Mọi chuyên mục')}
            </button>
            {articleCategories.map((item) => (
              <button
                aria-pressed={category === item.id}
                className={category === item.id ? 'is-active' : ''}
                key={item.id}
                onClick={() => setFilter({ category: item.id })}
                type="button"
              >
                <AppIcon name={categoryIcons[item.id]} size={16} />
                {t(item.label)}
              </button>
            ))}
          </div>
          {hasFilters && articles.data ? (
            <p className="articles-result" role="status">
              {t('{count} bài viết phù hợp', { count: formatNumber(total) })}
              <button
                onClick={() => {
                  setSearch('');
                  setFilter({ kind: undefined, category: undefined, q: undefined });
                }}
                type="button"
              >
                <AppIcon name="close" size={14} /> {t('Xóa bộ lọc')}
              </button>
            </p>
          ) : null}

          {articles.isLoading ? (
            <ArticleSkeletons label={t('Đang tải bài viết…')} />
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
            <div
              className={
                articles.isPlaceholderData ? 'articles-results is-stale' : 'articles-results'
              }
            >
              {featured ? (
                <article className="featured-story">
                  <Link
                    aria-label={featured.title}
                    className="featured-story__media"
                    to={`/articles/${featured.slug}`}
                  >
                    <ArticleCover article={featured} eager />
                    <span className="featured-story__flag">
                      <AppIcon name="sparkles" size={15} /> {t('Nổi bật')}
                    </span>
                  </Link>
                  <div className="featured-story__body">
                    <span className="article-pill">
                      <AppIcon name={categoryIcons[featured.category]} size={14} />
                      {categoryLabel(featured)}
                    </span>
                    <h2>
                      <Link to={`/articles/${featured.slug}`}>{featured.title}</Link>
                    </h2>
                    <p>{featured.excerpt}</p>
                    <ArticleByline article={featured} />
                    <Link className="button button--primary" to={`/articles/${featured.slug}`}>
                      {t('Đọc bài viết')} <AppIcon name="arrow" size={17} />
                    </Link>
                  </div>
                </article>
              ) : null}
              <div className="article-feed-grid">
                {rest.map((article, index) => (
                  <article
                    className="article-card"
                    key={article.id}
                    style={{ '--i': index } as CSSProperties}
                  >
                    <Link
                      aria-hidden="true"
                      className="article-card__media"
                      tabIndex={-1}
                      to={`/articles/${article.slug}`}
                    >
                      <ArticleCover article={article} />
                      <span className={`article-card__kind article-card__kind--${article.kind}`}>
                        {article.kind === 'story' ? t('Câu chuyện') : t('Bếp Việt')}
                      </span>
                      <span className="article-card__time">
                        <AppIcon name="clock" size={13} />
                        {t('{minutes} phút đọc', { minutes: article.reading_minutes })}
                      </span>
                    </Link>
                    <div className="article-card__body">
                      <span className="article-pill">
                        <AppIcon name={categoryIcons[article.category]} size={13} />
                        {categoryLabel(article)}
                      </span>
                      <h3>
                        <Link to={`/articles/${article.slug}`}>{article.title}</Link>
                      </h3>
                      <p>{article.excerpt}</p>
                      <div className="article-card__footer">
                        <ArticleByline article={article} compact />
                        <AppIcon name="arrow" size={18} />
                      </div>
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
                    to: Math.min(offset + PAGE_SIZE, total),
                    total,
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
                  document
                    .getElementById('article-feed')
                    ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }}
                total={total}
              />
            </div>
          )}
        </div>
      </section>

      <section className="story-invite">
        <div className="container story-invite__inner">
          <div className="story-invite__copy">
            <span className="section-label section-label--light">{t('Góc cộng đồng')}</span>
            <h2>{t('Món ăn nào gắn với kỷ niệm của bạn?')}</h2>
            <p>
              {t(
                'Kể lại hành trình nấu một món ăn, mẹo nhỏ của bà, của mẹ hay lần đầu bạn tự vào bếp.',
              )}
            </p>
            <div className="story-invite__prompts">
              {storyPrompts.map((prompt) => (
                <Link key={prompt} to="/stories/new">
                  <AppIcon name="pen" size={14} /> {prompt}
                </Link>
              ))}
            </div>
          </div>
          <Link className="button button--cream story-invite__cta" to="/stories/new">
            {t('Viết câu chuyện')} <AppIcon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </div>
  );
}

function ArticleSkeletons({ label }: { label: string }) {
  return (
    <div aria-busy="true" aria-label={label} className="article-feed-grid" role="status">
      {Array.from({ length: 6 }, (_, index) => (
        <div aria-hidden="true" className="article-card article-card--skeleton" key={index}>
          <div className="article-card__media" />
          <div className="article-card__body">
            <span />
            <span />
            <span />
          </div>
        </div>
      ))}
    </div>
  );
}
