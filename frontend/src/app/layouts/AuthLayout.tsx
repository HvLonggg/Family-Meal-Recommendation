import { Link, Outlet } from 'react-router';

import { AuthCarousel } from '@/components/auth/AuthCarousel';
import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { useI18n } from '@/features/i18n/I18nContext';

export function AuthLayout() {
  const { t } = useI18n();
  return (
    <main className="auth-shell">
      <section className="auth-workspace">
        <div className="auth-workspace__inner">
          <Link className="auth-workspace__brand" to="/" aria-label={t('Về trang chủ Bếp Việt')}>
            <KitchenHomeLogo compact />
          </Link>
          <div className="auth-card">
            <Outlet />
          </div>
          <p className="auth-workspace__legal">
            © {new Date().getFullYear()} Bếp Việt · {t('Bảo mật và riêng tư')}
          </p>
        </div>
      </section>
      <AuthCarousel />
    </main>
  );
}
