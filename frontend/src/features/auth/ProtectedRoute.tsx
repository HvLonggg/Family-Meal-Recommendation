import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '@/features/auth/AuthContext';
import { loginHref } from '@/features/auth/landing';
import type { UserRole } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';

interface ProtectedRouteProps extends PropsWithChildren {
  allow?: UserRole[];
}

export function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { isLoading, sessionExpired, user } = useAuth();
  const { t } = useI18n();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="route-loading" role="status">
        <span className="button__spinner" aria-hidden="true" />
        {t('Đang khôi phục phiên đăng nhập...')}
      </div>
    );
  }
  if (!user) {
    // Giữ nguyên đường dẫn (cả ?query và #hash) để đăng nhập xong quay lại đúng trang; ghi cả
    // vào URL (?next=) để tải lại trang không mất.
    const from = `${location.pathname}${location.search}${location.hash}`;
    return (
      <Navigate
        replace
        state={{
          from,
          notice: sessionExpired
            ? 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
            : undefined,
        }}
        to={loginHref(from)}
      />
    );
  }
  if (allow && !allow.includes(user.role)) {
    return <Navigate replace to="/account" />;
  }
  return children;
}
