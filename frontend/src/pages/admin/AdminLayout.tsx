import { useQuery } from '@tanstack/react-query';
import { Link, NavLink, Outlet } from 'react-router';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { adminKeys, getAdminOverview, type AdminOverview } from '@/features/admin/adminApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';

const tabs: {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  badge?: (counts: AdminOverview['counts']) => number;
}[] = [
  { to: '/admin', label: 'Tổng quan', icon: 'chart', end: true },
  { to: '/admin/users', label: 'Người dùng', icon: 'users' },
  { to: '/admin/plans', label: 'Kế hoạch', icon: 'calendar' },
  { to: '/admin/recipes', label: 'Món ăn', icon: 'book' },
  {
    to: '/admin/articles',
    label: 'Bài viết',
    icon: 'pen',
    badge: (counts) => counts.articles_pending,
  },
  {
    to: '/admin/submissions',
    label: 'Đề xuất món',
    icon: 'chef',
    badge: (counts) => counts.submissions_pending,
  },
  {
    to: '/admin/support',
    label: 'Hỗ trợ',
    icon: 'message',
    badge: (counts) => counts.tickets_open,
  },
];

export function AdminLayout() {
  const { user } = useAuth();
  const { t } = useI18n();
  const overview = useQuery({
    queryKey: adminKeys.overview(),
    queryFn: ({ signal }) => getAdminOverview(signal),
  });
  const showBadges = user?.preferences?.admin_notify_pending ?? true;

  return (
    <div className="ws-page admin-console">
      <div className="container">
        <header className="admin-banner">
          <div>
            <span className="section-label">{t('Bếp điều hành')}</span>
            <h1>{t('Trang quản trị Bếp Việt')}</h1>
            <p>{t('Quản lý người dùng, món ăn, kế hoạch và nội dung cộng đồng tại một nơi.')}</p>
          </div>
          <div className="admin-banner__actions">
            <span className="admin-banner__secure">
              <AppIcon name="shield" size={16} /> {t('Quyền quản trị đã xác minh')}
            </span>
            <Link className="button button--primary" to="/stories/new?kind=editorial">
              <AppIcon name="pen" size={16} /> {t('Viết bài mới')}
            </Link>
          </div>
        </header>
        <nav aria-label={t('Khu vực quản trị')} className="admin-tabs">
          {tabs.map((tab) => {
            const count =
              showBadges && overview.data && tab.badge ? tab.badge(overview.data.counts) : 0;
            return (
              <NavLink
                className={({ isActive }) => `admin-tabs__link${isActive ? ' is-active' : ''}`}
                end={tab.end}
                key={tab.to}
                to={tab.to}
              >
                <AppIcon name={tab.icon} size={17} />
                <span>{t(tab.label)}</span>
                {count ? (
                  <span
                    aria-label={t('{count} mục chờ xử lý', { count })}
                    className="admin-tabs__badge"
                  >
                    {count}
                  </span>
                ) : null}
              </NavLink>
            );
          })}
        </nav>
        <div className="admin-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
