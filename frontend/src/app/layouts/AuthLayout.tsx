import { Link, Outlet } from 'react-router';

import { AuthCarousel } from '@/components/auth/AuthCarousel';
import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';

export function AuthLayout() {
  return (
    <main className="auth-shell">
      <section className="auth-workspace">
        <div className="auth-workspace__inner">
          <Link className="auth-workspace__brand" to="/" aria-label="Về trang chủ Bếp Việt">
            <KitchenHomeLogo compact />
          </Link>
          <div className="auth-card">
            <Outlet />
          </div>
          <p className="auth-workspace__legal">© 2026 Bếp Việt · Bảo mật và riêng tư</p>
        </div>
      </section>
      <AuthCarousel />
    </main>
  );
}
