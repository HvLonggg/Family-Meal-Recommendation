import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { ArticleCover } from '@/components/articles/ArticleCover';
import { EmptyState, LoadingBlock, Notice, StatusBadge } from '@/components/ui/Workspace';
import {
  articleCategories,
  articleStatusLabels,
  articleStatusTone,
  deleteArticle,
  listMyArticles,
} from '@/features/articles/articlesApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

export function MyStoriesPage() {
  const { user } = useAuth();
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const queryKey = ['my-articles', user?.id];
  const stories = useQuery({
    queryKey,
    queryFn: ({ signal }) => listMyArticles(signal),
    enabled: Boolean(user),
  });
  const removal = useMutation({
    mutationFn: deleteArticle,
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  return (
    <>
      <header className="ws-heading ws-heading--with-action">
        <div>
          <span className="section-label">{t('Cộng đồng Bếp Việt')}</span>
          <h1>{t('Câu chuyện của tôi')}</h1>
          <p>
            {t(
              'Quản lý các câu chuyện căn bếp bạn đã viết. Bài mới hoặc bài chỉnh sửa sẽ được ban biên tập duyệt trước khi hiển thị.',
            )}
          </p>
        </div>
        <Link className="button button--primary" to="/stories/new">
          <AppIcon name="pen" size={17} /> {t('Viết câu chuyện mới')}
        </Link>
      </header>

      {removal.isError ? <Notice tone="danger">{errorMessage(removal.error, t)}</Notice> : null}

      {stories.isLoading ? (
        <LoadingBlock label={t('Đang tải câu chuyện của bạn…')} />
      ) : stories.isError ? (
        <Notice tone="danger">{errorMessage(stories.error, t)}</Notice>
      ) : stories.data?.data.length ? (
        <div className="manage-list">
          {stories.data.data.map((story) => (
            <article className="manage-card" key={story.id}>
              <ArticleCover article={story} className="manage-card__media" />
              <div className="manage-card__body">
                <div className="manage-card__meta">
                  <StatusBadge tone={articleStatusTone[story.status]}>
                    {t(articleStatusLabels[story.status])}
                  </StatusBadge>
                  <span>
                    {t(articleCategories.find((item) => item.id === story.category)?.label ?? '')}
                  </span>
                  <span>
                    {t('Cập nhật {date}', {
                      date: formatDate(story.updated_at, { dateStyle: 'medium' }),
                    })}
                  </span>
                </div>
                <h2>{story.title}</h2>
                <p>{story.excerpt}</p>
                {story.moderation_note ? (
                  <p className="manage-card__note">
                    <AppIcon name="message" size={15} /> {t('Ghi chú từ ban biên tập')}:{' '}
                    {story.moderation_note}
                  </p>
                ) : null}
                <div className="manage-card__actions">
                  {story.status === 'published' ? (
                    <Link className="text-link" to={`/articles/${story.slug}`}>
                      {t('Xem bài')} <AppIcon name="arrow" size={15} />
                    </Link>
                  ) : (
                    <Link className="text-link" to={`/articles/${story.slug}`}>
                      {t('Xem trước')} <AppIcon name="eye" size={15} />
                    </Link>
                  )}
                  <Link className="button button--outline" to={`/stories/${story.id}/edit`}>
                    <AppIcon name="pen" size={15} /> {t('Chỉnh sửa')}
                  </Link>
                  <button
                    className="text-button text-button--danger"
                    disabled={removal.isPending}
                    onClick={() => {
                      if (
                        window.confirm(
                          t('Xóa vĩnh viễn câu chuyện “{title}”?', { title: story.title }),
                        )
                      )
                        removal.mutate(story.id);
                    }}
                    type="button"
                  >
                    <AppIcon name="trash" size={15} /> {t('Xóa')}
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <EmptyState
          action={
            <Link className="button button--primary" to="/stories/new">
              {t('Viết câu chuyện đầu tiên')}
            </Link>
          }
          description={t(
            'Chia sẻ kỷ niệm, mẹo nhỏ hay hành trình nấu một món ăn để cộng đồng cùng học hỏi.',
          )}
          icon="pen"
          title={t('Bạn chưa có câu chuyện nào')}
        />
      )}
    </>
  );
}
