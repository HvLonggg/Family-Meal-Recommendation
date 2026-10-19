import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';

import { ActivityBars, MeterList } from '@/components/admin/AdminCharts';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { UserAvatar } from '@/components/common/UserAvatar';
import {
  EmptyState,
  LoadingBlock,
  Notice,
  Pagination,
  Panel,
  StatusBadge,
} from '@/components/ui/Workspace';
import { profileDetails, type MealProfile } from '@/data/randomMeals';
import {
  adminKeys,
  getAdminUser,
  getAdminUserPlans,
  listAdminUserActivity,
  listAdminUserCooked,
  listAdminUserFavorites,
  type ActivityKind,
  type AdminActivityEvent,
  type AdminPlanItem,
  type AdminUserDetail,
} from '@/features/admin/adminApi';
import {
  activityActionLabels,
  activityKinds,
  activityTone,
  mealLabels,
  planStatusLabels,
  planStatusTone,
  providerLabels,
} from '@/features/admin/labels';
import { useUserAccessActions } from '@/features/admin/useUserAccessActions';
import { articleStatusLabels, type ArticleStatus } from '@/features/articles/articlesApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { LOCALES } from '@/features/i18n/translate';
import {
  submissionStatusLabels,
  type SubmissionStatus,
} from '@/features/submissions/submissionsApi';
import { supportStatusLabels, type SupportStatus } from '@/features/support/supportApi';
import { dishImage } from '@/data/dishImages';
import { errorMessage } from '@/lib/errors';

type Tab = 'overview' | 'plans' | 'cooked' | 'favorites' | 'activity';

const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'chart' },
  { id: 'plans', label: 'Kế hoạch', icon: 'calendar' },
  { id: 'cooked', label: 'Đã nấu', icon: 'chef' },
  { id: 'favorites', label: 'Yêu thích', icon: 'heart' },
  { id: 'activity', label: 'Hành vi', icon: 'history' },
];

const GRID_LIMIT = 12;

/** Đọc ngày `YYYY-MM-DD` theo giờ địa phương. */
const localDay = (day: string) => `${day.slice(0, 10)}T00:00:00`;

function useRelativeTime() {
  const { language } = useI18n();
  return (value: string) => {
    const seconds = (Date.parse(value) - Date.now()) / 1000;
    const units: [Intl.RelativeTimeFormatUnit, number][] = [
      ['year', 31536000],
      ['month', 2592000],
      ['week', 604800],
      ['day', 86400],
      ['hour', 3600],
      ['minute', 60],
    ];
    const format = new Intl.RelativeTimeFormat(LOCALES[language], { numeric: 'auto' });
    for (const [unit, size] of units) {
      if (Math.abs(seconds) >= size) return format.format(Math.round(seconds / size), unit);
    }
    return format.format(0, 'minute');
  };
}

export function AdminUserDetailPage() {
  const { userId = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const tab = tabs.find((item) => item.id === params.get('tab'))?.id ?? 'overview';
  const { t } = useI18n();
  const detail = useQuery({
    queryKey: adminKeys.user(userId),
    queryFn: ({ signal }) => getAdminUser(userId, signal),
    enabled: Boolean(userId),
  });

  const selectTab = (next: Tab) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next === 'overview') updated.delete('tab');
        else updated.set('tab', next);
        updated.delete('offset');
        return updated;
      },
      { replace: true },
    );

  if (detail.isLoading) return <LoadingBlock label={t('Đang tải hồ sơ người dùng…')} />;
  if (detail.isError || !detail.data)
    return (
      <section className="admin-section">
        <BackLink />
        <Notice tone="danger">{errorMessage(detail.error, t)}</Notice>
      </section>
    );

  return (
    <section className="admin-section user-detail">
      <BackLink />
      <UserHero detail={detail.data} />
      <UserKpis detail={detail.data} onSelect={selectTab} />
      <nav aria-label={t('Hồ sơ người dùng')} className="segmented" role="tablist">
        {tabs.map((item) => (
          <button
            aria-selected={tab === item.id}
            className={`segmented__item${tab === item.id ? ' is-active' : ''}`}
            key={item.id}
            onClick={() => selectTab(item.id)}
            role="tab"
            type="button"
          >
            <AppIcon name={item.icon} size={16} />
            <span>{t(item.label)}</span>
          </button>
        ))}
      </nav>
      <div className="user-detail__panel" key={tab} role="tabpanel">
        {tab === 'overview' ? <OverviewTab detail={detail.data} onSelect={selectTab} /> : null}
        {tab === 'plans' ? <PlansTab userId={userId} /> : null}
        {tab === 'cooked' ? <CookedTab userId={userId} /> : null}
        {tab === 'favorites' ? <FavoritesTab userId={userId} /> : null}
        {tab === 'activity' ? <ActivityTab userId={userId} /> : null}
      </div>
    </section>
  );
}

function BackLink() {
  const { t } = useI18n();
  return (
    <Link className="back-link" to="/admin/users">
      <AppIcon name="arrow" size={16} />
      {t('Tất cả người dùng')}
    </Link>
  );
}

function UserHero({ detail }: { detail: AdminUserDetail }) {
  const { user: currentUser } = useAuth();
  const { formatDate, t } = useI18n();
  const relative = useRelativeTime();
  const actions = useUserAccessActions();
  const { user } = detail;
  const isSelf = user.id === currentUser?.id;

  return (
    <header className="user-hero">
      <UserAvatar
        className="user-hero__avatar"
        name={user.full_name}
        size={76}
        src={user.avatar_url}
      />
      <div className="user-hero__main">
        <div className="user-hero__title">
          <h2>{user.full_name}</h2>
          <StatusBadge tone={user.role === 'admin' ? 'info' : 'neutral'}>
            {user.role === 'admin' ? t('Quản trị viên') : t('Thành viên')}
          </StatusBadge>
          <StatusBadge tone={user.status === 'active' ? 'success' : 'danger'}>
            {user.status === 'active' ? t('Đang hoạt động') : t('Đã khóa')}
          </StatusBadge>
        </div>
        <p className="user-hero__email">
          <AppIcon name="mail" size={15} />
          {user.email ?? '—'}
          {user.email ? (
            <span className={`verify-chip${detail.email_verified ? ' is-verified' : ''}`}>
              <AppIcon name={detail.email_verified ? 'check' : 'clock'} size={12} />
              {detail.email_verified ? t('Đã xác minh') : t('Chưa xác minh')}
            </span>
          ) : null}
        </p>
        <dl className="user-hero__facts">
          <div>
            <dt>{t('Tham gia')}</dt>
            <dd>{formatDate(user.created_at, { dateStyle: 'medium' })}</dd>
          </div>
          <div>
            <dt>{t('Đăng nhập gần nhất')}</dt>
            <dd>
              {user.last_login_at ? (
                <time
                  dateTime={user.last_login_at}
                  title={formatDate(user.last_login_at, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                >
                  {relative(user.last_login_at)}
                </time>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>{t('Hoạt động gần nhất')}</dt>
            <dd>
              {detail.last_active_at ? (
                <time dateTime={detail.last_active_at}>{relative(detail.last_active_at)}</time>
              ) : (
                '—'
              )}
            </dd>
          </div>
          <div>
            <dt>{t('Đăng nhập bằng')}</dt>
            <dd className="user-hero__providers">
              {detail.providers.length
                ? detail.providers.map((provider) => (
                    <span key={provider}>{t(providerLabels[provider] ?? provider)}</span>
                  ))
                : '—'}
            </dd>
          </div>
        </dl>
      </div>
      <div className="user-hero__actions">
        <button
          className="button button--secondary"
          disabled={isSelf || actions.mutation.isPending}
          onClick={() => actions.toggleRole(user)}
          title={isSelf ? t('Bạn không thể tự đổi quyền của mình') : undefined}
          type="button"
        >
          <AppIcon name="shield" size={16} />
          <span>{user.role === 'admin' ? t('Bỏ quyền QT') : t('Cấp quyền QT')}</span>
        </button>
        <button
          className={`button ${user.status === 'active' ? 'button--danger-soft' : 'button--primary'}`}
          disabled={isSelf || actions.mutation.isPending}
          onClick={() => actions.toggleStatus(user)}
          type="button"
        >
          <AppIcon name="lock" size={16} />
          <span>{user.status === 'active' ? t('Khóa tài khoản') : t('Mở khóa')}</span>
        </button>
      </div>
      {actions.mutation.isError ? (
        <Notice tone="danger">{errorMessage(actions.mutation.error, t)}</Notice>
      ) : null}
      <ConfirmDialog
        isPending={actions.mutation.isPending}
        onClose={actions.closeConfirm}
        request={actions.confirm}
      />
    </header>
  );
}

function UserKpis({ detail, onSelect }: { detail: AdminUserDetail; onSelect: (tab: Tab) => void }) {
  const { formatNumber, t } = useI18n();
  const { stats } = detail;
  const decided = stats.plan_completed + stats.plan_skipped;
  const rate = decided ? Math.round((stats.plan_completed / decided) * 100) : null;
  const kpis: { icon: IconName; label: string; value: number; hint: string; tab: Tab }[] = [
    {
      icon: 'calendar',
      label: 'Món trong kế hoạch',
      value: stats.plan_total,
      hint: t('{count} sắp tới', { count: stats.plan_upcoming }),
      tab: 'plans',
    },
    {
      icon: 'chef',
      label: 'Lượt đã nấu',
      value: stats.plan_completed,
      hint:
        rate === null
          ? t('{count} món khác nhau', { count: stats.cooked_recipes })
          : t('{count} món · hoàn thành {rate}%', { count: stats.cooked_recipes, rate }),
      tab: 'cooked',
    },
    {
      icon: 'heart',
      label: 'Món yêu thích',
      value: stats.favorites,
      hint: t('{count} mâm cơm đã lưu', { count: stats.saved_meals }),
      tab: 'favorites',
    },
    {
      icon: 'pen',
      label: 'Đóng góp',
      value: stats.stories + stats.submissions,
      hint: t('{stories} bài viết · {submissions} đề xuất', {
        stories: stats.stories,
        submissions: stats.submissions,
      }),
      tab: 'activity',
    },
  ];
  return (
    <div className="admin-kpis">
      {kpis.map((kpi) => (
        <button
          className="admin-kpi"
          key={kpi.label}
          onClick={() => onSelect(kpi.tab)}
          type="button"
        >
          <span className="admin-kpi__icon">
            <AppIcon name={kpi.icon} size={18} />
          </span>
          <small>{t(kpi.label)}</small>
          <strong>{formatNumber(kpi.value)}</strong>
          <em>{kpi.hint}</em>
          <span aria-hidden="true" className="admin-kpi__go">
            <AppIcon name="arrow" size={16} />
          </span>
        </button>
      ))}
    </div>
  );
}

function OverviewTab({
  detail,
  onSelect,
}: {
  detail: AdminUserDetail;
  onSelect: (tab: Tab) => void;
}) {
  const { formatDate, t } = useI18n();
  const { stats } = detail;
  return (
    <div className="user-overview">
      <Panel
        className="user-overview__activity"
        description={t('Thao tác kế hoạch, yêu thích và mâm cơm đã lưu mỗi ngày.')}
        icon="chart"
        title={t('Mức độ hoạt động 30 ngày')}
      >
        <ActivityBars data={detail.activity} label="Thao tác" />
      </Panel>
      <Panel
        icon="sparkles"
        title={t('Khẩu vị')}
        description={t('Dựa trên món yêu thích và món đã nấu.')}
      >
        <div className="taste-grid">
          <div>
            <h3>{t('Vùng miền')}</h3>
            <MeterList emptyText={t('Chưa đủ dữ liệu.')} items={detail.regions} />
          </div>
          <div>
            <h3>{t('Loại món')}</h3>
            <MeterList emptyText={t('Chưa đủ dữ liệu.')} items={detail.categories} />
          </div>
        </div>
      </Panel>
      <Panel
        actions={
          <button className="text-link" onClick={() => onSelect('cooked')} type="button">
            {t('Xem tất cả')} <AppIcon name="arrow" size={15} />
          </button>
        }
        icon="chef"
        title={t('Món nấu nhiều nhất')}
      >
        {detail.top_cooked.length ? (
          <ol className="rank-list">
            {detail.top_cooked.map((recipe, index) => (
              <li key={recipe.slug}>
                <span className="rank-list__no">{index + 1}</span>
                <img alt="" loading="lazy" {...dishImage(recipe.slug, recipe.image_path)} />
                <div>
                  <Link target="_blank" to={`/recipes/${recipe.slug}`}>
                    {recipe.name}
                  </Link>
                  <small>
                    {t('Lần cuối {date}', {
                      date: formatDate(localDay(recipe.last_cooked), { dateStyle: 'medium' }),
                    })}
                  </small>
                </div>
                <strong>{t('{count} lần', { count: recipe.times })}</strong>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">{t('Người dùng chưa đánh dấu món nào là đã nấu.')}</p>
        )}
      </Panel>
      <Panel icon="shield" title={t('Tài khoản & hỗ trợ')}>
        <ul className="fact-list">
          <li>
            <span>{t('Phiên đăng nhập còn hiệu lực')}</span>
            <strong>{stats.active_sessions}</strong>
          </li>
          <li>
            <span>{t('Bữa đã bỏ qua')}</span>
            <strong>{stats.plan_skipped}</strong>
          </li>
          <li>
            <span>{t('Mâm cơm đã lưu')}</span>
            <strong>{stats.saved_meals}</strong>
          </li>
          <li>
            <span>{t('Yêu cầu hỗ trợ')}</span>
            <strong>{stats.tickets}</strong>
          </li>
        </ul>
        <button className="text-link" onClick={() => onSelect('activity')} type="button">
          {t('Xem dòng hành vi chi tiết')} <AppIcon name="arrow" size={15} />
        </button>
      </Panel>
    </div>
  );
}

type PlanFilter = 'all' | 'upcoming' | 'completed' | 'skipped';

const planFilters: {
  id: PlanFilter;
  label: string;
  match: (item: AdminPlanItem, today: string) => boolean;
}[] = [
  { id: 'all', label: 'Tất cả', match: () => true },
  { id: 'upcoming', label: 'Sắp tới', match: (item, today) => item.plan_date >= today },
  { id: 'completed', label: 'Đã nấu', match: (item) => item.completion_status === 'completed' },
  { id: 'skipped', label: 'Đã bỏ qua', match: (item) => item.completion_status === 'skipped' },
];

function PlansTab({ userId }: { userId: string }) {
  const { formatDate, t } = useI18n();
  const [filter, setFilter] = useState<PlanFilter>('all');
  const plans = useQuery({
    queryKey: adminKeys.userPlans(userId),
    queryFn: ({ signal }) => getAdminUserPlans(userId, signal),
  });
  const today = new Date().toLocaleDateString('sv-SE');
  const grouped = useMemo(() => {
    const match = planFilters.find((item) => item.id === filter)?.match ?? (() => true);
    const groups = new Map<string, AdminPlanItem[]>();
    for (const item of plans.data?.data ?? []) {
      if (match(item, today))
        groups.set(item.plan_date, [...(groups.get(item.plan_date) ?? []), item]);
    }
    const entries = [...groups.entries()];
    // Sắp tới đọc theo thứ tự thời gian; các bộ lọc khác giữ mới nhất lên trước.
    return filter === 'upcoming' ? entries.reverse() : entries;
  }, [plans.data, filter, today]);

  if (plans.isLoading) return <LoadingBlock label={t('Đang tải kế hoạch…')} />;
  if (plans.isError || !plans.data)
    return <Notice tone="danger">{errorMessage(plans.error, t)}</Notice>;

  return (
    <Panel
      actions={
        <ChipGroup
          label={t('Lọc kế hoạch')}
          onChange={setFilter}
          options={planFilters.map((item) => ({
            id: item.id,
            label: t(item.label),
            count: plans.data.data.filter((plan) => item.match(plan, today)).length,
          }))}
          value={filter}
        />
      }
      description={t('{count} món trong kế hoạch (hiển thị tối đa 200 mục gần nhất).', {
        count: plans.data.total,
      })}
      icon="calendar"
      title={t('Kế hoạch bữa ăn')}
    >
      {grouped.length === 0 ? (
        <EmptyState icon="calendar" title={t('Không có món nào phù hợp bộ lọc')} />
      ) : (
        <ol className="plan-timeline">
          {grouped.map(([date, items]) => (
            <li className={date === today ? 'is-today' : ''} key={date}>
              <time dateTime={date}>
                {formatDate(localDay(date), {
                  weekday: 'long',
                  day: '2-digit',
                  month: '2-digit',
                  year: 'numeric',
                })}
                {date === today ? <span className="today-chip">{t('Hôm nay')}</span> : null}
              </time>
              <ul>
                {items.map((item) => (
                  <li key={item.id}>
                    <img alt="" loading="lazy" {...dishImage(item.recipe_slug, item.image_path)} />
                    <div>
                      <Link target="_blank" to={`/recipes/${item.recipe_slug}`}>
                        {item.recipe_name}
                      </Link>
                      <small>
                        {t(mealLabels[item.meal_type])} ·{' '}
                        {t('{count} khẩu phần', { count: item.servings })}
                      </small>
                    </div>
                    <StatusBadge tone={planStatusTone[item.completion_status]}>
                      {t(planStatusLabels[item.completion_status])}
                    </StatusBadge>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

function usePagedSection<T>(
  userId: string,
  section: 'cooked' | 'favorites',
  fetcher: (
    id: string,
    params: Record<string, number>,
    signal?: AbortSignal,
  ) => Promise<{ data: T[]; total: number }>,
) {
  const [params, setParams] = useSearchParams();
  const offset = Math.max(0, Number(params.get('offset') ?? 0) || 0);
  const query = { limit: GRID_LIMIT, offset };
  const result = useQuery({
    queryKey: adminKeys.userSection(userId, section, query),
    queryFn: ({ signal }) => fetcher(userId, query, signal),
    placeholderData: keepPreviousData,
  });
  const setOffset = (next: number) =>
    setParams(
      (current) => {
        const updated = new URLSearchParams(current);
        if (next) updated.set('offset', String(next));
        else updated.delete('offset');
        return updated;
      },
      { replace: true },
    );
  return { result, offset, setOffset };
}

function GridPagination({
  offset,
  onChange,
  total,
}: {
  offset: number;
  onChange: (next: number) => void;
  total: number;
}) {
  const { t } = useI18n();
  return (
    <Pagination
      labels={{
        next: t('Trang sau'),
        previous: t('Trang trước'),
        summary: t('{from}–{to} trong {total}', {
          from: offset + 1,
          to: Math.min(offset + GRID_LIMIT, total),
          total,
        }),
      }}
      limit={GRID_LIMIT}
      offset={offset}
      onChange={onChange}
      total={total}
    />
  );
}

function RecipeTile({
  badge,
  children,
  image,
  muted = false,
  name,
  slug,
}: {
  badge?: ReactNode;
  children: ReactNode;
  image: string;
  muted?: boolean;
  name: string;
  slug: string;
}) {
  return (
    <li className={`recipe-tile${muted ? ' is-muted' : ''}`}>
      <Link target="_blank" to={`/recipes/${slug}`}>
        <span className="recipe-tile__media">
          <img alt="" loading="lazy" {...dishImage(slug, image, '320px')} />
          {badge ? <span className="recipe-tile__badge">{badge}</span> : null}
        </span>
        <span className="recipe-tile__body">
          <strong>{name}</strong>
          {children}
        </span>
      </Link>
    </li>
  );
}

function CookedTab({ userId }: { userId: string }) {
  const { formatDate, t } = useI18n();
  const { offset, result, setOffset } = usePagedSection(userId, 'cooked', listAdminUserCooked);
  if (result.isLoading) return <LoadingBlock label={t('Đang tải món đã nấu…')} />;
  if (result.isError || !result.data)
    return <Notice tone="danger">{errorMessage(result.error, t)}</Notice>;
  if (!result.data.data.length)
    return (
      <EmptyState
        description={t('Món được đánh dấu “Đã nấu” trong kế hoạch sẽ xuất hiện ở đây.')}
        icon="chef"
        title={t('Chưa nấu món nào')}
      />
    );
  return (
    <>
      <ul className="recipe-tiles">
        {result.data.data.map((recipe) => (
          <RecipeTile
            badge={
              <>
                <AppIcon name="check" size={13} /> {t('{count} lần', { count: recipe.times })}
              </>
            }
            image={recipe.image_path}
            key={recipe.slug}
            name={recipe.name}
            slug={recipe.slug}
          >
            <small>
              {t(recipe.region)} · {t(recipe.category)}
            </small>
            <small>
              {t('Lần cuối {date}', {
                date: formatDate(localDay(recipe.last_cooked), { dateStyle: 'medium' }),
              })}{' '}
              · {t('{count} khẩu phần', { count: recipe.servings })}
            </small>
          </RecipeTile>
        ))}
      </ul>
      <GridPagination offset={offset} onChange={setOffset} total={result.data.total} />
    </>
  );
}

function FavoritesTab({ userId }: { userId: string }) {
  const { formatDate, t } = useI18n();
  const { offset, result, setOffset } = usePagedSection(
    userId,
    'favorites',
    listAdminUserFavorites,
  );
  if (result.isLoading) return <LoadingBlock label={t('Đang tải món yêu thích…')} />;
  if (result.isError || !result.data)
    return <Notice tone="danger">{errorMessage(result.error, t)}</Notice>;
  if (!result.data.data.length)
    return <EmptyState icon="heart" title={t('Người dùng chưa lưu món yêu thích nào')} />;
  return (
    <>
      <ul className="recipe-tiles">
        {result.data.data.map((recipe) => (
          <RecipeTile
            badge={
              recipe.cooked_times ? (
                <>
                  <AppIcon name="check" size={13} />{' '}
                  {t('Đã nấu {count} lần', { count: recipe.cooked_times })}
                </>
              ) : (
                <>
                  <AppIcon name="heart" size={13} /> {t('Chưa nấu')}
                </>
              )
            }
            image={recipe.image_path}
            key={recipe.slug}
            muted={recipe.status !== 'published'}
            name={recipe.name}
            slug={recipe.slug}
          >
            <small>
              {t(recipe.region)} · {t(recipe.category)}
            </small>
            <small>
              {t('Lưu {date}', { date: formatDate(recipe.favorited_at, { dateStyle: 'medium' }) })}
              {recipe.status !== 'published' ? ` · ${t('Món đang ẩn')}` : ''}
            </small>
          </RecipeTile>
        ))}
      </ul>
      <GridPagination offset={offset} onChange={setOffset} total={result.data.total} />
    </>
  );
}

function ChipGroup<T extends string>({
  label,
  onChange,
  options,
  value,
}: {
  label: string;
  onChange: (value: T) => void;
  options: { id: T; label: string; count?: number; icon?: IconName }[];
  value: T;
}) {
  return (
    <div aria-label={label} className="chip-group" role="group">
      {options.map((option) => (
        <button
          aria-pressed={value === option.id}
          className={`chip${value === option.id ? ' is-active' : ''}`}
          key={option.id}
          onClick={() => onChange(option.id)}
          type="button"
        >
          {option.icon ? <AppIcon name={option.icon} size={14} /> : null}
          {option.label}
          {option.count !== undefined ? <span className="chip__count">{option.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

const ACTIVITY_LIMIT = 30;

function ActivityTab({ userId }: { userId: string }) {
  const { formatDate, t } = useI18n();
  const [kind, setKind] = useState<ActivityKind | 'all'>('all');
  const activity = useInfiniteQuery({
    queryKey: adminKeys.userSection(userId, 'activity', { kind }),
    queryFn: ({ pageParam, signal }) =>
      listAdminUserActivity(
        userId,
        { kind: kind === 'all' ? undefined : kind, before: pageParam, limit: ACTIVITY_LIMIT },
        signal,
      ),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_before ?? undefined,
  });
  const days = useMemo(() => {
    const groups = new Map<string, AdminActivityEvent[]>();
    for (const event of activity.data?.pages.flatMap((page) => page.data) ?? []) {
      const day = new Date(event.occurred_at).toLocaleDateString('sv-SE');
      groups.set(day, [...(groups.get(day) ?? []), event]);
    }
    return [...groups.entries()];
  }, [activity.data]);

  return (
    <Panel
      actions={
        <ChipGroup
          label={t('Lọc hành vi')}
          onChange={setKind}
          options={[
            { id: 'all' as const, label: t('Tất cả') },
            ...activityKinds.map((item) => ({
              id: item.kind,
              label: t(item.label),
              icon: item.icon,
            })),
          ]}
          value={kind}
        />
      }
      description={t('Mọi thao tác của người dùng trong ứng dụng, mới nhất ở trên cùng.')}
      icon="history"
      title={t('Dòng hành vi')}
    >
      {activity.isLoading ? (
        <LoadingBlock label={t('Đang tải hoạt động…')} />
      ) : activity.isError ? (
        <Notice tone="danger">{errorMessage(activity.error, t)}</Notice>
      ) : !days.length ? (
        <EmptyState icon="history" title={t('Chưa ghi nhận hoạt động nào')} />
      ) : (
        <>
          <ol className="activity-feed">
            {days.map(([day, events]) => (
              <li key={day}>
                <h3 className="activity-feed__day">
                  {formatDate(localDay(day), {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  })}
                </h3>
                <ul>
                  {events.map((event) => (
                    <ActivityRow event={event} key={event.id} />
                  ))}
                </ul>
              </li>
            ))}
          </ol>
          {activity.hasNextPage ? (
            <button
              className="button button--secondary load-more"
              disabled={activity.isFetchingNextPage}
              onClick={() => void activity.fetchNextPage()}
              type="button"
            >
              {activity.isFetchingNextPage ? t('Đang tải…') : t('Xem hoạt động cũ hơn')}
            </button>
          ) : (
            <p className="activity-feed__end">{t('Đã hiển thị toàn bộ hoạt động.')}</p>
          )}
        </>
      )}
    </Panel>
  );
}

function statusText(event: AdminActivityEvent) {
  if (!event.status) return null;
  if (event.kind === 'story') return articleStatusLabels[event.status as ArticleStatus];
  if (event.kind === 'submission') return submissionStatusLabels[event.status as SubmissionStatus];
  if (event.kind === 'support') return supportStatusLabels[event.status as SupportStatus];
  return null;
}

function ActivityRow({ event }: { event: AdminActivityEvent }) {
  const { formatDate, t } = useI18n();
  const key = `${event.kind}:${event.action}`;
  const icon = activityKinds.find((item) => item.kind === event.kind)?.icon ?? 'history';
  const tone = activityTone[key] ?? 'neutral';
  const title =
    event.kind === 'saved_meal'
      ? t('Mâm {name}', {
          name: t(profileDetails[event.title as MealProfile]?.label ?? event.title),
        })
      : event.title;
  const status = statusText(event);
  const details: string[] = [];
  if (event.plan_date)
    details.push(
      t('cho {meal} {date}', {
        meal: event.meal_type ? t(mealLabels[event.meal_type]).toLowerCase() : '',
        date: formatDate(localDay(event.plan_date), { day: '2-digit', month: '2-digit' }),
      }),
    );
  if (event.servings) details.push(t('{count} khẩu phần', { count: event.servings }));
  if (event.count) details.push(t('{count} món', { count: event.count }));

  return (
    <li className={`activity-row activity-row--${tone}`}>
      <span className="activity-row__icon">
        <AppIcon name={icon} size={16} />
      </span>
      <div className="activity-row__body">
        <p>
          <span className="activity-row__action">
            {t(activityActionLabels[key] ?? event.action)}
          </span>{' '}
          {event.recipe_slug ? (
            <Link target="_blank" to={`/recipes/${event.recipe_slug}`}>
              {title}
            </Link>
          ) : (
            <strong>{title}</strong>
          )}
        </p>
        {details.length || status ? (
          <small>
            {details.join(' · ')}
            {status ? <StatusBadge>{t(status)}</StatusBadge> : null}
          </small>
        ) : null}
      </div>
      {event.image_path ? (
        <img alt="" loading="lazy" {...dishImage(event.recipe_slug, event.image_path)} />
      ) : null}
      <time dateTime={event.occurred_at}>
        {formatDate(event.occurred_at, { hour: '2-digit', minute: '2-digit' })}
      </time>
    </li>
  );
}
