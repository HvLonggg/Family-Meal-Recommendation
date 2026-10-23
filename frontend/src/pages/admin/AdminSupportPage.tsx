import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState, type FormEvent } from 'react';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  StatusBadge,
} from '@/components/ui/Workspace';
import {
  adminKeys,
  listAdminRecipes,
  listAdminSupport,
  listMealSuggestionHistory,
  listMealSuggestionRecipients,
  listSupportRecipients,
  lookupMealRecipient,
  markSupportTicketViewed,
  replyToSupportTicket,
  sendMealSuggestion,
  updateSupportTicket,
  type AdminRecipe,
  type AdminSupportTicket,
  type MealRecipientSource,
  type MealSuggestionEmail,
  type MealType,
  type SupportRecipient,
} from '@/features/admin/adminApi';
import { useAdminFilters } from '@/features/admin/useAdminFilters';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  supportStatusLabels,
  supportTopics,
  type SupportStatus,
} from '@/features/support/supportApi';
import { dishImage } from '@/data/dishImages';
import { errorMessage } from '@/lib/errors';

const LIMIT = 10;
const RECIPE_PAGE_SIZE = 12;
const RECIPIENT_PAGE_SIZE = 5;
const HISTORY_PAGE_SIZE = 6;
const MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner'];
const mealLabels: Record<MealType, string> = {
  breakfast: 'Bữa sáng',
  lunch: 'Bữa trưa',
  dinner: 'Bữa tối',
};
const mealIcons: Record<MealType, IconName> = {
  breakfast: 'sparkles',
  lunch: 'clock',
  dinner: 'moon',
};
const statuses: SupportStatus[] = ['open', 'in_progress', 'resolved'];
const tone = (status: SupportStatus) =>
  status === 'resolved' ? 'success' : status === 'in_progress' ? 'info' : 'warning';
const defaultSubject = (meal: MealType) =>
  ({
    breakfast: 'Gợi ý bữa sáng hôm nay từ Bếp Việt',
    lunch: 'Gợi ý bữa trưa hôm nay từ Bếp Việt',
    dinner: 'Gợi ý bữa tối hôm nay từ Bếp Việt',
  })[meal];
const defaultIntro = (meal: MealType) =>
  ({
    breakfast:
      'Bếp Việt trân trọng gửi bạn một vài gợi ý cho bữa sáng hôm nay. Các món nhanh gọn, đủ chất để bạn bắt đầu ngày mới thật năng lượng.',
    lunch:
      'Bếp Việt trân trọng gửi bạn một vài gợi ý cho bữa trưa hôm nay. Các món được đề xuất để bạn có bữa ăn đủ vị và thuận tiện chuẩn bị.',
    dinner:
      'Bếp Việt trân trọng gửi bạn một vài gợi ý cho bữa tối hôm nay. Các món được đề xuất để bạn dễ kết hợp thành bữa cơm ngon miệng tại nhà.',
  })[meal];
// Email đã tự ký “Thân mến, Đội ngũ Bếp Việt” ở cuối nên lời kết không lặp lại chữ ký.
const defaultClosing = 'Chúc bạn và gia đình có bữa ăn thật ngon miệng!';

interface ComposerRecipient {
  email: string;
  /** Tên tài khoản hoặc tên nhập thủ công. */
  name: string;
  source: MealRecipientSource | 'checking';
}

const recipientSourceLabels: Record<ComposerRecipient['source'], string> = {
  user: 'Tài khoản Bếp Việt',
  support: 'Đã liên hệ hỗ trợ',
  new: 'Email mới',
  checking: 'Đang kiểm tra…',
};

type AdminTab = 'inbox' | 'suggestions';

export function AdminSupportPage() {
  const { t } = useI18n();
  const [tab, setTab] = useState<AdminTab>('inbox');
  const { offset, setFilter, values } = useAdminFilters(['q', 'status'] as const);
  const [search, setSearch] = useState(values.q);
  const params = { ...values, limit: LIMIT, offset };
  const tickets = useQuery({
    queryKey: adminKeys.list('support', params),
    queryFn: ({ signal }) => listAdminSupport(params, signal),
    placeholderData: keepPreviousData,
    enabled: tab === 'inbox',
  });

  return (
    <section className="admin-section admin-support">
      <div className="admin-support__tabs" role="tablist" aria-label={t('Quản lý hỗ trợ')}>
        <button
          aria-selected={tab === 'inbox'}
          className={tab === 'inbox' ? 'is-active' : ''}
          onClick={() => setTab('inbox')}
          role="tab"
          type="button"
        >
          <AppIcon name="message" size={17} /> {t('Hộp thư hỗ trợ')}
          {tickets.data ? (
            <span className="admin-support__tab-count">{tickets.data.total}</span>
          ) : null}
        </button>
        <button
          aria-selected={tab === 'suggestions'}
          className={tab === 'suggestions' ? 'is-active' : ''}
          onClick={() => setTab('suggestions')}
          role="tab"
          type="button"
        >
          <AppIcon name="sparkles" size={17} /> {t('Gửi gợi ý bữa ăn')}
        </button>
      </div>

      {tab === 'inbox' ? (
        <>
          <div className="admin-support__filters">
            <form
              className="admin-support__search"
              onSubmit={(event) => {
                event.preventDefault();
                setFilter('q', search.trim());
              }}
            >
              <label htmlFor="support-search">{t('Tìm yêu cầu')}</label>
              <div>
                <AppIcon name="search" size={18} />
                <input
                  id="support-search"
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={t('Tên, email, tiêu đề hoặc nội dung…')}
                  value={search}
                />
                <Button type="submit">{t('Tìm kiếm')}</Button>
              </div>
            </form>
            <label className="admin-support__status-filter">
              <span>{t('Trạng thái')}</span>
              <select
                onChange={(event) => setFilter('status', event.target.value)}
                value={values.status}
              >
                <option value="">{t('Tất cả trạng thái')}</option>
                {statuses.map((status) => (
                  <option key={status} value={status}>
                    {t(supportStatusLabels[status])}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {tickets.isLoading ? (
            <LoadingBlock label={t('Đang tải yêu cầu hỗ trợ…')} />
          ) : tickets.isError ? (
            <Notice tone="danger">{errorMessage(tickets.error, t)}</Notice>
          ) : !tickets.data?.data.length ? (
            <EmptyState icon="message" title={t('Không có yêu cầu hỗ trợ nào')} />
          ) : (
            <div className="admin-support__ticket-list">
              {tickets.data.data.map((ticket) => (
                <TicketCard key={ticket.id} ticket={ticket} />
              ))}
            </div>
          )}
          <Pagination
            labels={{
              next: t('Trang sau'),
              previous: t('Trang trước'),
              summary: t('{from}–{to} trong {total}', {
                from: tickets.data?.total ? offset + 1 : 0,
                to: Math.min(offset + LIMIT, tickets.data?.total ?? 0),
                total: tickets.data?.total ?? 0,
              }),
            }}
            limit={LIMIT}
            offset={offset}
            onChange={(next) => setFilter('offset', next)}
            total={tickets.data?.total ?? 0}
          />
        </>
      ) : (
        <MealSuggestionComposer />
      )}
    </section>
  );
}

function TicketCard({ ticket }: { ticket: AdminSupportTicket }) {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(ticket.status);
  const [note, setNote] = useState(ticket.admin_note ?? '');
  const [expanded, setExpanded] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyMessage, setReplyMessage] = useState('');
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'support'] });
  const save = useMutation({
    mutationFn: () => updateSupportTicket(ticket.id, { status, admin_note: note }),
    onSuccess: invalidate,
  });
  const viewed = useMutation({
    mutationFn: () => markSupportTicketViewed(ticket.id),
    onSuccess: invalidate,
  });
  const reply = useMutation({
    mutationFn: () =>
      replyToSupportTicket(ticket.id, {
        subject: replySubject.trim(),
        message: replyMessage.trim(),
      }),
    onSuccess: async () => {
      setReplyMessage('');
      await invalidate();
    },
    onError: invalidate,
  });
  const dirty = status !== ticket.status || note !== (ticket.admin_note ?? '');
  const reference = `BV-${ticket.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`;
  const openDetails = () => {
    setExpanded((wasOpen) => !wasOpen);
    if (!expanded && !ticket.viewed_at && !viewed.isPending) viewed.mutate();
    if (!replySubject) setReplySubject(`[${reference}] Re: ${ticket.subject}`);
  };

  return (
    <article className={`admin-support__ticket ${ticket.viewed_at ? '' : 'is-unread'}`}>
      <div className="admin-support__ticket-main">
        <div className="admin-support__ticket-heading">
          <div className="admin-support__ticket-badges">
            <StatusBadge tone={tone(ticket.status)}>
              {t(supportStatusLabels[ticket.status])}
            </StatusBadge>
            <span className={`admin-support__reply-state is-${ticket.reply_status}`}>
              <AppIcon name={ticket.reply_status === 'sent' ? 'check' : 'mail'} size={14} />
              {ticket.reply_status === 'sent'
                ? t('Đã phản hồi')
                : ticket.reply_status === 'failed'
                  ? t('Phản hồi gửi lỗi')
                  : ticket.reply_status === 'sending'
                    ? t('Đang gửi phản hồi')
                    : t('Chưa phản hồi')}
            </span>
            <span className={`admin-support__read-state ${ticket.viewed_at ? '' : 'is-new'}`}>
              <span aria-hidden="true" /> {ticket.viewed_at ? t('Đã xem') : t('Chưa xem')}
            </span>
            <span className="admin-support__mail-state">
              <AppIcon name={ticket.notification_sent_at ? 'check' : 'clock'} size={14} />
              {ticket.notification_sent_at
                ? t('Đã gửi vào hộp thư hỗ trợ')
                : t('Email thông báo chưa gửi thành công')}
              {ticket.notification_attempts > 0
                ? ` · ${t('lần thử {count}', { count: ticket.notification_attempts })}`
                : ''}
            </span>
          </div>
          <button className="admin-support__ticket-toggle" onClick={openDetails} type="button">
            {expanded ? t('Thu gọn') : t('Mở yêu cầu')}
            <AppIcon name="chevron" size={16} />
          </button>
        </div>
        <div className="manage-card__meta">
          <span>{reference}</span>
          <span>{t(supportTopics.find((topic) => topic.id === ticket.topic)?.label ?? '')}</span>
          <span>{formatDate(ticket.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
        </div>
        <h3>{ticket.subject}</h3>
        <p className="ticket-card__from">
          {ticket.name} · <a href={`mailto:${ticket.email}`}>{ticket.email}</a>
        </p>
        {expanded ? (
          <div className="admin-support__ticket-details">
            <p className="ticket-card__message">{ticket.message}</p>
            <div className="admin-support__ticket-controls">
              <label className="ws-field">
                <span>{t('Trạng thái xử lý')}</span>
                <select
                  onChange={(event) => setStatus(event.target.value as SupportStatus)}
                  value={status}
                >
                  {statuses.map((item) => (
                    <option key={item} value={item}>
                      {t(supportStatusLabels[item])}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ws-field">
                <span>{t('Ghi chú nội bộ')}</span>
                <input
                  maxLength={500}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder={t('Ghi chú chỉ hiển thị trong quản trị')}
                  value={note}
                />
              </label>
              <Button disabled={!dirty} isLoading={save.isPending} onClick={() => save.mutate()}>
                {t('Lưu cập nhật')}
              </Button>
            </div>
            {save.isError ? <Notice tone="danger">{errorMessage(save.error, t)}</Notice> : null}
            {viewed.isError ? <Notice tone="danger">{errorMessage(viewed.error, t)}</Notice> : null}
            <div className="admin-support__reply">
              <div className="admin-support__reply-heading">
                <div>
                  <span className="admin-support__eyebrow">{t('PHẢN HỒI QUA EMAIL')}</span>
                  <h4>{t('Trả lời người gửi')}</h4>
                </div>
                <StatusBadge
                  tone={
                    ticket.reply_status === 'sent'
                      ? 'success'
                      : ticket.reply_status === 'failed'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {ticket.reply_status === 'sent'
                    ? t('Đã gửi')
                    : ticket.reply_status === 'failed'
                      ? t('Gửi thất bại')
                      : ticket.reply_status === 'sending'
                        ? t('Đang gửi')
                        : t('Chưa phản hồi')}
                </StatusBadge>
              </div>
              {ticket.reply_sent_at ? (
                <p className="admin-support__delivery-note">
                  {t('Gửi thành công lúc {date}', {
                    date: formatDate(ticket.reply_sent_at, {
                      dateStyle: 'medium',
                      timeStyle: 'short',
                    }),
                  })}
                </p>
              ) : null}
              {ticket.reply_last_error ? (
                <Notice tone="danger">{t(ticket.reply_last_error)}</Notice>
              ) : null}
              <label className="ws-field">
                <span>{t('Tiêu đề email')}</span>
                <input
                  maxLength={180}
                  onChange={(event) => setReplySubject(event.target.value)}
                  value={replySubject || `[${reference}] Re: ${ticket.subject}`}
                />
              </label>
              <label className="ws-field">
                <span>{t('Nội dung phản hồi')}</span>
                <textarea
                  maxLength={4000}
                  onChange={(event) => setReplyMessage(event.target.value)}
                  placeholder={t('Viết lời phản hồi rõ ràng, thân thiện và hữu ích…')}
                  rows={5}
                  value={replyMessage}
                />
              </label>
              <div className="admin-support__reply-footer">
                <span>{t('Email sẽ được gửi tới {email}', { email: ticket.email })}</span>
                <Button
                  disabled={replyMessage.trim().length < 10 || replySubject.trim().length < 3}
                  isLoading={reply.isPending}
                  onClick={() => reply.mutate()}
                >
                  <AppIcon name="mail" size={16} /> {t('Gửi phản hồi')}
                </Button>
              </div>
              {reply.isError ? <Notice tone="danger">{errorMessage(reply.error, t)}</Notice> : null}
              {reply.isSuccess ? (
                <Notice tone="success">{t('Email phản hồi đã được gửi thành công.')}</Notice>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </article>
  );
}

type PickedRecipe = Pick<AdminRecipe, 'slug' | 'name' | 'image_path'>;

/** Phân trang gọn bằng icon: ‹ 2/5 › */
function MiniPager({
  label,
  onChange,
  page,
  pages,
}: {
  label: string;
  onChange: (page: number) => void;
  page: number;
  pages: number;
}) {
  const { t } = useI18n();
  if (pages <= 1) return null;
  return (
    <nav aria-label={label} className="mini-pager">
      <button
        aria-label={t('Trang trước')}
        className="mini-pager__button is-prev"
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        type="button"
      >
        <AppIcon name="arrow" size={14} />
      </button>
      <span aria-live="polite">
        <strong>{page}</strong>/{pages}
      </span>
      <button
        aria-label={t('Trang sau')}
        className="mini-pager__button"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        type="button"
      >
        <AppIcon name="arrow" size={14} />
      </button>
    </nav>
  );
}

const pageCount = (total: number, size: number) => Math.max(1, Math.ceil(total / size));

function MealSuggestionComposer() {
  const { formatDate, t } = useI18n();
  const queryClient = useQueryClient();
  const [mealType, setMealType] = useState<MealType>('dinner');
  const [emailInput, setEmailInput] = useState('');
  const [selectedRecipients, setSelectedRecipients] = useState<ComposerRecipient[]>([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [recipeSearch, setRecipeSearch] = useState('');
  const [recipeOffset, setRecipeOffset] = useState(0);
  const [contactPage, setContactPage] = useState(1);
  const [receivedSearch, setReceivedSearch] = useState('');
  const [receivedPage, setReceivedPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const composerRef = useRef<HTMLFormElement>(null);
  const [selectedRecipes, setSelectedRecipes] = useState<PickedRecipe[]>([]);
  const [subject, setSubject] = useState(defaultSubject('dinner'));
  const [intro, setIntro] = useState(defaultIntro('dinner'));
  const [closing, setClosing] = useState(defaultClosing);
  const [queuedCount, setQueuedCount] = useState<number | null>(null);
  const recipients = useQuery({
    queryKey: ['admin', 'support-recipients', recipientSearch],
    queryFn: ({ signal }) => listSupportRecipients(recipientSearch, signal),
  });
  const recipes = useQuery({
    queryKey: adminKeys.list('recipes', {
      q: recipeSearch,
      status: 'published',
      sort: 'catalog',
      limit: RECIPE_PAGE_SIZE,
      offset: recipeOffset,
    }),
    queryFn: ({ signal }) =>
      listAdminRecipes(
        {
          q: recipeSearch || undefined,
          status: 'published',
          sort: 'catalog',
          limit: RECIPE_PAGE_SIZE,
          offset: recipeOffset,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const received = useQuery({
    queryKey: adminKeys.list('meal-suggestion-recipients', {
      q: receivedSearch,
      page: receivedPage,
    }),
    queryFn: ({ signal }) =>
      listMealSuggestionRecipients(
        {
          q: receivedSearch || undefined,
          limit: RECIPIENT_PAGE_SIZE,
          offset: (receivedPage - 1) * RECIPIENT_PAGE_SIZE,
        },
        signal,
      ),
    placeholderData: keepPreviousData,
  });
  const historyOffset = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const history = useQuery({
    queryKey: adminKeys.list('meal-suggestion-history', {
      limit: HISTORY_PAGE_SIZE,
      offset: historyOffset,
    }),
    queryFn: ({ signal }) =>
      listMealSuggestionHistory({ limit: HISTORY_PAGE_SIZE, offset: historyOffset }, signal),
    placeholderData: keepPreviousData,
    // Email gửi ở nền: tự làm mới khi còn email đang gửi.
    refetchInterval: (query) =>
      query.state.data?.data.some((item) => item.status === 'sending') ? 1500 : false,
  });
  const send = useMutation({
    mutationFn: sendMealSuggestion,
    onSuccess: async (result) => {
      setQueuedCount(result.queued);
      setHistoryPage(1);
      await queryClient.invalidateQueries({ queryKey: ['admin', 'meal-suggestion-history'] });
      await queryClient.invalidateQueries({ queryKey: ['admin', 'meal-suggestion-recipients'] });
    },
  });
  const sendingCount = history.data?.data.filter((item) => item.status === 'sending').length ?? 0;
  const contacts = recipients.data?.data ?? [];
  const contactPages = pageCount(contacts.length, RECIPIENT_PAGE_SIZE);
  const currentContactPage = Math.min(contactPage, contactPages);
  const visibleContacts = contacts.slice(
    (currentContactPage - 1) * RECIPIENT_PAGE_SIZE,
    currentContactPage * RECIPIENT_PAGE_SIZE,
  );
  const selectedEmails = selectedRecipients.map((recipient) => recipient.email);
  const canAddRecipient = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.trim());

  const updateRecipient = (email: string, patch: Partial<ComposerRecipient>) =>
    setSelectedRecipients((current) =>
      current.map((item) => (item.email === email ? { ...item, ...patch } : item)),
    );
  const addRecipient = (email: string, knownName = '') => {
    const normalized = email.trim().toLowerCase();
    if (
      !normalized ||
      selectedRecipients.some((item) => item.email === normalized) ||
      selectedRecipients.length >= 10
    )
      return;
    setSelectedRecipients((current) => [
      ...current,
      { email: normalized, name: knownName, source: 'checking' },
    ]);
    setQueuedCount(null);
    // Dùng tên hệ thống nếu email đã đăng ký.
    queryClient
      .fetchQuery({
        queryKey: ['admin', 'meal-recipient', normalized],
        queryFn: ({ signal }) => lookupMealRecipient(normalized, signal),
      })
      .then((found) =>
        setSelectedRecipients((current) =>
          current.map((item) =>
            item.email !== normalized
              ? item
              : found.source === 'user'
                ? { ...item, name: found.name ?? item.name, source: 'user' }
                : { ...item, name: item.name || found.name || '', source: found.source },
          ),
        ),
      )
      .catch(() => updateRecipient(normalized, { source: 'new' }));
  };
  const removeRecipient = (email: string) => {
    setSelectedRecipients((current) => current.filter((item) => item.email !== email));
    setQueuedCount(null);
  };
  const toggleRecipient = (recipient: SupportRecipient) => {
    if (selectedEmails.includes(recipient.email)) removeRecipient(recipient.email);
    else addRecipient(recipient.email, recipient.name);
  };
  const toggleRecipe = (recipe: PickedRecipe) => {
    setSelectedRecipes((current) =>
      current.some((item) => item.slug === recipe.slug)
        ? current.filter((item) => item.slug !== recipe.slug)
        : current.length < 4
          ? [...current, recipe]
          : current,
    );
    setQueuedCount(null);
  };
  const changeMealType = (value: MealType) => {
    setMealType(value);
    setSubject(defaultSubject(value));
    setIntro(defaultIntro(value));
    setQueuedCount(null);
  };
  /** Gửi lại: nạp người nhận và nội dung cũ vào biểu mẫu để chỉnh rồi gửi tiếp. */
  const resendFrom = (item: MealSuggestionEmail) => {
    setMealType(item.meal_type);
    setSubject(item.subject);
    setIntro(item.intro_message);
    setClosing(item.closing_message);
    setSelectedRecipes(
      item.recipe_data
        .slice(0, 4)
        .map(({ image_path, name, slug }) => ({ image_path, name, slug })),
    );
    setSelectedRecipients([]);
    setQueuedCount(null);
    addRecipient(item.recipient_email, item.recipient_name === 'bạn' ? '' : item.recipient_name);
    composerRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!selectedEmails.length || !selectedRecipes.length) return;
    send.mutate({
      recipient_emails: selectedEmails,
      recipient_names: Object.fromEntries(
        selectedRecipients
          .filter((recipient) => recipient.source !== 'user' && recipient.name.trim())
          .map((recipient) => [recipient.email, recipient.name.trim()]),
      ),
      meal_type: mealType,
      recipe_slugs: selectedRecipes.map((recipe) => recipe.slug),
      subject: subject.trim(),
      intro_message: intro.trim(),
      closing_message: closing.trim(),
    });
  };

  return (
    <div className="admin-support__composer-layout">
      <form className="admin-support__composer" onSubmit={submit} ref={composerRef}>
        <div className="admin-support__section-head">
          <div>
            <span className="admin-support__eyebrow">{t('EMAIL CÁ NHÂN HÓA')}</span>
            <h3>{t('Soạn gợi ý bữa ăn')}</h3>
          </div>
          <span className="admin-support__limit">
            {selectedRecipients.length}/10 {t('người nhận')} · {selectedRecipes.length}/4 {t('món')}
          </span>
        </div>

        <fieldset className="admin-support__meal-toggle">
          <legend>{t('Dịp gợi ý')}</legend>
          {MEAL_TYPES.map((meal) => (
            <button
              aria-pressed={mealType === meal}
              className={mealType === meal ? 'is-active' : ''}
              key={meal}
              onClick={() => changeMealType(meal)}
              type="button"
            >
              <AppIcon name={mealIcons[meal]} size={18} />
              {t(mealLabels[meal])}
            </button>
          ))}
        </fieldset>

        <section className="admin-support__form-section">
          <h4>{t('1. Chọn người nhận')}</h4>
          <div className="admin-support__add-email">
            <label className="ws-field">
              <span>{t('Nhập email người dùng')}</span>
              <input
                autoComplete="email"
                onChange={(event) => setEmailInput(event.target.value)}
                placeholder="ten@vidu.com"
                type="email"
                value={emailInput}
              />
            </label>
            <Button
              disabled={!canAddRecipient || selectedRecipients.length >= 10}
              onClick={() => {
                addRecipient(emailInput);
                setEmailInput('');
              }}
              type="button"
            >
              <AppIcon name="plus" size={16} /> {t('Thêm email')}
            </Button>
          </div>
          <label className="ws-field">
            <span>{t('Hoặc chọn từ người đã liên hệ')}</span>
            <input
              onChange={(event) => {
                setRecipientSearch(event.target.value);
                setContactPage(1);
              }}
              placeholder={t('Tìm theo tên hoặc email…')}
              value={recipientSearch}
            />
          </label>
          {selectedRecipients.length ? (
            <ul aria-label={t('Người nhận đã chọn')} className="admin-support__recipients">
              {selectedRecipients.map((recipient) => {
                const greetingName = recipient.name.trim() || t('bạn');
                return (
                  <li
                    className={`admin-support__recipient is-${recipient.source}`}
                    key={recipient.email}
                  >
                    <span aria-hidden="true" className="admin-support__recipient-avatar">
                      {(recipient.name.trim() || recipient.email).charAt(0).toUpperCase()}
                    </span>
                    <div className="admin-support__recipient-main">
                      {recipient.source === 'user' ? (
                        <strong>{recipient.name}</strong>
                      ) : (
                        <input
                          aria-label={t('Tên gọi trong lời chào cho {email}', {
                            email: recipient.email,
                          })}
                          className="admin-support__recipient-name"
                          maxLength={80}
                          onChange={(event) =>
                            updateRecipient(recipient.email, { name: event.target.value })
                          }
                          placeholder={t('Nhập tên gọi (không bắt buộc)')}
                          value={recipient.name}
                        />
                      )}
                      <small>{recipient.email}</small>
                      <small className="admin-support__greeting">
                        {t('Lời chào: “Chào {name},”', { name: greetingName })}
                      </small>
                    </div>
                    <span className={`admin-support__source is-${recipient.source}`}>
                      {t(recipientSourceLabels[recipient.source])}
                    </span>
                    <button
                      aria-label={t('Bỏ người nhận {email}', { email: recipient.email })}
                      className="admin-support__recipient-remove"
                      onClick={() => removeRecipient(recipient.email)}
                      type="button"
                    >
                      <AppIcon name="close" size={14} />
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="admin-support__hint">
              {t('Chưa chọn người nhận. Có thể thêm tối đa 10 địa chỉ mỗi lần gửi.')}
            </p>
          )}
          <div className="admin-support__recipient-list">
            {recipients.isLoading ? <span>{t('Đang tải danh sách…')}</span> : null}
            {visibleContacts.map((recipient) => {
              const checked = selectedEmails.includes(recipient.email);
              return (
                <label className={checked ? 'is-selected' : ''} key={recipient.email}>
                  <input
                    checked={checked}
                    disabled={!checked && selectedRecipients.length >= 10}
                    onChange={() => toggleRecipient(recipient)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{recipient.name}</strong>
                    <small>{recipient.email}</small>
                  </span>
                  <small>{formatDate(recipient.latest_at, { dateStyle: 'medium' })}</small>
                </label>
              );
            })}
            {!recipients.isLoading && !contacts.length ? (
              <span className="admin-support__hint">
                {t('Chưa có email liên hệ khớp với tìm kiếm.')}
              </span>
            ) : null}
          </div>
          <MiniPager
            label={t('Phân trang người đã liên hệ')}
            onChange={setContactPage}
            page={currentContactPage}
            pages={contactPages}
          />

          <div className="admin-support__received-head">
            <span>
              <AppIcon name="history" size={15} /> {t('Đã nhận gợi ý trước đây')}
            </span>
            <MiniPager
              label={t('Phân trang người đã nhận gợi ý')}
              onChange={setReceivedPage}
              page={receivedPage}
              pages={pageCount(received.data?.total ?? 0, RECIPIENT_PAGE_SIZE)}
            />
          </div>
          <input
            aria-label={t('Tìm người đã nhận gợi ý')}
            className="admin-support__received-search"
            onChange={(event) => {
              setReceivedSearch(event.target.value);
              setReceivedPage(1);
            }}
            placeholder={t('Tìm theo tên hoặc email…')}
            value={receivedSearch}
          />
          <div className="admin-support__recipient-list">
            {received.data?.data.map((recipient) => {
              const checked = selectedEmails.includes(recipient.email);
              return (
                <label className={checked ? 'is-selected' : ''} key={recipient.email}>
                  <input
                    checked={checked}
                    disabled={!checked && selectedRecipients.length >= 10}
                    onChange={() =>
                      checked
                        ? removeRecipient(recipient.email)
                        : addRecipient(recipient.email, recipient.name)
                    }
                    type="checkbox"
                  />
                  <span>
                    <strong>{recipient.name}</strong>
                    <small>{recipient.email}</small>
                  </span>
                  <small className="admin-support__received-meta">
                    <AppIcon name="mail" size={12} /> {recipient.sent_count}
                    {recipient.last_sent_at
                      ? ` · ${formatDate(recipient.last_sent_at, { dateStyle: 'short' })}`
                      : ''}
                  </small>
                </label>
              );
            })}
            {!received.isLoading && !received.data?.data.length ? (
              <span className="admin-support__hint">{t('Chưa có ai nhận gợi ý.')}</span>
            ) : null}
          </div>
        </section>

        <section className="admin-support__form-section">
          <div className="admin-support__section-head">
            <h4>{t('2. Chọn món ăn')}</h4>
            <span className="admin-support__limit">{t('Chọn từ 1 đến 4 món')}</span>
          </div>
          <label className="ws-field">
            <span>{t('Tìm trong danh sách món đang hiển thị')}</span>
            <input
              onChange={(event) => {
                setRecipeSearch(event.target.value);
                setRecipeOffset(0);
              }}
              placeholder={t('Tên món hoặc nguyên liệu…')}
              value={recipeSearch}
            />
          </label>
          {recipes.isError ? <Notice tone="danger">{errorMessage(recipes.error, t)}</Notice> : null}
          <div className="admin-support__recipe-grid">
            {recipes.data?.data.map((entry) => {
              const recipe = entry as AdminRecipe;
              const checked = selectedRecipes.some((item) => item.slug === recipe.slug);
              return (
                <button
                  className={`admin-support__recipe-option ${checked ? 'is-selected' : ''}`}
                  disabled={!checked && selectedRecipes.length >= 4}
                  key={recipe.slug}
                  onClick={() => toggleRecipe(recipe)}
                  type="button"
                >
                  <img
                    alt=""
                    loading="lazy"
                    onError={(event) => {
                      event.currentTarget.style.visibility = 'hidden';
                    }}
                    {...dishImage(recipe.slug, recipe.image_path)}
                  />
                  <span>
                    <strong>{recipe.name}</strong>
                    <small>
                      {recipe.category} · {recipe.cook_minutes + recipe.prep_minutes} {t('phút')}
                    </small>
                  </span>
                  <span className="admin-support__check">
                    <AppIcon name={checked ? 'check' : 'plus'} size={15} />
                  </span>
                </button>
              );
            })}
            {recipes.isLoading ? (
              <span className="admin-support__hint">{t('Đang tải món ăn…')}</span>
            ) : null}
            {!recipes.isLoading && !recipes.data?.data.length ? (
              <span className="admin-support__hint">{t('Không tìm thấy món phù hợp.')}</span>
            ) : null}
          </div>
          <MiniPager
            label={t('Phân trang danh sách món')}
            onChange={(page) => setRecipeOffset((page - 1) * RECIPE_PAGE_SIZE)}
            page={Math.floor(recipeOffset / RECIPE_PAGE_SIZE) + 1}
            pages={pageCount(recipes.data?.total ?? 0, RECIPE_PAGE_SIZE)}
          />
          {selectedRecipes.length ? (
            <div className="admin-support__selected-recipes">
              <strong>{t('Món sẽ xuất hiện trong email')}</strong>
              <div className="admin-support__email-dishes">
                {selectedRecipes.map((recipe, index) => (
                  <figure key={recipe.slug}>
                    <span className="admin-support__email-dish-media">
                      <img alt="" loading="lazy" {...dishImage(recipe.slug, recipe.image_path)} />
                    </span>
                    <figcaption>
                      <small>{t('Món {index}', { index: index + 1 })}</small>
                      <strong>{recipe.name}</strong>
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ) : null}
        </section>

        <section className="admin-support__form-section">
          <div className="admin-support__section-head">
            <h4>{t('3. Chỉnh nội dung email')}</h4>
            <button
              className="admin-support__text-button"
              onClick={() => {
                setSubject(defaultSubject(mealType));
                setIntro(defaultIntro(mealType));
                setClosing(defaultClosing);
              }}
              type="button"
            >
              {t('Khôi phục mẫu')}
            </button>
          </div>
          <label className="ws-field">
            <span>{t('Tiêu đề')}</span>
            <input
              maxLength={180}
              onChange={(event) => setSubject(event.target.value)}
              required
              value={subject}
            />
          </label>
          <label className="ws-field">
            <span>{t('Lời mở đầu')}</span>
            <textarea
              maxLength={1200}
              onChange={(event) => setIntro(event.target.value)}
              required
              rows={4}
              value={intro}
            />
          </label>
          <label className="ws-field">
            <span>{t('Lời kết')}</span>
            <textarea
              maxLength={500}
              onChange={(event) => setClosing(event.target.value)}
              rows={2}
              value={closing}
            />
          </label>
          <p className="admin-support__hint">
            {t(
              'Email dùng ảnh món đã tách nền, đặt trên nền kem sang trọng, kèm nút xem công thức.',
            )}
          </p>
        </section>

        {send.isError ? <Notice tone="danger">{errorMessage(send.error, t)}</Notice> : null}
        {queuedCount ? (
          <Notice tone={sendingCount ? 'info' : 'success'}>
            {sendingCount
              ? t('Đang gửi {count} email ở nền, trạng thái cập nhật trong lịch sử.', {
                  count: sendingCount,
                })
              : t('Đã xử lý xong {count} email, xem kết quả trong lịch sử bên cạnh.', {
                  count: queuedCount,
                })}
          </Notice>
        ) : null}
        <div className="admin-support__submit-row">
          <span>{t('Kiểm tra người nhận và nội dung trước khi gửi.')}</span>
          <Button
            disabled={
              !selectedRecipients.length ||
              !selectedRecipes.length ||
              subject.trim().length < 4 ||
              intro.trim().length < 10
            }
            isLoading={send.isPending}
            type="submit"
          >
            <AppIcon name="mail" size={17} /> {t('Gửi email gợi ý')}
          </Button>
        </div>
      </form>

      <aside className="admin-support__history">
        <div className="admin-support__section-head">
          <div>
            <span className="admin-support__eyebrow">{t('THEO DÕI GỬI')}</span>
            <h3>{t('Lịch sử email')}</h3>
          </div>
          <MiniPager
            label={t('Phân trang lịch sử email')}
            onChange={setHistoryPage}
            page={historyPage}
            pages={pageCount(history.data?.total ?? 0, HISTORY_PAGE_SIZE)}
          />
        </div>
        {history.isLoading ? (
          <LoadingBlock label={t('Đang tải lịch sử…')} />
        ) : history.isError ? (
          <Notice tone="danger">{errorMessage(history.error, t)}</Notice>
        ) : !history.data?.data.length ? (
          <EmptyState icon="message" title={t('Chưa có email gợi ý')} />
        ) : (
          <div className="admin-support__history-list">
            {history.data.data.map((item) => (
              <SuggestionHistoryItem item={item} key={item.id} onResend={resendFrom} />
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

function SuggestionHistoryItem({
  item,
  onResend,
}: {
  item: MealSuggestionEmail;
  onResend: (item: MealSuggestionEmail) => void;
}) {
  const { formatDate, t } = useI18n();
  const when = item.sent_at ?? item.created_at;
  return (
    <article className={`admin-support__history-item is-${item.status}`}>
      <header className="admin-support__history-when">
        <time dateTime={when}>
          <strong>{formatDate(when, { timeStyle: 'short' })}</strong>
          <span>
            {formatDate(when, {
              weekday: 'short',
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            })}
          </span>
        </time>
        <StatusBadge
          tone={item.status === 'sent' ? 'success' : item.status === 'failed' ? 'warning' : 'info'}
        >
          {item.status === 'sent'
            ? t('Đã gửi')
            : item.status === 'failed'
              ? t('Thất bại')
              : t('Đang gửi')}
        </StatusBadge>
      </header>
      <div className="admin-support__history-who">
        <strong>{item.recipient_name}</strong>
        <a href={`mailto:${item.recipient_email}`}>{item.recipient_email}</a>
      </div>
      <p className="admin-support__history-subject">
        <span className="admin-support__meal-chip">
          <AppIcon name={mealIcons[item.meal_type]} size={12} /> {t(mealLabels[item.meal_type])}
        </span>
        {item.subject}
      </p>
      <div className="admin-support__history-recipes">
        {item.recipe_data.slice(0, 4).map((recipe) => (
          <img
            alt={recipe.name}
            key={recipe.slug}
            loading="lazy"
            {...dishImage(recipe.slug, recipe.image_path)}
            title={recipe.name}
          />
        ))}
        <span>{item.recipe_data.map((recipe) => recipe.name).join(' · ')}</span>
      </div>
      {item.error_message ? (
        <small className="admin-support__error-text">{t(item.error_message)}</small>
      ) : null}
      <button
        className="admin-support__resend"
        disabled={item.status === 'sending'}
        onClick={() => onResend(item)}
        type="button"
      >
        <AppIcon name="refresh" size={14} /> {t('Gửi lại')}
      </button>
    </article>
  );
}
