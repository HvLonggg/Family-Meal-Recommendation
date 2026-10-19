import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type FormEvent } from 'react';

import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { Notice, Panel } from '@/components/ui/Workspace';
import {
  confirmEmailChange,
  requestEmailChange,
  type EmailChangeChallenge,
} from '@/features/account/accountApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';

const RESEND_SECONDS = 60;

/** Đổi email đăng nhập: gửi mã 5 số tới email mới, nhập đúng mã thì đổi ngay. */
export function ChangeEmailPanel({ hasPassword }: { hasPassword: boolean }) {
  const { t } = useI18n();
  const { updateUser, user } = useAuth();
  const queryClient = useQueryClient();
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [challenge, setChallenge] = useState<EmailChangeChallenge | null>(null);
  const [resendAt, setResendAt] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    if (!challenge) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [challenge]);

  const requestMutation = useMutation({
    mutationFn: () => requestEmailChange(newEmail.trim(), hasPassword ? password : undefined),
    onSuccess: (result) => {
      setChallenge(result);
      setCode('');
      setNow(Date.now());
      setResendAt(Date.now() + RESEND_SECONDS * 1000);
    },
    onError: (requestError) => setError(errorMessage(requestError, t)),
  });
  const confirmMutation = useMutation({
    mutationFn: (challengeId: string) => confirmEmailChange(challengeId, code),
    onSuccess: async (updated) => {
      updateUser(updated);
      setSuccess(
        t('Đã đổi email thành công. Từ nay bạn đăng nhập bằng {email}.', {
          email: updated.email ?? '',
        }),
      );
      setChallenge(null);
      setNewEmail('');
      setPassword('');
      setCode('');
      await queryClient.invalidateQueries({ queryKey: ['account-overview'] });
    },
    onError: (confirmError) => setError(errorMessage(confirmError, t)),
  });

  const sendCode = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) {
      setError(t('Email chưa đúng định dạng.'));
      return;
    }
    if (newEmail.trim().toLowerCase() === user?.email?.toLowerCase()) {
      setError(t('Email mới phải khác email hiện tại.'));
      return;
    }
    requestMutation.mutate();
  };

  const confirm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (!challenge) return;
    if (!/^\d{5}$/.test(code)) {
      setError(t('Mã xác thực gồm đúng 5 chữ số.'));
      return;
    }
    confirmMutation.mutate(challenge.challenge_id);
  };

  const waitSeconds = Math.max(0, Math.ceil((resendAt - now) / 1000));

  return (
    <Panel
      description={t(
        'Mã xác nhận sẽ được gửi tới email mới. Email cũ nhận thông báo khi đổi thành công.',
      )}
      icon="mail"
      id="email"
      title={t('Đổi email')}
    >
      {error ? <Notice tone="danger">{error}</Notice> : null}
      {success ? <Notice tone="success">{success}</Notice> : null}

      {challenge ? (
        <form className="ws-form" noValidate onSubmit={confirm}>
          <Notice tone="info">
            {t('Mã xác nhận đã được gửi tới')} <strong>{newEmail.trim().toLowerCase()}</strong>
          </Notice>
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
            id="account-email-code"
            inputMode="numeric"
            label={t('Mã xác nhận')}
            maxLength={5}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            placeholder="•••••"
            required
            value={code}
          />
          <div className="ws-form__actions">
            <Button isLoading={confirmMutation.isPending} type="submit">
              {t('Xác nhận đổi email')}
            </Button>
            <Button
              disabled={waitSeconds > 0 || requestMutation.isPending}
              onClick={() => {
                setError('');
                requestMutation.mutate();
              }}
              type="button"
              variant="secondary"
            >
              {waitSeconds > 0
                ? t('Gửi lại mã sau {seconds} giây', { seconds: waitSeconds })
                : t('Gửi lại mã')}
            </Button>
            <Button
              onClick={() => {
                setChallenge(null);
                setCode('');
                setError('');
              }}
              type="button"
              variant="ghost"
            >
              {t('Dùng email khác')}
            </Button>
          </div>
        </form>
      ) : (
        <form className="ws-form" noValidate onSubmit={sendCode}>
          <AuthField
            autoComplete="email"
            id="account-new-email"
            label={t('Email mới')}
            onChange={(event) => setNewEmail(event.target.value)}
            placeholder="ban@example.com"
            required
            type="email"
            value={newEmail}
          />
          {hasPassword ? (
            <AuthField
              autoComplete="current-password"
              hint={t('Nhập lại mật khẩu để xác minh chính bạn đang đổi email.')}
              id="account-email-password"
              label={t('Mật khẩu hiện tại')}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t('Nhập mật khẩu hiện tại')}
              required
              type="password"
              value={password}
            />
          ) : null}
          <div className="ws-form__actions">
            <Button isLoading={requestMutation.isPending} type="submit">
              {t('Gửi mã xác nhận')}
            </Button>
          </div>
        </form>
      )}
    </Panel>
  );
}
