import { useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router';

import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { Dropdown } from '@/components/common/Dropdown';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { LocationMap } from '@/components/common/LocationMap';
import { UserAvatar } from '@/components/common/UserAvatar';
import { contactInfo, phoneHref } from '@/config/contact';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';

interface MenuLink {
  to: string;
  label: string;
  description?: string;
  icon: IconName;
}

const primaryLinks = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/recipes', label: 'Món ăn' },
  { to: '/meals', label: 'Bữa cơm' },
  { to: '/random-meal', label: 'Quay mâm', className: 'nav-link--random' },
  { to: '/planner', label: 'Kế hoạch' },
  { to: '/articles', label: 'Bài viết', className: 'nav-link--featured' },
  { to: '/submit-recipe', label: 'Đăng món', className: 'nav-link--featured' },
];

const exploreLinks: MenuLink[] = [
  {
    to: '/suggestions',
    label: 'Gợi ý món',
    description: 'Món hợp thời tiết và khẩu vị',
    icon: 'sparkles',
  },
  {
    to: '/nutrition',
    label: 'Nhu cầu dinh dưỡng',
    description: 'Cân đối bữa ăn cho cả nhà',
    icon: 'balance',
  },
  { to: '/favorites', label: 'Món yêu thích', description: 'Các món bạn đã lưu', icon: 'heart' },
  {
    to: '/stories/new',
    label: 'Chia sẻ câu chuyện bếp',
    description: 'Kể hành trình nấu một món ăn',
    icon: 'pen',
  },
];

const accountLinks: MenuLink[] = [
  { to: '/account', label: 'Tài khoản của tôi', icon: 'user' },
  { to: '/account/settings', label: 'Cài đặt', icon: 'settings' },
  { to: '/account/security', label: 'Đổi mật khẩu & bảo mật', icon: 'lock' },
  { to: '/account/stories', label: 'Câu chuyện của tôi', icon: 'pen' },
  { to: '/account/submissions', label: 'Món tôi đề xuất', icon: 'chef' },
];

const navClass = ({ isActive }: { isActive: boolean }, extra = '') =>
  `nav-link${extra ? ` ${extra}` : ''}${isActive ? ' is-active' : ''}`;

export function PublicLayout() {
  const { isLoading, logout, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const exploreActive = exploreLinks.some((link) => location.pathname.startsWith(link.to));

  const handleLogout = async () => {
    setMenuOpen(false);
    // Chuyển sang trang đăng nhập trước khi xóa phiên, tránh bị ghi nhớ trang cũ.
    await navigate('/login', { replace: true });
    await logout();
  };

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('Bỏ qua đến nội dung chính')}
      </a>
      <header className="site-header">
        <div className="site-header__content">
          <Link className="brand" to="/" aria-label={t('Bếp Việt - Trang chủ')}>
            <KitchenHomeLogo compact />
          </Link>
          <button
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t('Đóng trình đơn') : t('Mở trình đơn')}
            className="mobile-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <AppIcon name={menuOpen ? 'close' : 'menu'} />
          </button>
          <nav
            aria-label={t('Điều hướng chính')}
            className={`site-nav${menuOpen ? ' is-open' : ''}`}
            onClick={(event) => {
              if ((event.target as HTMLElement).closest('a')) setMenuOpen(false);
            }}
          >
            <div className="site-nav__primary">
              {primaryLinks.map((link) => (
                <NavLink
                  className={(state) => navClass(state, link.className)}
                  end={link.end}
                  key={link.to}
                  to={link.to}
                >
                  {t(link.label)}
                </NavLink>
              ))}
              <Dropdown
                className="nav-dropdown"
                label={t('Khám phá thêm')}
                trigger={
                  <>
                    {t('Khám phá')} <AppIcon name="chevron" size={15} />
                  </>
                }
                triggerClassName={`nav-link nav-link--menu${exploreActive ? ' is-active' : ''}`}
              >
                {(close) => (
                  <ul className="menu-list menu-list--explore">
                    {exploreLinks.map((link) => (
                      <li key={link.to}>
                        <NavLink className="menu-item" onClick={close} to={link.to}>
                          <span className="menu-item__icon">
                            <AppIcon name={link.icon} size={18} />
                          </span>
                          <span>
                            <strong>{t(link.label)}</strong>
                            {link.description ? <small>{t(link.description)}</small> : null}
                          </span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </Dropdown>
              <NavLink
                className={(state) => navClass(state, 'nav-link--support')}
                to="/contact"
              >
                {t('Liên hệ hỗ trợ')}
              </NavLink>
            </div>

            <div className="site-nav__actions">
              <LanguageSwitcher />
              {isLoading ? (
                <span aria-hidden="true" className="user-chip-skeleton" />
              ) : user ? (
                <Dropdown
                  align="end"
                  className="account-dropdown"
                  label={t('Mở menu tài khoản')}
                  trigger={
                    <>
                      <UserAvatar name={user.full_name} size={32} src={user.avatar_url} />
                      <span className="account-trigger__name">
                        {user.full_name.split(' ').at(-1)}
                      </span>
                      <AppIcon name="chevron" size={15} />
                    </>
                  }
                  triggerClassName="account-trigger"
                >
                  {(close) => (
                    <div className="account-menu">
                      <div className="account-menu__head">
                        <UserAvatar name={user.full_name} size={46} src={user.avatar_url} />
                        <div>
                          <strong>{user.full_name}</strong>
                          <small>{user.email ?? user.phone_e164}</small>
                          <span className={`role-chip role-chip--${user.role}`}>
                            {user.role === 'admin' ? t('Quản trị viên') : t('Thành viên')}
                          </span>
                        </div>
                      </div>
                      <ul className="menu-list">
                        {accountLinks.map((link) => (
                          <li key={link.to}>
                            <NavLink className="menu-item" end onClick={close} to={link.to}>
                              <span className="menu-item__icon">
                                <AppIcon name={link.icon} size={17} />
                              </span>
                              <strong>{t(link.label)}</strong>
                            </NavLink>
                          </li>
                        ))}
                        {user.role === 'admin' ? (
                          <li>
                            <NavLink
                              className="menu-item menu-item--admin"
                              onClick={close}
                              to="/admin"
                            >
                              <span className="menu-item__icon">
                                <AppIcon name="shield" size={17} />
                              </span>
                              <strong>{t('Trang quản trị')}</strong>
                            </NavLink>
                          </li>
                        ) : null}
                      </ul>
                      <button
                        className="menu-item menu-item--logout"
                        onClick={() => {
                          close();
                          void handleLogout();
                        }}
                        type="button"
                      >
                        <span className="menu-item__icon">
                          <AppIcon name="logout" size={17} />
                        </span>
                        <strong>{t('Đăng xuất')}</strong>
                      </button>
                    </div>
                  )}
                </Dropdown>
              ) : (
                <>
                  <Link className="nav-link nav-link--login" to="/login">
                    {t('Đăng nhập')}
                  </Link>
                  <Link className="nav-signup" to="/register">
                    {t('Tạo tài khoản')}
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      </header>

      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container footer-main">
          <div className="footer-brand">
            <Link aria-label={t('Bếp Việt - Trang chủ')} className="footer-brand__logo" to="/">
              <KitchenHomeLogo compact />
            </Link>
            <p>{t('Trọn vị cơm nhà Việt: chọn món, lên thực đơn và nấu ngon mỗi ngày.')}</p>
            <ul className="footer-contact">
              <li>
                <AppIcon name="mail" size={16} />
                <a href={`mailto:${contactInfo.email}`}>{contactInfo.email}</a>
              </li>
              {contactInfo.phone ? (
                <li>
                  <AppIcon name="phone" size={16} />
                  <a href={phoneHref(contactInfo.phone)}>{contactInfo.phone}</a>
                </li>
              ) : null}
              <li>
                <AppIcon name="clock" size={16} />
                <span>{t(contactInfo.workingHours)}</span>
              </li>
            </ul>
          </div>
          <nav aria-label={t('Liên kết chân trang')} className="footer-links">
            <div>
              <strong>{t('Khám phá')}</strong>
              <Link to="/recipes">{t('Kho món Việt')}</Link>
              <Link to="/meals">{t('Bữa cơm gia đình')}</Link>
              <Link to="/planner">{t('Kế hoạch nấu ăn')}</Link>
              <Link to="/articles">{t('Bài viết & câu chuyện')}</Link>
            </div>
            <div>
              <strong>{t('Hỗ trợ')}</strong>
              <Link to="/contact">{t('Liên hệ hỗ trợ')}</Link>
              <Link to="/submit-recipe">{t('Đề xuất món mới')}</Link>
              <Link to="/favorites">{t('Món yêu thích')}</Link>
            </div>
          </nav>
          <div className="footer-map">
            <strong>{t('Ghé thăm Bếp Việt')}</strong>
            <LocationMap height={148} />
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} Bếp Việt. {t('Bảo lưu mọi quyền.')}
          </span>
          <LanguageSwitcher className="language-switcher--dark" />
        </div>
      </footer>
    </div>
  );
}
