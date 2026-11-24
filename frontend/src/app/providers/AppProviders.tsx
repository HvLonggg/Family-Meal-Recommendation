import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useEffect, useState, type PropsWithChildren } from 'react';

import { PreferenceEffects } from '@/features/account/PreferenceEffects';
import { AuthProvider } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/features/i18n/I18nContext';
import { getSystemStatus, subscribeSystemStatus } from '@/features/system/systemStatus';
import { shouldRetryQuery } from '@/lib/api/retryPolicy';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Không thử lại ngay khi máy chủ báo quá tải: chờ hết Retry-After rồi tải lại bên dưới.
            retry: shouldRetryQuery,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

  // Hết thời gian chờ "đang đông khách": tải lại các truy vấn đang hiển thị mà bị lỗi.
  useEffect(() => {
    let previous = getSystemStatus().kind;
    return subscribeSystemStatus(() => {
      const next = getSystemStatus().kind;
      if (previous === 'busy' && next === 'ok') {
        void queryClient.refetchQueries({
          type: 'active',
          predicate: (query) => query.state.status === 'error',
        });
      }
      previous = next;
    });
  }, [queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <I18nProvider>
          <PreferenceEffects />
          {children}
        </I18nProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
