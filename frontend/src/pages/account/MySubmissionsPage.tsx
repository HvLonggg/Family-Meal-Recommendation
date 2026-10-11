import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { EmptyState, LoadingBlock, Notice, StatusBadge } from '@/components/ui/Workspace';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  deleteSubmission,
  listMySubmissions,
  mySubmissionsQueryKey,
  submissionStatusLabels,
  submissionStatusTone,
} from '@/features/submissions/submissionsApi';
import { errorMessage } from '@/lib/errors';

export function MySubmissionsPage() {
  const { user } = useAuth();
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const submissions = useQuery({
    queryKey: mySubmissionsQueryKey(user?.id),
    queryFn: ({ signal }) => listMySubmissions(signal),
    enabled: Boolean(user),
  });
  const removal = useMutation({
    mutationFn: deleteSubmission,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: mySubmissionsQueryKey(user?.id) }),
  });

  return (
    <>
      <header className="ws-heading ws-heading--with-action">
        <div>
          <span className="section-label">{t('Đề xuất món mới')}</span>
          <h1>{t('Món tôi đề xuất')}</h1>
          <p>{t('Theo dõi trạng thái duyệt và cập nhật công thức bạn đã gửi cho ban nội dung.')}</p>
        </div>
        <Link className="button button--primary" to="/submit-recipe">
          <AppIcon name="plus" size={17} /> {t('Đề xuất món mới')}
        </Link>
      </header>

      {removal.isError ? <Notice tone="danger">{errorMessage(removal.error, t)}</Notice> : null}

      {submissions.isLoading ? (
        <LoadingBlock label={t('Đang tải đề xuất của bạn…')} />
      ) : submissions.isError ? (
        <Notice tone="danger">{errorMessage(submissions.error, t)}</Notice>
      ) : submissions.data?.data.length ? (
        <div className="manage-list">
          {submissions.data.data.map((item) => (
            <article className="manage-card manage-card--compact" key={item.id}>
              <div className="manage-card__icon">
                <AppIcon name="chef" size={22} />
              </div>
              <div className="manage-card__body">
                <div className="manage-card__meta">
                  <StatusBadge tone={submissionStatusTone[item.status]}>
                    {t(submissionStatusLabels[item.status])}
                  </StatusBadge>
                  <span>
                    {t(item.region)} · {t(item.category)} ·{' '}
                    {t('{count} người', { count: item.servings })}
                  </span>
                  <span>{formatDate(item.updated_at, { dateStyle: 'medium' })}</span>
                </div>
                <h2>{item.name}</h2>
                <p>{item.story}</p>
                {item.admin_note ? (
                  <p className="manage-card__note">
                    <AppIcon name="message" size={15} /> {t('Phản hồi từ ban nội dung')}:{' '}
                    {item.admin_note}
                  </p>
                ) : null}
                <div className="manage-card__actions">
                  {item.status !== 'approved' ? (
                    <Link className="button button--outline" to={`/submit-recipe?edit=${item.id}`}>
                      <AppIcon name="pen" size={15} /> {t('Chỉnh sửa')}
                    </Link>
                  ) : (
                    <small className="manage-card__locked">
                      {t('Đề xuất đã được duyệt nên không thể chỉnh sửa.')}
                    </small>
                  )}
                  <button
                    className="text-button text-button--danger"
                    disabled={removal.isPending}
                    onClick={() => {
                      if (window.confirm(t('Xóa đề xuất “{name}”?', { name: item.name })))
                        removal.mutate(item.id);
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
            <Link className="button button--primary" to="/submit-recipe">
              {t('Đề xuất món đầu tiên')}
            </Link>
          }
          description={t(
            'Món ngon của gia đình bạn có thể trở thành cảm hứng cho nhiều bữa cơm khác.',
          )}
          icon="chef"
          title={t('Bạn chưa đề xuất món nào')}
        />
      )}
    </>
  );
}
