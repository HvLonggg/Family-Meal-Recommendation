import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
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
  const { confirm, dialog } = useConfirmDialog();
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

  const decide = async (item: AdminSubmission, status: 'approved' | 'rejected') => {
    const approved = status === 'approved';
    const note = await confirm({
      title: approved
        ? t('Duyệt đề xuất “{name}”?', { name: item.name })
        : t('Từ chối đề xuất “{name}”?', { name: item.name }),
      ...(approved
        ? {
            description: t(
              'Món sẽ được thêm ngay vào kho món công khai. Phần còn thiếu (ảnh, nguyên liệu, các bước) có thể bổ sung sau ở mục Món ăn.',
            ),
          }
        : {}),
      confirmLabel: approved ? t('Duyệt và xuất bản') : t('Từ chối'),
      tone: approved ? 'primary' : 'danger',
      note: {
        label: approved
          ? t('Lời nhắn gửi người đề xuất (không bắt buộc):')
          : t('Lý do chưa phù hợp, gợi ý chỉnh sửa:'),
        defaultValue: item.admin_note ?? '',
      },
    });
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
                  {item.total_minutes > 0
                    ? t('{minutes} phút', { minutes: item.total_minutes })
                    : t('Chưa rõ thời gian')}
                </p>
                <details className="submission-detail">
                  <summary>{t('Xem công thức chi tiết')}</summary>
                  <div>
                    <h3>{t('Câu chuyện')}</h3>
                    <p>{item.story || t('Chưa cung cấp')}</p>
                    <h3>{t('Nguyên liệu')}</h3>
                    {item.ingredients ? (
                      <ul>
                        {item.ingredients.split('\n').map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ul>
                    ) : (
                      <p>{t('Chưa cung cấp')}</p>
                    )}
                    <h3>{t('Các bước')}</h3>
                    {item.steps ? (
                      <ol>
                        {item.steps.split('\n').map((line, index) => (
                          <li key={index}>{line}</li>
                        ))}
                      </ol>
                    ) : (
                      <p>{t('Chưa cung cấp')}</p>
                    )}
                  </div>
                </details>
                {item.admin_note ? (
                  <p className="manage-card__note">
                    <AppIcon name="message" size={15} /> {item.admin_note}
                  </p>
                ) : null}
                <div className="manage-card__actions">
                  {item.recipe_slug ? (
                    <Link className="button button--outline" to={`/recipes/${item.recipe_slug}`}>
                      <AppIcon name="eye" size={15} /> {t('Xem món trong kho')}
                    </Link>
                  ) : null}
                  {item.status !== 'approved' ? (
                    <button
                      className="button button--primary"
                      disabled={review.isPending}
                      onClick={() => void decide(item, 'approved')}
                      type="button"
                    >
                      <AppIcon name="check" size={15} /> {t('Duyệt')}
                    </button>
                  ) : null}
                  {item.status !== 'rejected' ? (
                    <button
                      className="text-button text-button--danger"
                      disabled={review.isPending}
                      onClick={() => void decide(item, 'rejected')}
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
      {dialog}
    </section>
  );
}
