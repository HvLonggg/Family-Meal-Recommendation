import { useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';

import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';

export function OAuthCallbackPage() {
  const { isLoading, user } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const hasError = searchParams.get('status') === 'error';

  useEffect(() => {
    if (!isLoading && user) {
      const landing = user.role === 'admin' ? '/admin' : '/account';
      void navigate(landing, { replace: true });
    }
  }, [isLoading, navigate, user]);

  if (hasError || (!isLoading && !user)) {
    return (
      <div className="oauth-result">
        <span className="oauth-result__icon oauth-result__icon--error" aria-hidden="true">
          !
        </span>
        <h2>{t('Chưa thể đăng nhập Google')}</h2>
        <p>
          {t('Phiên xác thực không hợp lệ hoặc bạn đã đóng cửa sổ cấp quyền. Vui lòng thử lại.')}
        </p>
        <Link className="button button--primary" to="/login">
          {t('Quay lại đăng nhập')}
        </Link>
      </div>
    );
  }

  return (
    <div className="oauth-result" role="status">
      <span className="oauth-result__spinner" aria-hidden="true" />
      <h2>{t('Đang hoàn tất đăng nhập')}</h2>
      <p>{t('Bếp Việt đang chuẩn bị không gian riêng cho bạn…')}</p>
    </div>
  );
}
