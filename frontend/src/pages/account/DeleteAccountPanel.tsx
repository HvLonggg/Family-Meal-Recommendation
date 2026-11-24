import { useMutation } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { AuthField } from '@/components/auth/AuthField';
import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { Notice, Panel } from '@/components/ui/Workspace';
import {
  deleteAccount,
  requestAccountDeletionCode,
  type EmailChangeChallenge,
} from '@/features/account/accountApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const CONFIRM_WORD = 'XÓA';

/** Vùng nguy hiểm: xóa vĩnh viễn tài khoản sau khi xác nhận lại mật khẩu hoặc mã email. */
export function DeleteAccountPanel({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useI18n();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<EmailChangeChallenge | null>(null);
  const [error, setError] = useState('');

  const codeMutation = useMutation({
    mutationFn: requestAccountDeletionCode,
    onSuccess: (result) => {
      setChallenge(result);
      setCode('');
    },
    onError: (requestError) => setError(errorMessage(requestError, t)),
  });
  const deleteMutation = useMutation({
    mutationFn: () =>
      deleteAccount({
        confirmation: confirmation.trim(),
        ...(hasPassword ? { password } : { challenge_id: challenge?.challenge_id, code }),
      }),
    onSuccess: async (result) => {
      try {
        await logout();
      } catch {
        // Phiên đã bị xóa cùng tài khoản; chỉ cần dọn trạng thái phía trình duyệt.
      }
      await navigate('/login', { replace: true, state: { notice: t(result.message) } });
    },
    onError: (deleteError) => setError(errorMessage(deleteError, t)),
  });

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (confirmation.trim().toUpperCase() !== CONFIRM_WORD) {
      setError(t('Hãy gõ XÓA để xác nhận.'));
      return;
    }
    if (!hasPassword && (!challenge || !/^\d{5}$/.test(code))) {
      setError(t('Mã xác thực gồm đúng 5 chữ số.'));
      return;
    }
    deleteMutation.mutate();
  };

  return (
    <Panel
      className="danger-zone"
      description={t(
        'Xóa vĩnh viễn tài khoản, cài đặt, kế hoạch, yêu thích, nhật ký nấu, hội thoại và ghi nhớ của trợ lý. Bài viết đã xuất bản được giữ lại ở dạng ẩn danh. Không thể hoàn tác.',
      )}
      icon="trash"
      id="delete-account"
      title={t('Xóa tài khoản')}
    >
      {!open ? (
        <div className="ws-form__actions">
          <Button className="button--danger-soft" onClick={() => setOpen(true)} variant="secondary">
            <AppIcon name="trash" size={16} /> {t('Tôi muốn xóa tài khoản')}
          </Button>
        </div>
      ) : (
        <form className="ws-form" noValidate onSubmit={submit}>
          <Notice tone="warning">
            {t('Nên tải dữ liệu của bạn trước khi xóa:')}{' '}
            <Link to="/account/settings">{t('Tải dữ liệu của tôi')}</Link>
          </Notice>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {hasPassword ? (
            <AuthField
              autoComplete="current-password"
              id="delete-account-password"
              label={t('Mật khẩu hiện tại')}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('Nhập mật khẩu hiện tại')}
              required
              type="password"
              value={password}
            />
          ) : challenge ? (
            <>
              {challenge.development_code ? (
                <Notice tone="warning">
                  {t('Mã OTP dùng thử trên môi trường phát triển:')}{' '}
                  <strong>{challenge.development_code}</strong>
                </Notice>
              ) : null}
              <AuthField
                autoComplete="one-time-code"
                hint={t('Mã gồm 5 chữ số, có hiệu lực trong {minutes} phút.', {
                  minutes: Math.ceil(challenge.expires_in / 60),
                })}
                id="delete-account-code"
                inputMode="numeric"
                label={t('Mã xác nhận')}
                maxLength={5}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                placeholder="•••••"
                required
                value={code}
              />
            </>
          ) : (
            <Button
              isLoading={codeMutation.isPending}
              onClick={() => {
                setError('');
                codeMutation.mutate();
              }}
              type="button"
              variant="secondary"
            >
              {t('Gửi mã xác nhận tới email')}
            </Button>
          )}
          <AuthField
            autoComplete="off"
            hint={t('Gõ chữ XÓA (viết hoa) để xác nhận.')}
            id="delete-account-confirm"
            label={t('Xác nhận')}
            onChange={(event) => setConfirmation(event.target.value)}
            required
            value={confirmation}
          />
          <div className="ws-form__actions">
            <Button className="button--danger" isLoading={deleteMutation.isPending} type="submit">
              {t('Xóa vĩnh viễn tài khoản')}
            </Button>
            <Button
              onClick={() => {
                setOpen(false);
                setError('');
                setPassword('');
                setConfirmation('');
              }}
              type="button"
              variant="ghost"
            >
              {t('Hủy')}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
