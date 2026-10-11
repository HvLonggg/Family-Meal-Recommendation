import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';

import { ArticleCover } from '@/components/articles/ArticleCover';
import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  StatusBadge,
} from '@/components/ui/Workspace';
import { adminKeys, listAdminArticles, moderateArticle } from '@/features/admin/adminApi';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import {
  articleCategories,
  articleStatusLabels,
  articleStatusTone,
  type ArticleStatus,
  type ArticleSummary,
} from '@/features/articles/articlesApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const LIMIT = 10;

export function AdminArticlesPage() {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const { offset, setFilter, values } = useAdminFilters(['q', 'status', 'kind'] as const);
  const [search, setSearch] = useState(values.q);
  const params = { ...values, limit: LIMIT, offset };
  const articles = useQuery({
    queryKey: adminKeys.list('articles', params),
    queryFn: ({ signal }) => listAdminArticles(params, signal),
    placeholderData: keepPreviousData,
  });
  const moderation = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: Exclude<ArticleStatus, 'draft'>;
      note?: string | null;
    }) => moderateArticle(id, { status, note }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin'] });
      await queryClient.invalidateQueries({ queryKey: ['articles'] });
    },
  });

  const reject = (article: ArticleSummary) => {
    const note = window.prompt(
      t('Ghi chú gửi tác giả (lý do cần chỉnh sửa):'),
      article.moderation_note ?? '',
    );
    if (note === null) return;
    moderation.mutate({ id: article.id, status: 'rejected', note });
  };

  return (
    <section className="admin-section">
      <div className="admin-filters">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            setFilter('q', search.trim());
          }}
        >
          <SearchField
            actionLabel={t('Tìm')}
            label={t('Tìm bài viết')}
            onChange={setSearch}
            placeholder={t('Tiêu đề hoặc tóm tắt…')}
            value={search}
          />
        </form>
        <select
          aria-label={t('Trạng thái')}
          onChange={(event) => setFilter('status', event.target.value)}
          value={values.status}
        >
          <option value="">{t('Mọi trạng thái')}</option>
          {(Object.keys(articleStatusLabels) as ArticleStatus[]).map((status) => (
            <option key={status} value={status}>
              {t(articleStatusLabels[status])}
            </option>
          ))}
        </select>
        <select
          aria-label={t('Loại bài')}
          onChange={(event) => setFilter('kind', event.target.value)}
          value={values.kind}
        >
          <option value="">{t('Mọi loại bài')}</option>
          <option value="editorial">{t('Bài viết biên tập')}</option>
          <option value="story">{t('Câu chuyện căn bếp')}</option>
        </select>
        <Link className="button button--primary" to="/stories/new?kind=editorial">
          <AppIcon name="plus" size={16} /> {t('Viết bài mới')}
        </Link>
      </div>
      {moderation.isError ? (
        <Notice tone="danger">{errorMessage(moderation.error, t)}</Notice>
      ) : null}

      {articles.isLoading ? (
        <LoadingBlock label={t('Đang tải bài viết…')} />
      ) : articles.isError ? (
        <Notice tone="danger">{errorMessage(articles.error, t)}</Notice>
      ) : !articles.data?.data.length ? (
        <EmptyState icon="pen" title={t('Không có bài viết phù hợp')} />
      ) : (
        <div className="manage-list">
          {articles.data.data.map((article) => (
            <article className="manage-card" key={article.id}>
              <ArticleCover article={article} className="manage-card__media" />
              <div className="manage-card__body">
                <div className="manage-card__meta">
                  <StatusBadge tone={articleStatusTone[article.status]}>
                    {t(articleStatusLabels[article.status])}
                  </StatusBadge>
                  <span>
                    {article.kind === 'story' ? t('Câu chuyện căn bếp') : t('Bài viết biên tập')}
                  </span>
                  <span>
                    {t(articleCategories.find((item) => item.id === article.category)?.label ?? '')}
                  </span>
                  <span>
                    {article.author.display === 'editorial'
                      ? t('Ban biên tập Bếp Việt')
                      : article.author.full_name || t('Thành viên Bếp Việt')}
                  </span>
                  <span>
                    {formatDate(article.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <h2>{article.title}</h2>
                <p>{article.excerpt}</p>
                {article.moderation_note ? (
                  <p className="manage-card__note">
                    <AppIcon name="message" size={15} /> {article.moderation_note}
                  </p>
                ) : null}
                <div className="manage-card__actions">
                  <Link className="text-link" target="_blank" to={`/articles/${article.slug}`}>
                    {t('Xem trước')} <AppIcon name="eye" size={15} />
                  </Link>
                  <Link className="button button--outline" to={`/stories/${article.id}/edit`}>
                    <AppIcon name="pen" size={15} /> {t('Biên tập')}
                  </Link>
                  {article.status !== 'published' ? (
                    <button
                      className="button button--primary"
                      disabled={moderation.isPending}
                      onClick={() => moderation.mutate({ id: article.id, status: 'published' })}
                      type="button"
                    >
                      <AppIcon name="check" size={15} /> {t('Duyệt & xuất bản')}
                    </button>
                  ) : (
                    <button
                      className="text-button"
                      disabled={moderation.isPending}
                      onClick={() => moderation.mutate({ id: article.id, status: 'hidden' })}
                      type="button"
                    >
                      {t('Ẩn bài')}
                    </button>
                  )}
                  {article.status !== 'rejected' ? (
                    <button
                      className="text-button text-button--danger"
                      disabled={moderation.isPending}
                      onClick={() => reject(article)}
                      type="button"
                    >
                      {t('Yêu cầu chỉnh sửa')}
                    </button>
                  ) : null}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      <Pagination
        labels={{
          next: t('Trang sau'),
          previous: t('Trang trước'),
          summary: t('{from}–{to} trong {total}', {
            from: offset + 1,
            to: Math.min(offset + LIMIT, articles.data?.total ?? 0),
            total: articles.data?.total ?? 0,
          }),
        }}
        limit={LIMIT}
        offset={offset}
        onChange={(next) => setFilter('offset', next)}
        total={articles.data?.total ?? 0}
      />
    </section>
  );
}
