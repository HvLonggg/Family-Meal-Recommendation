import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  StatusBadge,
} from '@/components/ui/Workspace';
import { adminKeys, listAdminSupport, updateSupportTicket } from '@/features/admin/adminApi';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  supportStatusLabels,
  supportTopics,
  type SupportStatus,
  type SupportTicket,
} from '@/features/support/supportApi';
import { errorMessage } from '@/lib/errors';

const LIMIT = 10;
const statuses: SupportStatus[] = ['open', 'in_progress', 'resolved'];
const tone = (status: SupportStatus) =>
  status === 'resolved' ? 'success' : status === 'in_progress' ? 'info' : 'warning';

export function AdminSupportPage() {
  const { t } = useI18n();
  const { offset, setFilter, values } = useAdminFilters(['status'] as const);
  const params = { ...values, limit: LIMIT, offset };
  const tickets = useQuery({
    queryKey: adminKeys.list('support', params),
    queryFn: ({ signal }) => listAdminSupport(params, signal),
    placeholderData: keepPreviousData,
  });

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
        {statuses.map((status) => (
          <button
            aria-selected={values.status === status}
            className={values.status === status ? 'is-active' : ''}
            key={status}
            onClick={() => setFilter('status', status)}
            role="tab"
            type="button"
          >
            {t(supportStatusLabels[status])}
          </button>
        ))}
      </div>
      {tickets.isLoading ? (
        <LoadingBlock label={t('Đang tải yêu cầu hỗ trợ…')} />
      ) : tickets.isError ? (
        <Notice tone="danger">{errorMessage(tickets.error, t)}</Notice>
      ) : !tickets.data?.data.length ? (
        <EmptyState icon="message" title={t('Không có yêu cầu hỗ trợ nào')} />
      ) : (
        <div className="manage-list">
          {tickets.data.data.map((ticket) => (
            <TicketCard key={`${ticket.id}:${ticket.updated_at}`} ticket={ticket} />
          ))}
        </div>
      )}
      <Pagination
        labels={{
          next: t('Trang sau'),
          previous: t('Trang trước'),
          summary: t('{from}–{to} trong {total}', {
            from: offset + 1,
            to: Math.min(offset + LIMIT, tickets.data?.total ?? 0),
            total: tickets.data?.total ?? 0,
          }),
        }}
        limit={LIMIT}
        offset={offset}
        onChange={(next) => setFilter('offset', next)}
        total={tickets.data?.total ?? 0}
      />
    </section>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(ticket.status);
  const [note, setNote] = useState(ticket.admin_note ?? '');
  const save = useMutation({
    mutationFn: () => updateSupportTicket(ticket.id, { status, admin_note: note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin'] }),
  });
  const dirty = status !== ticket.status || note !== (ticket.admin_note ?? '');
  const reference = `BV-${ticket.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;

  return (
    <article className="manage-card manage-card--compact ticket-card">
      <div className="manage-card__icon">
        <AppIcon name="message" size={22} />
      </div>
      <div className="manage-card__body">
        <div className="manage-card__meta">
          <StatusBadge tone={tone(ticket.status)}>
            {t(supportStatusLabels[ticket.status])}
          </StatusBadge>
          <span>{reference}</span>
          <span>{t(supportTopics.find((topic) => topic.id === ticket.topic)?.label ?? '')}</span>
          <span>{formatDate(ticket.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <h2>{ticket.subject}</h2>
        <p className="ticket-card__from">
          {ticket.name} ·{' '}
          <a
            href={`mailto:${ticket.email}?subject=${encodeURIComponent(`[${reference}] ${ticket.subject}`)}`}
          >
            {ticket.email}
          </a>
        </p>
        <p className="ticket-card__message">{ticket.message}</p>
        <div className="ticket-card__handle">
          <select
            aria-label={t('Trạng thái')}
            onChange={(event) => setStatus(event.target.value as SupportStatus)}
            value={status}
          >
            {statuses.map((item) => (
              <option key={item} value={item}>
                {t(supportStatusLabels[item])}
              </option>
            ))}
          </select>
          <input
            aria-label={t('Ghi chú xử lý')}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('Ghi chú xử lý (người gửi sẽ thấy khi đăng nhập)')}
            value={note}
          />
          <Button disabled={!dirty} isLoading={save.isPending} onClick={() => save.mutate()}>
            {t('Cập nhật')}
          </Button>
        </div>
        {save.isError ? <Notice tone="danger">{errorMessage(save.error, t)}</Notice> : null}
      </div>
    </article>
  );
}
