import { Link, Outlet } from 'react-router';

import { AuthCarousel } from '@/components/auth/AuthCarousel';
import { useI18n } from '@/features/i18n/I18nContext';

export function AuthLayout() {
  const { t } = useI18n();
  return (
    <main className="auth-shell">
      <section className="auth-workspace">
        <div className="auth-workspace__inner">
          {/* Logo đã có chữ "BẾP VIỆT" nên không lặp lại tên bên cạnh. */}
          <header className="auth-brand">
            <Link className="auth-brand__link" to="/" aria-label={t('Về trang chủ Bếp Việt')}>
              <img
                alt=""
                className="auth-brand__logo"
                decoding="async"
                height={72}
                src="/images/brand/bep-viet-logo.png"
                width={72}
              />
            </Link>
          </header>
          <div className="auth-card">
            <Outlet />
          </div>
          <p className="auth-workspace__legal">
            © {new Date().getFullYear()} Bếp Việt · <Link to="/terms">{t('Điều khoản')}</Link> ·{' '}
            <Link to="/privacy">{t('Quyền riêng tư')}</Link>
          </p>
        </div>
      </section>
      <AuthCarousel />
    </main>
  );
}
