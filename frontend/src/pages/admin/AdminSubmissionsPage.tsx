import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { AppIcon } from '@/components/common/AppIcon';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  StatusBadge,
} from '@/components/ui/Workspace';
import { adminKeys, listAdminSubmissions, reviewSubmission } from '@/features/admin/adminApi';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  submissionStatusLabels,
  submissionStatusTone,
  type AdminSubmission,
  type SubmissionStatus,
} from '@/features/submissions/submissionsApi';
import { errorMessage } from '@/lib/errors';

const LIMIT = 10;
const filters: SubmissionStatus[] = ['pending', 'approved', 'rejected'];

export function AdminSubmissionsPage() {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const { offset, setFilter, values } = useAdminFilters(['status'] as const);
  const params = { ...values, limit: LIMIT, offset };
  const submissions = useQuery({
    queryKey: adminKeys.list('submissions', params),
    queryFn: ({ signal }) => listAdminSubmissions(params, signal),
    placeholderData: keepPreviousData,
  });
  const review = useMutation({
    mutationFn: ({
      id,
      status,
      note,
    }: {
      id: string;
      status: Exclude<SubmissionStatus, 'draft'>;
      note?: string | null;
    }) => reviewSubmission(id, { status, admin_note: note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });

  const decide = (item: AdminSubmission, status: 'approved' | 'rejected') => {
    const note = window.prompt(
      status === 'approved'
        ? t('Lời nhắn gửi người đề xuất (không bắt buộc):')
        : t('Lý do chưa phù hợp, gợi ý chỉnh sửa:'),
      item.admin_note ?? '',
    );
    if (note === null) return;
    review.mutate({ id: item.id, status, note });
  };

  return (
    <section className="admin-section">
      <div className="tab-pills" role="tablist" aria-label={t('Trạng thái')}>
        <button
          aria-selected={!values.status}
          className={!values.status ? 'is-active' : ''}
          onClick={() => setFilter('status', '')}
          role="tab"
          type="button"
        >
          {t('Tất cả')}
        </button>
        {filters.map((status) => (
          <button
            aria-selected={values.status === status}
            className={values.status === status ? 'is-active' : ''}
            key={status}
            onClick={() => setFilter('status', status)}
            role="tab"
            type="button"
          >
            {t(submissionStatusLabels[status])}
          </button>
        ))}
      </div>
      {review.isError ? <Notice tone="danger">{errorMessage(review.error, t)}</Notice> : null}

      {submissions.isLoading ? (
        <LoadingBlock label={t('Đang tải đề xuất…')} />
      ) : submissions.isError ? (
        <Notice tone="danger">{errorMessage(submissions.error, t)}</Notice>
      ) : !submissions.data?.data.length ? (
        <EmptyState icon="chef" title={t('Chưa có đề xuất món nào')} />
      ) : (
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
                    {item.submitter.full_name} · {item.submitter.email ?? '—'}
                  </span>
                  <span>
                    {formatDate(item.updated_at, { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </div>
                <h2>{item.name}</h2>
                <p>
                  {t(item.region)} · {t(item.category)} ·{' '}
                  {t('{count} người', { count: item.servings })} ·{' '}
                  {t('{minutes} phút', { minutes: item.total_minutes })}
                </p>
                <details className="submission-detail">
                  <summary>{t('Xem công thức chi tiết')}</summary>
                  <div>
                    <h3>{t('Câu chuyện')}</h3>
                    <p>{item.story}</p>
                    <h3>{t('Nguyên liệu')}</h3>
                    <ul>
                      {item.ingredients.split('\n').map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ul>
                    <h3>{t('Các bước')}</h3>
                    <ol>
                      {item.steps.split('\n').map((line, index) => (
                        <li key={index}>{line}</li>
                      ))}
                    </ol>
                  </div>
                </details>
                {item.admin_note ? (
                  <p className="manage-card__note">
                    <AppIcon name="message" size={15} /> {item.admin_note}
                  </p>
                ) : null}
                <div className="manage-card__actions">
                  {item.status !== 'approved' ? (
                    <button
                      className="button button--primary"
                      disabled={review.isPending}
                      onClick={() => decide(item, 'approved')}
                      type="button"
                    >
                      <AppIcon name="check" size={15} /> {t('Duyệt')}
                    </button>
                  ) : null}
                  {item.status !== 'rejected' ? (
                    <button
                      className="text-button text-button--danger"
                      disabled={review.isPending}
                      onClick={() => decide(item, 'rejected')}
                      type="button"
                    >
                      {t('Chưa phù hợp')}
                    </button>
                  ) : null}
                  {item.status !== 'pending' ? (
                    <button
                      className="text-button"
                      disabled={review.isPending}
                      onClick={() =>
                        review.mutate({ id: item.id, status: 'pending', note: item.admin_note })
                      }
                      type="button"
                    >
                      {t('Đưa về chờ duyệt')}
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
            to: Math.min(offset + LIMIT, submissions.data?.total ?? 0),
            total: submissions.data?.total ?? 0,
          }),
        }}
        limit={LIMIT}
        offset={offset}
        onChange={(next) => setFilter('offset', next)}
        total={submissions.data?.total ?? 0}
      />
    </section>
  );
}
