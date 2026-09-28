import type { PropsWithChildren } from 'react';
import { Navigate, useLocation } from 'react-router';

import { useAuth } from '@/features/auth/AuthContext';
import type { UserRole } from '@/features/auth/types';

interface ProtectedRouteProps extends PropsWithChildren {
  allow?: UserRole[];
}

export function ProtectedRoute({ allow, children }: ProtectedRouteProps) {
  const { isLoading, user } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="route-loading" role="status">
        <span className="button__spinner" aria-hidden="true" />
        Đang khôi phục phiên đăng nhập...
      </div>
    );
  }
  if (!user) {
    return <Navigate replace state={{ from: location.pathname }} to="/dang-nhap" />;
  }
  if (allow && !allow.includes(user.role)) {
    return <Navigate replace to="/tai-khoan" />;
  }
  return children;
}
