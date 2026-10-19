import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { Link, matchPath, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { UserAvatar } from '@/components/common/UserAvatar';
import { adminKeys, getAdminOverview, type AdminOverview } from '@/features/admin/adminApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';

interface AdminNavItem {
  to: string;
  label: string;
  icon: IconName;
  description: string;
  end?: boolean;
  badge?: (counts: AdminOverview['counts']) => number;
}

const navGroups: { label: string; items: AdminNavItem[] }[] = [
  {
    label: 'Tổng quan',
    items: [
      {
        to: '/admin',
        label: 'Bảng điều khiển',
        icon: 'chart',
        end: true,
        description: 'Toàn cảnh hoạt động của Bếp Việt và các việc đang chờ xử lý.',
      },
    ],
  },
  {
    label: 'Vận hành',
    items: [
      {
        to: '/admin/users',
        label: 'Người dùng',
        icon: 'users',
        description: 'Tra cứu tài khoản, phân quyền và theo dõi mức độ hoạt động.',
      },
      {
        to: '/admin/plans',
        label: 'Kế hoạch bữa ăn',
        icon: 'calendar',
        description: 'Theo dõi thực đơn người dùng đang lên kế hoạch theo ngày.',
      },
      {
        to: '/admin/recipes',
        label: 'Món ăn',
        icon: 'book',
        description: 'Quản lý kho công thức, trạng thái hiển thị và nội dung món.',
      },
    ],
  },
  {
    label: 'Nội dung & cộng đồng',
    items: [
      {
        to: '/admin/articles',
        label: 'Bài viết',
        icon: 'pen',
        description: 'Duyệt câu chuyện cộng đồng và quản lý bài viết biên tập.',
        badge: (counts) => counts.articles_pending,
      },
      {
        to: '/admin/submissions',
        label: 'Đề xuất món',
        icon: 'chef',
        description: 'Xét duyệt công thức do người dùng gửi lên.',
        badge: (counts) => counts.submissions_pending,
      },
      {
        to: '/admin/support',
        label: 'Hỗ trợ',
        icon: 'message',
        description: 'Hộp thư liên hệ và phản hồi người dùng qua email.',
        badge: (counts) => counts.tickets_open,
      },
    ],
  },
  {
    label: 'Hệ thống',
    items: [
      {
        to: '/admin/settings',
        label: 'Cài đặt',
        icon: 'settings',
        description: 'Ngôn ngữ, hiển thị và thông báo của tài khoản quản trị.',
      },
      {
        to: '/admin/security',
        label: 'Bảo mật',
        icon: 'lock',
        description: 'Đổi mật khẩu và quản lý phiên đăng nhập.',
      },
    ],
  },
];

const navItems = navGroups.flatMap((group) => group.items.map((item) => ({ ...item, group })));

/** Trang con không nằm trên menu vẫn cần tiêu đề và mục cha để hiện breadcrumb. */
const childPages: { pattern: string; parent: string; title: string; description: string }[] = [
  {
    pattern: '/admin/users/:userId',
    parent: '/admin/users',
    title: 'Hồ sơ người dùng',
    description: 'Thông tin tài khoản, khẩu vị, kế hoạch và lịch sử hoạt động.',
  },
  {
    pattern: '/admin/articles/new',
    parent: '/admin/articles',
    title: 'Viết bài mới',
    description: 'Bài viết của quản trị viên được xuất bản ngay khi bấm “Xuất bản”.',
  },
  {
    pattern: '/admin/articles/:id/edit',
    parent: '/admin/articles',
    title: 'Chỉnh sửa bài viết',
    description: 'Cập nhật nội dung, ảnh bìa và trạng thái xuất bản.',
  },
];

function resolvePage(pathname: string) {
  const child = childPages.find((page) => matchPath(page.pattern, pathname));
  if (child) {
    const parent = navItems.find((item) => item.to === child.parent)!;
    return { title: child.title, description: child.description, parent, group: parent.group };
  }
  const current =
    navItems.find((item) => matchPath({ path: item.to, end: true }, pathname)) ??
    navItems.find((item) => !item.end && matchPath({ path: item.to, end: false }, pathname)) ??
    navItems[0]!;
  return {
    title: current.label,
    description: current.description,
    parent: null,
    group: current.group,
  };
}

export function AdminLayout() {
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();
  const navigate = useNavigate();
  const [navOpen, setNavOpen] = useState(false);
  const overview = useQuery({
    queryKey: adminKeys.overview(),
    queryFn: ({ signal }) => getAdminOverview(signal),
  });
  const showBadges = user?.preferences?.admin_notify_pending ?? true;
  const page = resolvePage(location.pathname);
  const pendingTotal =
    showBadges && overview.data
      ? overview.data.counts.articles_pending +
        overview.data.counts.submissions_pending +
        overview.data.counts.tickets_open
      : 0;
  // Trang Bài viết đã có nút riêng; lối tắt viết bài chỉ đặt ở bảng điều khiển.
  const canWriteArticle = location.pathname === '/admin';

  useEffect(() => {
    document.title = `${t(page.title)} · ${t('Quản trị Bếp Việt')}`;
  }, [page.title, t]);

  useEffect(() => {
    if (!navOpen) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [navOpen]);

  const handleLogout = async () => {
    // Rời khu quản trị trước khi xóa phiên để không bị ghi nhớ trang cũ.
    await navigate('/login', { replace: true });
    await logout();
  };

  return (
    <div className={`admin-shell admin-console${navOpen ? ' is-nav-open' : ''}`}>
      <a className="skip-link" href="#admin-main">
        {t('Bỏ qua đến nội dung chính')}
      </a>
      <aside className="admin-sidebar" id="admin-sidebar">
        <Link
          aria-label={t('Bảng điều khiển')}
          className="admin-sidebar__brand"
          onClick={() => setNavOpen(false)}
          to="/admin"
        >
          <KitchenHomeLogo compact />
          <span>
            <strong>Bếp Việt</strong>
            <small>{t('Bảng quản trị')}</small>
          </span>
        </Link>
        <nav aria-label={t('Khu vực quản trị')} className="admin-sidebar__nav">
          {navGroups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-group__label">{t(group.label)}</span>
              {group.items.map((item) => {
                const count =
                  showBadges && overview.data && item.badge ? item.badge(overview.data.counts) : 0;
                return (
                  <NavLink
                    className={({ isActive }) => `admin-nav-link${isActive ? ' is-active' : ''}`}
                    end={item.end}
                    key={item.to}
                    onClick={() => setNavOpen(false)}
                    to={item.to}
                  >
                    <AppIcon name={item.icon} size={18} />
                    <span>{t(item.label)}</span>
                    {count ? (
                      <span
                        aria-label={t('{count} mục chờ xử lý', { count })}
                        className="admin-nav-link__badge"
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    ) : null}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>
        {user ? (
          <div className="admin-sidebar__account">
            <UserAvatar name={user.full_name} size={38} src={user.avatar_url} />
            <div>
              <strong>{user.full_name}</strong>
              <small>
                <AppIcon name="shield" size={12} /> {t('Quản trị viên')}
              </small>
            </div>
            <button
              aria-label={t('Đăng xuất')}
              className="admin-sidebar__logout"
              onClick={() => void handleLogout()}
              title={t('Đăng xuất')}
              type="button"
            >
              <AppIcon name="logout" size={18} />
            </button>
          </div>
        ) : null}
      </aside>
      <button
        aria-hidden="true"
        className="admin-shell__backdrop"
        onClick={() => setNavOpen(false)}
        tabIndex={-1}
        type="button"
      />

      <div className="admin-main">
        <header className="admin-topbar">
          <button
            aria-controls="admin-sidebar"
            aria-expanded={navOpen}
            aria-label={navOpen ? t('Đóng trình đơn') : t('Mở trình đơn')}
            className="admin-topbar__menu"
            onClick={() => setNavOpen((open) => !open)}
            type="button"
          >
            <AppIcon name={navOpen ? 'close' : 'menu'} size={20} />
          </button>
          <div className="admin-topbar__heading">
            <nav aria-label={t('Đường dẫn')} className="admin-breadcrumb">
              <ol>
                <li>{t('Quản trị')}</li>
                <li>{t(page.group.label)}</li>
                {page.parent ? (
                  <li>
                    <Link to={page.parent.to}>{t(page.parent.label)}</Link>
                  </li>
                ) : null}
              </ol>
            </nav>
            <h1>{t(page.title)}</h1>
            <p>{t(page.description)}</p>
          </div>
          <div className="admin-topbar__actions">
            {pendingTotal ? (
              <span className="admin-topbar__pending">
                <span aria-hidden="true" className="admin-topbar__pulse" />
                {t('{count} việc chờ xử lý', { count: pendingTotal })}
              </span>
            ) : null}
            <LanguageSwitcher className="admin-topbar__language" />
            {canWriteArticle ? (
              <Link className="button button--primary admin-topbar__cta" to="/admin/articles/new">
                <AppIcon name="plus" size={16} /> {t('Viết bài mới')}
              </Link>
            ) : null}
          </div>
        </header>
        <main className="admin-content" id="admin-main" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
