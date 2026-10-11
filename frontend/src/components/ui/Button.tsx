import type { ButtonHTMLAttributes, PropsWithChildren } from 'react';
import { useI18n } from '@/features/i18n/I18nContext';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  isLoading?: boolean;
}

export function Button({
  children,
  className = '',
  disabled,
  isLoading = false,
  type = 'button',
  variant = 'primary',
  ...props
}: PropsWithChildren<ButtonProps>) {
  const { t } = useI18n();
  const classes = ['button', `button--${variant}`, className].filter(Boolean).join(' ');

  return (
    <button
      className={classes}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      type={type}
      {...props}
    >
      {isLoading ? <span className="button__spinner" aria-hidden="true" /> : null}
      <span>{isLoading ? t('Đang xử lý') : children}</span>
    </button>
  );
}
