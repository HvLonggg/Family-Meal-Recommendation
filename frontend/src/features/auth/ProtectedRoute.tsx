import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '@/features/auth/AuthContext';
import type { UserRole } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';

interface ProtectedRouteProps extends PropsWithChildren {
  allow?: UserRole[];
}

export function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { isLoading, user } = useAuth();
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
    return <Navigate replace state={{ from: location.pathname }} to="/login" />;
  }
  if (allow && !allow.includes(user.role)) {
    return <Navigate replace to="/account" />;
  }
  return children;
}
