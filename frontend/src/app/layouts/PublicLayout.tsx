import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  Link,
  Navigate,
  NavLink,
  NavigationType,
  Outlet,
  useLocation,
  useNavigate,
  useNavigationType,
} from 'react-router';

import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { Dropdown } from '@/components/common/Dropdown';
import { AssistantWidget } from '@/components/assistant/AssistantWidget';
import { LanguageSwitcher } from '@/components/common/LanguageSwitcher';
import { LocationMap } from '@/components/common/LocationMap';
import { UserAvatar } from '@/components/common/UserAvatar';
import { contactInfo, phoneHref } from '@/config/contact';
import { adminDestinationFor } from '@/features/admin/adminRouting';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { InstallAppButton } from '@/features/pwa/InstallAppButton';
import { useRouteDocumentMeta } from '@/features/seo/usePageMeta';

interface MenuLink {
  to: string;
  label: string;
  description?: string;
  icon: IconName;
}

interface PrimaryLink {
  to: string;
  label: string;
  icon: IconName;
  end?: boolean;
  className?: string;
}

// Biểu tượng chỉ hiện trong menu di động; thanh điều hướng desktop giữ dạng chữ.
const primaryLinks: PrimaryLink[] = [
  { to: '/', label: 'Trang chủ', icon: 'home', end: true },
  { to: '/recipes', label: 'Món ăn', icon: 'chef' },
  { to: '/meals', label: 'Bữa cơm', icon: 'plate' },
  { to: '/random-meal', label: 'Quay mâm', icon: 'refresh', className: 'nav-link--random' },
  { to: '/planner', label: 'Kế hoạch', icon: 'calendar' },
  { to: '/articles', label: 'Bài viết', icon: 'book', className: 'nav-link--featured' },
  { to: '/submit-recipe', label: 'Đề xuất món', icon: 'plus', className: 'nav-link--featured' },
];

const exploreLinks: MenuLink[] = [
  {
    to: '/suggestions',
    label: 'Gợi ý món',
    description: 'Món hợp khẩu vị của bạn',
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
  { to: '/favorites', label: 'Món yêu thích', icon: 'heart' },
  { to: '/account/cooked', label: 'Món đã nấu', icon: 'history' },
  { to: '/account/submissions', label: 'Món tôi đề xuất', icon: 'chef' },
];

const navClass = ({ isActive }: { isActive: boolean }, extra = '') =>
  `nav-link${extra ? ` ${extra}` : ''}${isActive ? ' is-active' : ''}`;

export function PublicLayout() {
  const { isLoading, logout, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const navigationType = useNavigationType();
  const previousPathname = useRef(location.pathname);
  const [menuOpen, setMenuOpen] = useState(false);
  // Tiêu đề tab, description, Open Graph và canonical theo trang; cập nhật ngay khi đổi ngôn ngữ.
  useRouteDocumentMeta();

  const headerRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const navRef = useRef<HTMLElement>(null);

  const closeMenu = () => {
    setMenuOpen(false);
    menuButtonRef.current?.focus({ preventScroll: true });
  };

  // Menu di động mở: khóa cuộn ở gốc tài liệu (giữ vị trí cuộn và header dính đỉnh),
  // đưa focus vào mục đầu, giữ Tab trong menu, Esc để đóng.
  useEffect(() => {
    if (!menuOpen) return undefined;
    const root = document.documentElement;
    const headerHeight = headerRef.current?.getBoundingClientRect().height;
    if (headerHeight) root.style.setProperty('--site-header-height', `${headerHeight}px`);
    root.classList.add('has-menu-open');

    const focusables = () =>
      [
        menuButtonRef.current,
        ...(navRef.current?.querySelectorAll<HTMLElement>('a[href], button:not([disabled])') ?? []),
      ].filter((element): element is HTMLElement =>
        Boolean(element && element.getClientRects().length > 0),
      );
    focusables()[1]?.focus({ preventScroll: true });

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuButtonRef.current?.focus({ preventScroll: true });
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      const first = items[0];
      const last = items.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    // Xoay ngang/phóng to sang bố cục desktop thì menu di động không còn ý nghĩa.
    const desktop = window.matchMedia?.('(min-width: 1101px)');
    const onLayoutChange = () => {
      if (desktop?.matches) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    desktop?.addEventListener?.('change', onLayoutChange);
    return () => {
      root.classList.remove('has-menu-open');
      document.removeEventListener('keydown', onKeyDown);
      desktop?.removeEventListener?.('change', onLayoutChange);
    };
  }, [menuOpen]);

  // Đổi trang (kể cả bấm Quay lại) thì đóng menu di động.
  const [menuPathname, setMenuPathname] = useState(location.pathname);
  if (menuPathname !== location.pathname) {
    setMenuPathname(location.pathname);
    setMenuOpen(false);
  }

  const exploreActive = exploreLinks.some((link) => location.pathname.startsWith(link.to));

  useLayoutEffect(() => {
    const changedPage = previousPathname.current !== location.pathname;
    previousPathname.current = location.pathname;
    if (!changedPage || navigationType === NavigationType.Pop || location.hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }, [location.hash, location.pathname, navigationType]);

  const handleFooterNavigation = () => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  };

  const handleLogout = async () => {
    setMenuOpen(false);
    // Chuyển sang trang đăng nhập trước khi xóa phiên, tránh bị ghi nhớ trang cũ.
    await navigate('/login', { replace: true });
    await logout();
  };

  if (user?.role === 'admin') {
    // Quản trị viên chỉ làm việc trong khu /admin; trang công khai chỉ còn để xem trước.
    const destination = adminDestinationFor(location.pathname);
    if (destination) return <Navigate replace to={`${destination}${location.search}`} />;
    return (
      <div className="app-shell app-shell--admin-preview">
        <header className="admin-preview-bar">
          <Link aria-label={t('Bảng điều khiển')} className="admin-preview-bar__brand" to="/admin">
            <KitchenHomeLogo compact />
          </Link>
          <p className="admin-preview-bar__label">
            <AppIcon name="eye" size={16} />
            <strong>{t('Chế độ xem trước')}</strong>
            <span>{t('Trang hiển thị đúng như người dùng nhìn thấy.')}</span>
          </p>
          <Link className="button button--primary admin-preview-bar__back" to="/admin">
            <AppIcon name="shield" size={16} /> {t('Về trang quản trị')}
          </Link>
        </header>
        <main id="main-content" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        {t('Bỏ qua đến nội dung chính')}
      </a>
      <header className="site-header" ref={headerRef}>
        <div className="site-header__content">
          <Link className="brand" to="/" aria-label={t('Bếp Việt - Trang chủ')}>
            <KitchenHomeLogo compact />
          </Link>
          {/* Điện thoại/máy tính bảng: VI/EN nằm ngay trên thanh header, cạnh nút trình đơn.
              Desktop ẩn bản này và dùng bản trong cụm hành động của thanh điều hướng. */}
          <InstallAppButton className="site-header__install" variant="compact" />
          <LanguageSwitcher className="site-header__language" compact />
          <button
            aria-controls="site-nav"
            aria-expanded={menuOpen}
            aria-label={menuOpen ? t('Đóng trình đơn') : t('Mở trình đơn')}
            className="mobile-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            ref={menuButtonRef}
            type="button"
          >
            <AppIcon name={menuOpen ? 'close' : 'menu'} />
          </button>
          <nav
            aria-label={t('Điều hướng chính')}
            className={`site-nav${menuOpen ? ' is-open' : ''}`}
            id="site-nav"
            ref={navRef}
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
                  <span aria-hidden="true" className="nav-link__icon">
                    <AppIcon name={link.icon} size={18} />
                  </span>
                  {t(link.label)}
                </NavLink>
              ))}
              {menuOpen ? (
                // Menu di động: nhóm "Khám phá" bày sẵn, không phải mở thêm một tầng thả xuống.
                <section aria-labelledby="site-nav-explore" className="site-nav__group">
                  <h2 className="site-nav__group-title" id="site-nav-explore">
                    {t('Khám phá')}
                  </h2>
                  <ul className="site-nav__list">
                    {exploreLinks.map((link) => (
                      <li key={link.to}>
                        <NavLink className="site-nav__item" to={link.to}>
                          <AppIcon name={link.icon} size={18} />
                          <span>{t(link.label)}</span>
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : (
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
              )}
              <NavLink className={(state) => navClass(state)} to="/contact">
                <span aria-hidden="true" className="nav-link__icon">
                  <AppIcon name="message" size={18} />
                </span>
                {t('Liên hệ hỗ trợ')}
              </NavLink>
            </div>

            <div className="site-nav__actions">
              <LanguageSwitcher className="site-nav__language" />
              {isLoading ? (
                <span aria-hidden="true" className="user-chip-skeleton" />
              ) : user && menuOpen ? (
                // Menu di động: liên kết tài khoản (có Cài đặt) bày thẳng ra, không ẩn sau nút thả xuống.
                <section
                  aria-labelledby="site-nav-account"
                  className="site-nav__group site-nav__account"
                >
                  <div className="site-nav__identity">
                    <UserAvatar name={user.full_name} size={36} src={user.avatar_url} />
                    <span>
                      <strong id="site-nav-account">{user.full_name}</strong>
                      <small>{user.email ?? user.phone_e164}</small>
                    </span>
                  </div>
                  <ul className="site-nav__list">
                    {/* "Món yêu thích" đã có trong nhóm Khám phá; bỏ trùng ở menu di động. */}
                    {accountLinks
                      .filter((link) => link.to !== '/favorites')
                      .map((link) => (
                        <li key={link.to}>
                          <NavLink className="site-nav__item" end to={link.to}>
                            <AppIcon name={link.icon} size={18} />
                            <span>{t(link.label)}</span>
                          </NavLink>
                        </li>
                      ))}
                    <li>
                      <button
                        className="site-nav__item site-nav__item--logout"
                        onClick={() => void handleLogout()}
                        type="button"
                      >
                        <AppIcon name="logout" size={18} />
                        <span>{t('Đăng xuất')}</span>
                      </button>
                    </li>
                  </ul>
                </section>
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
                          <span className="role-chip role-chip--user">{t('Thành viên')}</span>
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
                <div className="site-nav__auth">
                  {menuOpen ? (
                    <p className="site-nav__auth-hint">
                      {t('Đăng nhập để lưu món yêu thích và cài đặt riêng.')}
                    </p>
                  ) : null}
                  <Link className="nav-link nav-link--login" to="/login">
                    {t('Đăng nhập')}
                  </Link>
                  <Link className="nav-signup" to="/register">
                    {t('Tạo tài khoản')}
                  </Link>
                </div>
              )}
            </div>
          </nav>
        </div>
      </header>
      {menuOpen ? (
        // Chạm ra ngoài menu để đóng; nút đóng/Esc vẫn là cách chính cho bàn phím.
        <div aria-hidden="true" className="site-nav-backdrop" onClick={() => closeMenu()} />
      ) : null}

      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>

      <AssistantWidget />

      <footer className="site-footer">
        <div className="container footer-main">
          <div className="footer-brand">
            <Link
              aria-label={t('Bếp Việt - Trang chủ')}
              className="footer-brand__logo"
              onClick={handleFooterNavigation}
              to="/"
            >
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
            <InstallAppButton className="footer-install" variant="footer" />
          </div>
          <nav aria-label={t('Liên kết chân trang')} className="footer-links">
            <div>
              <strong>{t('Khám phá')}</strong>
              <Link onClick={handleFooterNavigation} to="/recipes">
                {t('Kho món Việt')}
              </Link>
              <Link onClick={handleFooterNavigation} to="/meals">
                {t('Bữa cơm gia đình')}
              </Link>
              <Link onClick={handleFooterNavigation} to="/planner">
                {t('Kế hoạch nấu ăn')}
              </Link>
              <Link onClick={handleFooterNavigation} to="/articles">
                {t('Bài viết & câu chuyện')}
              </Link>
              <Link onClick={handleFooterNavigation} to="/favorites">
                {t('Món yêu thích')}
              </Link>
            </div>
            <div>
              <strong>{t('Hỗ trợ')}</strong>
              <Link onClick={handleFooterNavigation} to="/contact">
                {t('Liên hệ hỗ trợ')}
              </Link>
              <Link onClick={handleFooterNavigation} to="/submit-recipe">
                {t('Đề xuất món mới')}
              </Link>
              <nav aria-label={t('Văn bản pháp lý')} className="footer-legal">
                <Link onClick={handleFooterNavigation} to="/terms">
                  {t('Điều khoản sử dụng')}
                </Link>
                <Link onClick={handleFooterNavigation} to="/privacy">
                  {t('Chính sách quyền riêng tư')}
                </Link>
              </nav>
            </div>
          </nav>
          <div className="footer-map">
            <strong>{t('Ghé thăm Bếp Việt')}</strong>
            <LocationMap height={148} />
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} {t('Bếp Việt')}. {t('Bảo lưu mọi quyền.')}
          </span>
        </div>
      </footer>
    </div>
  );
}
