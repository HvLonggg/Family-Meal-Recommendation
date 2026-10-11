import { useState, type InputHTMLAttributes } from 'react';
import { useI18n } from '@/features/i18n/I18nContext';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  hint?: string;
  label: string;
}

export function AuthField({ error, hint, id, label, type = 'text', ...props }: AuthFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const { t } = useI18n();
  const isPassword = type === 'password';
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input${error ? ' auth-input--error' : ''}`}>
        <input
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          id={id}
          type={isPassword && showPassword ? 'text' : type}
          {...props}
        />
        {isPassword ? (
          <button
            aria-label={showPassword ? t('Ẩn mật khẩu') : t('Hiện mật khẩu')}
            aria-pressed={showPassword}
            className="auth-input__action"
            onClick={() => setShowPassword((current) => !current)}
            title={showPassword ? t('Ẩn mật khẩu') : t('Hiện mật khẩu')}
            type="button"
          >
            {showPassword ? (
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8" />
                <path d="M9.9 5.1A11 11 0 0 1 12 5c6.4 0 10 7 10 7a16 16 0 0 1-3.1 3.9M6.6 6.6C3.8 8.1 2 12 2 12s3.6 7 10 7c1 0 1.9-.2 2.8-.5" />
              </svg>
            ) : (
              <svg aria-hidden="true" fill="none" viewBox="0 0 24 24">
                <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="auth-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="auth-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
