import { useEffect, useState } from 'react';

import type { ProviderAvailability } from '@/features/auth/types';
import { apiRequest } from '@/lib/api/client';
import { useI18n } from '@/features/i18n/I18nContext';

interface SocialLoginButtonsProps {
  onNotice: (message: string) => void;
}

export function SocialLoginButtons({ onNotice }: SocialLoginButtonsProps) {
  const [providers, setProviders] = useState<ProviderAvailability | null>(null);
  const { t } = useI18n();

  useEffect(() => {
    void apiRequest<ProviderAvailability>('/auth/providers')
      .then(setProviders)
      .catch(() => setProviders({ google: false, facebook: false, email: true }));
  }, []);

  const handleProvider = (provider: 'google' | 'facebook') => {
    const providerName = provider === 'google' ? 'Google' : 'Facebook';
    if (!providers?.[provider]) {
      onNotice(
        t(
          '{provider} đã có sẵn trên giao diện và cần Client ID/Secret để kích hoạt đăng nhập thật.',
          {
            provider: providerName,
          },
        ),
      );
      return;
    }
    window.location.assign(`/api/v1/auth/oauth/${provider}/start`);
  };

  return (
    <>
      <div className="auth-divider">
        <span>{t('Hoặc tiếp tục với')}</span>
      </div>
      <div className="social-login-grid">
        <button
          className="social-button social-button--google"
          onClick={() => handleProvider('google')}
          type="button"
        >
          <svg className="social-button__brand-icon" aria-hidden="true" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.91h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.32 2.98-7.4Z"
            />
            <path
              fill="#34A853"
              d="M12 22c2.7 0 4.96-.9 6.62-2.42l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.6 0-4.81-1.76-5.6-4.13H3.06v2.62A10 10 0 0 0 12 22Z"
            />
            <path
              fill="#FBBC05"
              d="M6.4 13.87A6.02 6.02 0 0 1 6.08 12c0-.65.11-1.28.32-1.87V7.51H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.49l3.34-2.62Z"
            />
            <path
              fill="#EA4335"
              d="M12 6c1.47 0 2.8.51 3.84 1.5l2.87-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.94 5.51l3.34 2.62C7.19 7.76 9.4 6 12 6Z"
            />
          </svg>
          <span>Google</span>
          {!providers?.google ? <small>{t('Sắp có')}</small> : null}
        </button>
        <button
          className="social-button social-button--facebook"
          onClick={() => handleProvider('facebook')}
          type="button"
        >
          <svg className="social-button__brand-icon" aria-hidden="true" viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="11" fill="#1877F2" />
            <path
              fill="#fff"
              d="M16.28 15.47 16.77 12h-3.32V9.75c0-1 .49-1.88 1.95-1.88h1.51V4.92s-1.37-.23-2.68-.23c-2.73 0-4.52 1.66-4.52 4.66V12H6.67v3.47h3.04v8.39a11.2 11.2 0 0 0 3.74 0v-8.39h2.83Z"
            />
          </svg>
          <span>Facebook</span>
          {!providers?.facebook ? <small>{t('Sắp có')}</small> : null}
        </button>
      </div>
    </>
  );
}
