import { useEffect, useId, useRef } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { loginHref } from '@/features/auth/landing';
import { useI18n } from '@/features/i18n/I18nContext';
import './login-required-dialog.css';

interface LoginRequiredDialogProps {
  open: boolean;
  onClose: () => void;
  /** Câu mô tả việc cần đăng nhập để làm (ví dụ lưu kế hoạch). */
  description: string;
}

/**
 * Hộp thoại giữa màn hình mời đăng nhập khi khách thực hiện thao tác cần tài khoản.
 * Khách vẫn xem và thử trang; chỉ lúc lưu thật mới cần đăng nhập. Sau khi đăng nhập quay lại đúng trang.
 */
export function LoginRequiredDialog({ description, onClose, open }: LoginRequiredDialogProps) {
  const { t } = useI18n();
  const id = useId();
  const loginRef = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    const previous = document.activeElement as HTMLElement | null;
    loginRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      previous?.focus?.();
    };
  }, [onClose, open]);

  if (!open) return null;
  const returnTo = `${window.location.pathname}${window.location.search}`;

  return (
    <div
      className="modal-backdrop login-required-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby={`${id}-text`}
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="modal login-required"
        role="dialog"
      >
        <button
          aria-label={t('Đóng')}
          className="icon-button login-required__close"
          onClick={onClose}
          type="button"
        >
          <AppIcon name="close" size={18} />
        </button>
        <img alt="" className="login-required__logo" src="/images/brand/bep-viet-logo.png" />
        <h2 id={`${id}-title`}>{t('Đăng nhập để tiếp tục')}</h2>
        <p id={`${id}-text`}>{description}</p>
        <div className="login-required__actions">
          <Link className="button button--primary" ref={loginRef} to={loginHref(returnTo)}>
            {t('Đăng nhập')}
          </Link>
          <Link className="button button--secondary" to="/register">
            {t('Tạo tài khoản')}
          </Link>
        </div>
        <button className="text-button login-required__later" onClick={onClose} type="button">
          {t('Để sau, tiếp tục xem')}
        </button>
      </div>
    </div>
  );
}
