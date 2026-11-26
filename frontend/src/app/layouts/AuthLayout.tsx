import { Link, Outlet } from 'react-router';

import familyMealImage from '@/assets/auth/mam-com-nha.webp';
import { AuthCarousel } from '@/components/auth/AuthCarousel';
import { useI18n } from '@/features/i18n/I18nContext';

export function AuthLayout() {
  const { t } = useI18n();
  return (
    <main className="auth-shell">
      <section className="auth-workspace">
        <div className="auth-workspace__inner">
          {/* Màn hình nhỏ: thẻ thương hiệu (logo, tên, khẩu hiệu, ảnh món) thay cho ảnh carousel.
              Màn hình rộng: chỉ còn logo, carousel bên phải kể câu chuyện. */}
          <header className="auth-brand">
            <Link className="auth-brand__link" to="/" aria-label={t('Về trang chủ Bếp Việt')}>
              <img
                alt=""
                className="auth-brand__logo"
                decoding="async"
                height={80}
                src="/images/brand/bep-viet-logo.png"
                width={80}
              />
              <span className="auth-brand__text">
                <span className="auth-brand__name">Bếp Việt</span>
                <span className="auth-brand__tagline">{t('Gợi ý món ngon cho bữa cơm nhà')}</span>
              </span>
            </Link>
            {/* Cùng ảnh với slide đầu của carousel (đã tải sẵn), nên không tốn thêm băng thông. */}
            <img
              alt=""
              className="auth-brand__dish"
              decoding="async"
              height={88}
              src={familyMealImage}
              width={88}
            />
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
