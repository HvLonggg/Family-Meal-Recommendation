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
  getSupportContactInfo,
  listMySupportTickets,
  supportStatusLabels,
  supportTopics,
  type SupportTicketCreate,
  type SupportTopic,
} from '@/features/support/supportApi';
import { formatDisplayDateTime } from '@/lib/formatDate';

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
  const { t } = useI18n();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SupportTicketCreate>(() =>
    emptyForm(user?.full_name ?? '', user?.email ?? ''),
  );
  const [receipt, setReceipt] = useState(false);
  const contactSettings = useQuery({
    queryKey: ['support-contact-info'],
    queryFn: ({ signal }) => getSupportContactInfo(signal),
  });
  const supportEmail = contactSettings.data?.support_email;
  // Email hỗ trợ và thời gian phản hồi chỉ nêu một lần (cột kênh liên hệ và phần giới thiệu).
  const supportInboxMessage = supportEmail
    ? t('Phản hồi sẽ được gửi về email bạn nhập bên dưới.')
    : contactSettings.isLoading
      ? t('Đang tải thông tin hòm thư hỗ trợ…')
      : t(
          'Chưa tải được địa chỉ hòm thư hỗ trợ. Hòm thư tiếp nhận sẽ được xác nhận sau khi gửi yêu cầu.',
        );
  const tickets = useQuery({
    queryKey: ['support-tickets', user?.id],
    queryFn: ({ signal }) => listMySupportTickets(signal),
    enabled: Boolean(user),
  });
  const send = useMutation({
    mutationFn: createSupportTicket,
    onSuccess: async () => {
      setReceipt(true);
      setForm(emptyForm(user?.full_name ?? '', user?.email ?? ''));
      await queryClient.invalidateQueries({ queryKey: ['support-tickets', user?.id] });
    },
  });

  const channels: { icon: IconName; label: string; value: string; href?: string; note?: string }[] =
    [
      {
        icon: 'mail',
        label: 'Email hỗ trợ',
        value:
          supportEmail ??
          (contactSettings.isLoading ? t('Đang tải…') : t('Hòm thư hỗ trợ chưa tải được')),
        ...(supportEmail ? { href: `mailto:${supportEmail}` } : {}),
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
    setReceipt(false);
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
              'Mình trân trọng mọi góp ý. Bếp Việt sẽ phản hồi bạn qua email trong vòng 24 giờ làm việc.',
            )}
          </p>
        </div>
      </section>

      <section className="content-section contact-page__content">
        <div className="container contact-layout">
          <div className="contact-aside">
            <article className="contact-person">
              <UserAvatar
                name={contactInfo.ownerName}
                size={88}
                src="/images/brand/long-avatar.webp"
              />
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
              <p>{supportInboxMessage}</p>
            </div>
            {receipt ? (
              <Notice tone="success">
                {t('Gửi thư thành công. Bếp Việt sẽ phản hồi qua email của bạn.')}
              </Notice>
            ) : null}
            {send.isError ? (
              <Notice tone="danger">{t('Chưa gửi được thư. Vui lòng thử lại sau.')}</Notice>
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
                <span>{t('Email người gửi')} *</span>
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
                  maxLength={4000}
                  minLength={20}
                  onChange={(event) => update('message', event.target.value)}
                  placeholder={t('Bạn cần Bếp Việt hỗ trợ điều gì?')}
                  required
                  rows={4}
                  value={form.message}
                />
              </label>
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
                        {formatDisplayDateTime(ticket.created_at)}
                      </small>
                      {ticket.reply_status === 'sent' && ticket.reply_message ? (
                        <div className="ticket-list__reply">
                          <strong>{t('Phản hồi từ Bếp Việt')}</strong>
                          {ticket.reply_sent_at ? (
                            <small>{formatDisplayDateTime(ticket.reply_sent_at)}</small>
                          ) : null}
                          <p>{ticket.reply_message}</p>
                        </div>
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
