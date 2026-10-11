import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { UserAvatar } from '@/components/common/UserAvatar';
import { Button } from '@/components/ui/Button';
import { Notice, StatusBadge } from '@/components/ui/Workspace';
import { contactInfo, phoneHref } from '@/config/contact';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  createSupportTicket,
  listMySupportTickets,
  supportStatusLabels,
  supportTopics,
  type SupportTicketCreate,
  type SupportTopic,
} from '@/features/support/supportApi';
import { ApiError } from '@/lib/api/client';
import { errorMessage } from '@/lib/errors';

const emptyForm = (name = '', email = ''): SupportTicketCreate => ({
  name,
  email,
  topic: 'general',
  subject: '',
  message: '',
  website: '',
});

export function ContactPage() {
  const { user } = useAuth();
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SupportTicketCreate>(() =>
    emptyForm(user?.full_name ?? '', user?.email ?? ''),
  );
  const [receipt, setReceipt] = useState<string | null>(null);
  const tickets = useQuery({
    queryKey: ['support-tickets', user?.id],
    queryFn: ({ signal }) => listMySupportTickets(signal),
    enabled: Boolean(user),
  });
  const send = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: async (result) => {
      setReceipt(result.reference);
      setForm(emptyForm(user?.full_name ?? '', user?.email ?? ''));
      await queryClient.invalidateQueries({ queryKey: ['support-tickets', user?.id] });
    },
  });

  const channels: { icon: IconName; label: string; value: string; href?: string; note?: string }[] =
    [
      {
        icon: 'mail',
        label: 'Email hỗ trợ',
        value: contactInfo.email,
        href: `mailto:${contactInfo.email}`,
        note: contactInfo.responseTime,
      },
      ...(contactInfo.phone
        ? [
            {
              icon: 'phone' as const,
              label: 'Điện thoại',
              value: contactInfo.phone,
              href: phoneHref(contactInfo.phone),
            },
          ]
        : []),
      ...(contactInfo.zalo
        ? [
            {
              icon: 'message' as const,
              label: 'Zalo',
              value: contactInfo.zalo,
              href: `https://zalo.me/${contactInfo.zalo.replace(/[^\d]/g, '')}`,
            },
          ]
        : []),
    ];

  const update = <K extends keyof SupportTicketCreate>(key: K, value: SupportTicketCreate[K]) => {
    setReceipt(null);
    send.reset();
    setForm((current) => ({ ...current, [key]: value }));
  };
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    send.mutate(form);
  };

  return (
    <div className="page-wrap contact-page contact-page--compact">
      <section className="contact-page__intro">
        <div className="container">
          <span className="section-label">{t('Liên hệ & hỗ trợ')}</span>
          <h1>{t('Bếp Việt luôn lắng nghe')}</h1>
          <p>
            {t(
              'Mình trân trọng mọi góp ý. Bếp Việt sẽ phản hồi bạn qua email trong 1–2 ngày làm việc.',
            )}
          </p>
        </div>
      </section>

      <section className="content-section contact-page__content">
        <div className="container contact-layout">
          <div className="contact-aside">
            <article className="contact-person">
              <UserAvatar name={contactInfo.ownerName} size={52} />
              <div>
                <strong>{contactInfo.ownerName}</strong>
                <small>{t(contactInfo.ownerRole)}</small>
                <p>{t('Cảm ơn bạn đã đồng hành và giúp Bếp Việt hoàn thiện hơn.')}</p>
              </div>
            </article>
            <ul className="contact-channels">
              {channels.map((channel) => (
                <li key={channel.label}>
                  <span className="contact-channels__icon">
                    <AppIcon name={channel.icon} size={19} />
                  </span>
                  <div>
                    <small>{t(channel.label)}</small>
                    {channel.href ? (
                      <a
                        href={channel.href}
                        rel="noreferrer"
                        target={channel.href.startsWith('http') ? '_blank' : undefined}
                      >
                        {channel.value}
                      </a>
                    ) : (
                      <strong>{t(channel.value)}</strong>
                    )}
                    {channel.note ? <em>{t(channel.note)}</em> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <form className="submission-form contact-form" onSubmit={submit}>
            <div>
              <h2>{t('Gửi yêu cầu hỗ trợ')}</h2>
              <p>{t('Điền thông tin, mình sẽ phản hồi qua email bạn cung cấp.')}</p>
            </div>
            {receipt ? (
              <Notice tone="success">
                {t(
                  'Yêu cầu đã được xếp hàng gửi tới {email}. Bếp Việt sẽ phản hồi qua email trong 1–2 ngày làm việc.',
                  { email: contactInfo.email },
                )}{' '}
                {t('Mã yêu cầu: {code}.', { code: receipt })}
              </Notice>
            ) : null}
            {send.isError ? (
              <Notice tone="danger">
                {send.error instanceof ApiError && send.error.fieldErrors.email
                  ? t('Email chưa đúng định dạng.')
                  : errorMessage(send.error, t)}
              </Notice>
            ) : null}
            <div className="form-row">
              <label>
                <span>{t('Họ và tên')} *</span>
                <input
                  autoComplete="name"
                  maxLength={120}
                  minLength={2}
                  onChange={(event) => update('name', event.target.value)}
                  required
                  value={form.name}
                />
              </label>
              <label>
                <span>{t('Email nhận phản hồi')} *</span>
                <input
                  autoComplete="email"
                  maxLength={320}
                  onChange={(event) => update('email', event.target.value)}
                  required
                  type="email"
                  value={form.email}
                />
              </label>
            </div>
            <div className="form-row">
              <label>
                <span>{t('Chủ đề')}</span>
                <select
                  onChange={(event) => update('topic', event.target.value as SupportTopic)}
                  value={form.topic}
                >
                  {supportTopics.map((topic) => (
                    <option key={topic.id} value={topic.id}>
                      {t(topic.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Tiêu đề')} *</span>
                <input
                  maxLength={160}
                  minLength={4}
                  onChange={(event) => update('subject', event.target.value)}
                  placeholder={t('Tóm tắt vấn đề trong một câu')}
                  required
                  value={form.subject}
                />
              </label>
            </div>
            <div className="ws-field">
              <label>
                <span>{t('Nội dung')} *</span>
                <textarea
                  aria-describedby="contact-message-count"
                  maxLength={4000}
                  minLength={20}
                  onChange={(event) => update('message', event.target.value)}
                  placeholder={t('Bạn cần Bếp Việt hỗ trợ điều gì?')}
                  required
                  rows={4}
                  value={form.message}
                />
              </label>
              <small id="contact-message-count">
                {t('{count}/4000 ký tự', { count: form.message.length })}
              </small>
            </div>
            <label aria-hidden="true" className="honeypot">
              <span>Website</span>
              <input
                autoComplete="off"
                onChange={(event) => update('website', event.target.value)}
                tabIndex={-1}
                value={form.website}
              />
            </label>
            <Button className="contact-form__submit" isLoading={send.isPending} type="submit">
              <AppIcon name="mail" size={17} /> {t('Gửi yêu cầu')}
            </Button>
          </form>
        </div>
      </section>

      {user && tickets.data?.data.length ? (
        <section className="contact-history-section">
          <div className="container">
            <details className="contact-history">
              <summary>
                {t('Yêu cầu bạn đã gửi')} · {tickets.data.data.length}
                <AppIcon name="chevron" size={18} />
              </summary>
              <ul className="ticket-list">
                {tickets.data.data.map((ticket) => (
                  <li key={ticket.id}>
                    <div>
                      <strong>{ticket.subject}</strong>
                      <small>
                        {t(supportTopics.find((topic) => topic.id === ticket.topic)?.label ?? '')} ·{' '}
                        {formatDate(ticket.created_at, { dateStyle: 'medium', timeStyle: 'short' })}
                      </small>
                      {ticket.admin_note ? (
                        <p>
                          <AppIcon name="message" size={14} /> {ticket.admin_note}
                        </p>
                      ) : null}
                    </div>
                    <StatusBadge
                      tone={
                        ticket.status === 'resolved'
                          ? 'success'
                          : ticket.status === 'in_progress'
                            ? 'info'
                            : 'warning'
                      }
                    >
                      {t(supportStatusLabels[ticket.status])}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </details>
          </div>
        </section>
      ) : null}
    </div>
  );
}
