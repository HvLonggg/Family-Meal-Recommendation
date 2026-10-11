import { NavLink, Outlet, useNavigate } from 'react-router';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { UserAvatar } from '@/components/common/UserAvatar';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';

const sections: { to: string; label: string; icon: IconName; end?: boolean }[] = [
  { to: '/account', label: 'Tổng quan hồ sơ', icon: 'user', end: true },
  { to: '/account/settings', label: 'Cài đặt', icon: 'settings' },
  { to: '/account/security', label: 'Đổi mật khẩu & bảo mật', icon: 'lock' },
  { to: '/account/stories', label: 'Câu chuyện của tôi', icon: 'pen' },
  { to: '/account/submissions', label: 'Món tôi đề xuất', icon: 'chef' },
];

export function AccountLayout() {
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  if (!user) return null;

  return (
    <div className="ws-page ws-page--account">
      <div className="container ws-layout">
        <aside className="ws-sidebar" aria-label={t('Điều hướng tài khoản')}>
          <div className="ws-identity">
            <UserAvatar name={user.full_name} size={64} src={user.avatar_url} />
            <div>
              <strong>{user.full_name}</strong>
              <small>{user.email ?? user.phone_e164}</small>
              <span className={`role-chip role-chip--${user.role}`}>
                {user.role === 'admin' ? t('Quản trị viên') : t('Thành viên')}
              </span>
            </div>
          </div>
          <nav className="ws-nav">
            {sections.map((section) => (
              <NavLink
                className={({ isActive }) => `ws-nav__link${isActive ? ' is-active' : ''}`}
                end={section.end}
                key={section.to}
                to={section.to}
              >
                <AppIcon name={section.icon} size={18} />
                <span>{t(section.label)}</span>
              </NavLink>
            ))}
            {user.role === 'admin' ? (
              <NavLink className="ws-nav__link ws-nav__link--admin" to="/admin">
                <AppIcon name="shield" size={18} />
                <span>{t('Trang quản trị')}</span>
              </NavLink>
            ) : null}
            <button
              className="ws-nav__link ws-nav__link--logout"
              onClick={() => {
                void Promise.resolve(navigate('/login', { replace: true })).then(logout);
              }}
              type="button"
            >
              <AppIcon name="logout" size={18} />
              <span>{t('Đăng xuất')}</span>
            </button>
          </nav>
        </aside>
        <div className="ws-main">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
