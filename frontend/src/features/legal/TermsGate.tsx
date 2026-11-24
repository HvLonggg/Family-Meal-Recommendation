import { useMutation } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { acceptTerms } from '@/features/account/accountApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';
import { LEGAL_VERSION } from '@/pages/legal/legalTypes';

/**
 * Hộp thoại chặn khi tài khoản chưa đồng ý phiên bản Điều khoản hiện hành
 * (tài khoản Google/Facebook mới, tài khoản cũ hoặc khi văn bản đổi phiên bản).
 */
export function TermsGate() {
  const { logout, updateUser, user } = useAuth();
  const { t } = useI18n();
  const [error, setError] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  // Không che chính trang Điều khoản/Chính sách (mở ở tab mới để người dùng đọc trước khi đồng ý).
  const onLegalPage = /^\/(terms|privacy)\/?$/.test(window.location.pathname);
  const needsConsent = Boolean(user) && user?.terms_version !== LEGAL_VERSION && !onLegalPage;

  const mutation = useMutation({
    mutationFn: () => acceptTerms(LEGAL_VERSION),
    onSuccess: (updated) => updateUser(updated),
    onError: (acceptError) => setError(errorMessage(acceptError, t)),
  });

  useEffect(() => {
    if (needsConsent) dialogRef.current?.querySelector<HTMLButtonElement>('.button')?.focus();
  }, [needsConsent]);

  if (!needsConsent) return null;
  return (
    <div className="modal-backdrop">
      <div
        aria-describedby="terms-gate-text"
        aria-labelledby="terms-gate-title"
        aria-modal="true"
        className="modal modal--confirm"
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-dialog">
          <span className="confirm-dialog__icon">
            <AppIcon name="shield" size={22} />
          </span>
          <div>
            <h2 id="terms-gate-title">{t('Điều khoản và Chính sách quyền riêng tư')}</h2>
            <p id="terms-gate-text">
              {t('Để tiếp tục dùng Bếp Việt, vui lòng đọc và đồng ý với')}{' '}
              <a href="/terms" rel="noopener" target="_blank">
                {t('Điều khoản sử dụng')}
              </a>{' '}
              {t('và')}{' '}
              <a href="/privacy" rel="noopener" target="_blank">
                {t('Chính sách quyền riêng tư')}
              </a>{' '}
              ({t('phiên bản {version}', { version: LEGAL_VERSION })}).
            </p>
            {error ? (
              <p className="auth-field__error" role="alert">
                {error}
              </p>
            ) : null}
          </div>
        </div>
        <footer className="modal__foot">
          <button className="text-button" onClick={() => void logout()} type="button">
            {t('Đăng xuất')}
          </button>
          <Button isLoading={mutation.isPending} onClick={() => mutation.mutate()}>
            {t('Tôi đồng ý')}
          </Button>
        </footer>
      </div>
    </div>
  );
}
