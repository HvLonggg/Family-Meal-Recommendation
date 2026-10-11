import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type PropsWithChildren } from 'react';

import { PreferenceEffects } from '@/features/account/PreferenceEffects';
import { AuthProvider } from '@/features/auth/AuthContext';
import { I18nProvider } from '@/features/i18n/I18nContext';

export function AppProviders({ children }: PropsWithChildren) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: 1,
          },
          mutations: {
            retry: false,
          },
        },
      }),
  );

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
