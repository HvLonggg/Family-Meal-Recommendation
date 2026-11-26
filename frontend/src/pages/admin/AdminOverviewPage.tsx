import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router';

import { DistributionBars, KpiCard, TrendChart } from '@/components/admin/AdminCharts';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { UserAvatar } from '@/components/common/UserAvatar';
import { LoadingBlock, Notice, Panel } from '@/components/ui/Workspace';
import {
  adminKeys,
  getAdminInsights,
  getAdminOverview,
  INSIGHT_PERIODS,
  type InsightPeriod,
  type TrendKey,
} from '@/features/admin/adminApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { dishImage } from '@/data/dishImages';
import { errorMessage } from '@/lib/errors';

type MetricConfig = { key: TrendKey; label: string; to: string; linkLabel: string };

const DEFAULT_METRIC: MetricConfig = {
  key: 'active_users',
  label: 'Người dùng hoạt động',
  to: '/admin/users',
  linkLabel: 'Xem người dùng',
};

const METRICS: MetricConfig[] = [
  { key: 'signups', label: 'Người dùng mới', to: '/admin/users', linkLabel: 'Xem người dùng' },
  DEFAULT_METRIC,
  {
    key: 'plans_created',
    label: 'Món thêm vào kế hoạch',
    to: '/admin/plans',
    linkLabel: 'Xem kế hoạch',
  },
  {
    key: 'recipes_cooked',
    label: 'Lượt nấu xong',
    to: '/admin/recipes?sort=cooked',
    linkLabel: 'Món được nấu nhiều',
  },
  {
    key: 'favorites',
    label: 'Lượt yêu thích',
    to: '/admin/recipes?sort=favorites',
    linkLabel: 'Món được yêu thích',
  },
];

function readPeriod(value: string | null): InsightPeriod {
  const parsed = Number(value);
  return (INSIGHT_PERIODS as readonly number[]).includes(parsed) ? (parsed as InsightPeriod) : 30;
}

function readMetric(value: string | null): TrendKey {
  return METRICS.some((metric) => metric.key === value) ? (value as TrendKey) : 'active_users';
}

export function AdminOverviewPage() {
  const { formatDate, formatNumber, t } = useI18n();
  const [params, setParams] = useSearchParams();
  const period = readPeriod(params.get('period'));
  const metricKey = readMetric(params.get('metric'));
  const update = (key: string, value: string) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.set(key, value);
        return next;
      },
      { replace: true },
    );

  const overview = useQuery({
    queryKey: adminKeys.overview(),
    queryFn: ({ signal }) => getAdminOverview(signal),
  });
  const insights = useQuery({
    queryKey: adminKeys.insights(period),
    queryFn: ({ signal }) => getAdminInsights(signal, period),
    placeholderData: keepPreviousData,
  });

  if (overview.isLoading) return <LoadingBlock label={t('Đang tổng hợp số liệu…')} />;
  if (overview.isError || !overview.data)
    return <Notice tone="danger">{errorMessage(overview.error, t)}</Notice>;

  const { counts, recent_users: recentUsers } = overview.data;
  const metrics = insights.data?.metrics ?? [];
  const selected = METRICS.find((metric) => metric.key === metricKey) ?? DEFAULT_METRIC;
  const selectedData = metrics.find((metric) => metric.key === selected.key);

  const queue: { icon: IconName; label: string; count: number; to: string; hint?: string }[] = [
    {
      icon: 'message',
      label: 'Yêu cầu hỗ trợ chưa xong',
      count: counts.tickets_open,
      to: '/admin/support',
      hint: counts.tickets_unviewed
        ? t('{count} yêu cầu chưa ai xem', { count: counts.tickets_unviewed })
        : undefined,
    },
    {
      icon: 'chef',
      label: 'Món đề xuất chờ duyệt',
      count: counts.submissions_pending,
      to: '/admin/submissions?status=pending',
    },
    {
      icon: 'pen',
      label: 'Bài viết chờ duyệt',
      count: counts.articles_pending,
      to: '/admin/articles?status=pending',
    },
    {
      icon: 'lock',
      label: 'Tài khoản bị khóa đăng nhập',
      count: counts.locked_logins ?? 0,
      to: '/admin/users',
      hint: t('Khóa tạm 15 phút sau 5 lần sai mật khẩu'),
    },
  ];
  const pendingTotal = queue.reduce((total, item) => total + item.count, 0);

  return (
    <div className="admin-dashboard">
      <section aria-labelledby="admin-todo-title" className="admin-todo">
        <header className="admin-todo__head">
          <h2 id="admin-todo-title">{t('Việc cần xử lý')}</h2>
          <span className={pendingTotal ? 'admin-todo__count is-hot' : 'admin-todo__count'}>
            {pendingTotal
              ? t('{count} việc đang chờ', { count: formatNumber(pendingTotal) })
              : t('Đã xử lý hết')}
          </span>
        </header>
        <ul className="admin-todo__list">
          {queue.map((item) => (
            <li key={item.label}>
              <Link
                className={item.count ? 'admin-todo__item is-hot' : 'admin-todo__item'}
                to={item.to}
              >
                <span aria-hidden="true" className="admin-todo__icon">
                  <AppIcon name={item.icon} size={18} />
                </span>
                <span className="admin-todo__text">
                  <span>{t(item.label)}</span>
                  {item.hint ? <small>{item.hint}</small> : null}
                </span>
                <strong>{formatNumber(item.count)}</strong>
                <AppIcon name="arrow" size={16} />
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="admin-kpi-title" className="admin-kpis">
        <header className="admin-kpis__head">
          <div>
            <h2 id="admin-kpi-title">{t('Chỉ số chính')}</h2>
            <p>{t('So với {days} ngày liền trước', { days: period })}</p>
          </div>
          <div
            aria-label={t('Khoảng thời gian')}
            className="segmented-control segmented-control--soft"
            role="group"
          >
            {INSIGHT_PERIODS.map((days) => (
              <button
                aria-pressed={days === period}
                className={days === period ? 'is-active' : ''}
                key={days}
                onClick={() => update('period', String(days))}
                type="button"
              >
                {t('{days} ngày', { days })}
              </button>
            ))}
          </div>
        </header>
        {insights.isError ? (
          <Notice tone="danger">{errorMessage(insights.error, t)}</Notice>
        ) : insights.isLoading ? (
          <div aria-busy="true" className="admin-kpis__grid">
            {METRICS.map((metric) => (
              <div className="kpi-card is-skeleton" key={metric.key} />
            ))}
          </div>
        ) : (
          <div className={`admin-kpis__grid${insights.isFetching ? ' is-refreshing' : ''}`}>
            {METRICS.map((metric) => {
              const data = metrics.find((item) => item.key === metric.key);
              return (
                <KpiCard
                  active={metric.key === selected.key}
                  key={metric.key}
                  label={metric.label}
                  onSelect={() => update('metric', metric.key)}
                  previous={data?.previous_total ?? 0}
                  series={data?.series ?? []}
                  value={data?.total ?? 0}
                />
              );
            })}
          </div>
        )}
      </section>

      <div className="admin-insights">
        <Panel
          actions={
            <Link className="text-link" to={selected.to}>
              {t(selected.linkLabel)} <AppIcon name="arrow" size={15} />
            </Link>
          }
          description={t(
            'Chọn một thẻ chỉ số ở trên để đổi biểu đồ. Rê chuột hoặc dùng phím mũi tên để xem từng ngày.',
          )}
          icon="chart"
          title={t('{metric} · {days} ngày qua', { metric: t(selected.label), days: period })}
        >
          {insights.isLoading ? (
            <LoadingBlock label={t('Đang tổng hợp số liệu…')} />
          ) : selectedData ? (
            <TrendChart data={selectedData.series} label={selected.label} />
          ) : insights.data ? (
            <TrendChart data={insights.data.activity} label="Thao tác" />
          ) : null}
        </Panel>
        <Panel
          description={t('Người dùng đã làm gì trong {days} ngày qua.', { days: period })}
          icon="sparkles"
          title={t('Phân bố hoạt động')}
        >
          <DistributionBars
            emptyText={t('Chưa có hoạt động nào trong kỳ này.')}
            items={insights.data?.activity_mix ?? []}
            label="Phân bố hoạt động"
          />
          <h3 className="admin-subhead">{t('Bữa được lên kế hoạch')}</h3>
          <DistributionBars
            emptyText={t('Chưa có món mới trong kế hoạch.')}
            items={insights.data?.meal_types ?? []}
            label="Bữa được lên kế hoạch"
          />
        </Panel>
      </div>

      <div className="ws-split admin-overview-split">
        <Panel
          actions={
            <Link className="text-link" to="/admin/recipes?sort=favorites">
              {t('Xem tất cả')} <AppIcon name="arrow" size={15} />
            </Link>
          }
          icon="heart"
          title={t('Món được quan tâm nhất')}
        >
          {insights.data?.top_recipes.length ? (
            <ol className="rank-list">
              {insights.data.top_recipes.map((recipe, index) => (
                <li key={recipe.slug}>
                  <span className="rank-list__no">{index + 1}</span>
                  <img alt="" loading="lazy" {...dishImage(recipe.slug, recipe.image_path)} />
                  <div>
                    <Link target="_blank" to={`/recipes/${recipe.slug}`}>
                      {recipe.name}
                    </Link>
                    <small>
                      {t(recipe.region)} · {t(recipe.category)}
                    </small>
                  </div>
                  <small className="cell-stats">
                    <span title={t('Lượt yêu thích')}>
                      <AppIcon name="heart" size={13} /> {formatNumber(recipe.favorites)}
                    </span>
                    <span title={t('Lượt đã nấu')}>
                      <AppIcon name="check" size={13} /> {formatNumber(recipe.cooked)}
                    </span>
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t('Chưa có tương tác nào với món ăn.')}</p>
          )}
        </Panel>
        <Panel
          actions={
            <Link className="text-link" to="/admin/users">
              {t('Xem tất cả')} <AppIcon name="arrow" size={15} />
            </Link>
          }
          icon="users"
          title={t('Thành viên mới')}
        >
          <ul className="people-list people-list--links">
            {recentUsers.map((person) => (
              <li key={person.id}>
                <Link to={`/admin/users/${person.id}`}>
                  <UserAvatar name={person.full_name} size={36} />
                  <div>
                    <strong>{person.full_name}</strong>
                    <small>{person.email ?? '—'}</small>
                  </div>
                  <time dateTime={person.created_at}>
                    {formatDate(person.created_at, { dateStyle: 'medium' })}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
          <dl className="admin-facts">
            <div>
              <dt>{t('Tài khoản')}</dt>
              <dd>
                {t('{active}/{total} đang hoạt động', {
                  active: formatNumber(counts.active_users),
                  total: formatNumber(counts.users),
                })}
              </dd>
            </div>
            <div>
              <dt>{t('Quản trị viên')}</dt>
              <dd>{formatNumber(counts.admins)}</dd>
            </div>
            <div>
              <dt>{t('Món đang hiển thị')}</dt>
              <dd>
                <Link to="/admin/recipes">{formatNumber(counts.recipes_published)}</Link>
                {counts.recipes_hidden ? (
                  <small> · {t('{count} món đang ẩn', { count: counts.recipes_hidden })}</small>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>{t('Bài viết đã xuất bản')}</dt>
              <dd>
                <Link to="/admin/articles">{formatNumber(counts.articles_published)}</Link>
              </dd>
            </div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
