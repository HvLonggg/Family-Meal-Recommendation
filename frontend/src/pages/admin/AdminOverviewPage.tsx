import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { ActivityBars } from '@/components/admin/AdminCharts';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { UserAvatar } from '@/components/common/UserAvatar';
import { LoadingBlock, Notice, Panel } from '@/components/ui/Workspace';
import { adminKeys, getAdminInsights, getAdminOverview } from '@/features/admin/adminApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { dishImage } from '@/data/dishImages';
import { errorMessage } from '@/lib/errors';

export function AdminOverviewPage() {
  const { formatDate, formatNumber, t } = useI18n();
  const overview = useQuery({
    queryKey: adminKeys.overview(),
    queryFn: ({ signal }) => getAdminOverview(signal),
  });
  const insights = useQuery({
    queryKey: [...adminKeys.all, 'insights'],
    queryFn: ({ signal }) => getAdminInsights(signal),
  });

  if (overview.isLoading) return <LoadingBlock label={t('Đang tổng hợp số liệu…')} />;
  if (overview.isError || !overview.data)
    return <Notice tone="danger">{errorMessage(overview.error, t)}</Notice>;

  const { counts, recent_users: recentUsers } = overview.data;
  const tiles: { icon: IconName; label: string; value: number; hint: string; to: string }[] = [
    {
      icon: 'users',
      label: 'Người dùng',
      value: counts.users,
      hint: t('{count} mới trong 7 ngày', { count: counts.new_users_7d }),
      to: '/admin/users',
    },
    {
      icon: 'book',
      label: 'Món đang hiển thị',
      value: counts.recipes_published,
      hint: t('{count} món đang ẩn', { count: counts.recipes_hidden }),
      to: '/admin/recipes',
    },
    {
      icon: 'calendar',
      label: 'Món trong kế hoạch',
      value: counts.plan_items,
      hint: t('{count} người đang lên kế hoạch', { count: counts.planners }),
      to: '/admin/plans',
    },
    {
      icon: 'pen',
      label: 'Bài viết đã xuất bản',
      value: counts.articles_published,
      hint: t('{count} bài chờ duyệt', { count: counts.articles_pending }),
      to: '/admin/articles',
    },
  ];
  const queue: { icon: IconName; label: string; count: number; to: string }[] = [
    {
      icon: 'pen',
      label: 'Bài viết chờ duyệt',
      count: counts.articles_pending,
      to: '/admin/articles?status=pending',
    },
    {
      icon: 'chef',
      label: 'Món đề xuất chờ duyệt',
      count: counts.submissions_pending,
      to: '/admin/submissions?status=pending',
    },
    {
      icon: 'message',
      label: 'Yêu cầu hỗ trợ chưa xong',
      count: counts.tickets_open,
      to: '/admin/support',
    },
  ];

  return (
    <>
      <div className="admin-tiles">
        {tiles.map((tile) => (
          <Link className="admin-tile" key={tile.label} to={tile.to}>
            <span className="admin-tile__icon">
              <AppIcon name={tile.icon} size={20} />
            </span>
            <small>{t(tile.label)}</small>
            <strong>{formatNumber(tile.value)}</strong>
            <em>{tile.hint}</em>
          </Link>
        ))}
      </div>
      <div className="admin-insights">
        <Panel
          description={t(
            'Lượt thêm kế hoạch, đánh dấu đã nấu và yêu thích của toàn bộ người dùng.',
          )}
          icon="chart"
          title={t('Hoạt động 14 ngày qua')}
        >
          {insights.isLoading ? (
            <LoadingBlock label={t('Đang tổng hợp số liệu…')} />
          ) : insights.data ? (
            <>
              <ActivityBars data={insights.data.activity} height={236} label="Thao tác" />
              <p className="admin-queue__hint">
                {t('{count} tài khoản mới trong 14 ngày', {
                  count: insights.data.signups.reduce((sum, day) => sum + day.count, 0),
                })}
              </p>
            </>
          ) : (
            <Notice tone="danger">{errorMessage(insights.error, t)}</Notice>
          )}
        </Panel>
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
                      <AppIcon name="heart" size={13} /> {recipe.favorites}
                    </span>
                    <span title={t('Lượt đã nấu')}>
                      <AppIcon name="check" size={13} /> {recipe.cooked}
                    </span>
                  </small>
                </li>
              ))}
            </ol>
          ) : (
            <p className="muted">{t('Chưa có tương tác nào với món ăn.')}</p>
          )}
        </Panel>
      </div>
      <div className="ws-split admin-overview-split">
        <Panel icon="sparkles" title={t('Việc cần xử lý')}>
          <ul className="admin-queue">
            {queue.map((item) => (
              <li key={item.label}>
                <Link to={item.to}>
                  <span className="admin-queue__icon">
                    <AppIcon name={item.icon} size={18} />
                  </span>
                  <span>{t(item.label)}</span>
                  <strong className={item.count ? 'is-hot' : ''}>{item.count}</strong>
                  <AppIcon name="arrow" size={16} />
                </Link>
              </li>
            ))}
          </ul>
          <p className="admin-queue__hint">
            {t('{active}/{total} tài khoản đang hoạt động · {admins} quản trị viên', {
              active: counts.active_users,
              total: counts.users,
              admins: counts.admins,
            })}
          </p>
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
        </Panel>
      </div>
    </>
  );
}
