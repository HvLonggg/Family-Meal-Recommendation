import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { AuthField } from '@/components/auth/AuthField';
import { AppIcon } from '@/components/common/AppIcon';
import { useConfirmDialog } from '@/components/common/useConfirmDialog';
import { Button } from '@/components/ui/Button';
import { Notice, Panel, StatusBadge } from '@/components/ui/Workspace';
import {
  accountOverviewQueryKey,
  changePassword,
  getAccountOverview,
  revokeAllSessions,
} from '@/features/account/accountApi';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { errorMessage } from '@/lib/errors';
import { formatDisplayDateTime } from '@/lib/formatDate';
import { ChangeEmailPanel } from '@/pages/account/ChangeEmailPanel';
import { DeleteAccountPanel } from '@/pages/account/DeleteAccountPanel';

import './settings-page.css';

function passwordStrength(value: string) {
  let score = 0;
  if (value.length >= 8) score += 1;
  if (value.length >= 12) score += 1;
  if (/[a-zA-Z]/.test(value) && /\d/.test(value)) score += 1;
  if (/[^a-zA-Z\d]/.test(value) || /[A-Z]/.test(value)) score += 1;
  return score;
}

const strengthLabels = ['Rất yếu', 'Yếu', 'Trung bình', 'Mạnh', 'Rất mạnh'];

export function SecurityPage() {
  const { logout, user } = useAuth();
  const { t } = useI18n();
  const { confirm, dialog } = useConfirmDialog();
  const navigate = useNavigate();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const overview = useQuery({
    queryKey: accountOverviewQueryKey(user?.id),
    queryFn: ({ signal }) => getAccountOverview(signal),
    enabled: Boolean(user),
  });

  const finishWithRelogin = async (message: string) => {
    await logout();
    await navigate('/login', { replace: true, state: { notice: t(message) } });
  };

  const passwordMutation = useMutation({
    mutationFn: () => changePassword(currentPassword, newPassword),
    onSuccess: (result) => finishWithRelogin(result.message),
    onError: (changeError) => setError(errorMessage(changeError, t)),
  });
  const revokeMutation = useMutation({
    mutationFn: revokeAllSessions,
    onSuccess: (result) => finishWithRelogin(result.message),
    onError: (revokeError) => setError(errorMessage(revokeError, t)),
  });

  if (!user) return null;
  const strength = passwordStrength(newPassword);
  const hasPassword = overview.data?.has_password ?? true;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError('');
    if (newPassword !== confirmPassword) {
      setError(t('Mật khẩu mới nhập lại chưa trùng khớp.'));
      return;
    }
    passwordMutation.mutate();
  };

  return (
    <>
      <header className="ws-heading">
        <span className="section-label">{t('Bảo mật tài khoản')}</span>
        <h1>{t('Đổi mật khẩu & bảo mật')}</h1>
      </header>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="ws-split ws-split--wide security-page">
        <Panel
          className="security-card"
          description={t('Các phiên cũ sẽ được đăng xuất sau khi đổi.')}
          icon="lock"
          id="password"
          title={t('Đổi mật khẩu')}
        >
          {hasPassword ? (
            <form className="ws-form" onSubmit={submit}>
              <AuthField
                autoComplete="current-password"
                id="account-current-password"
                label={t('Mật khẩu hiện tại')}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder={t('Nhập mật khẩu hiện tại')}
                required
                type="password"
                value={currentPassword}
              />
              <AuthField
                autoComplete="new-password"
                hint={t('Tối thiểu 8 ký tự, có chữ và số.')}
                id="account-new-password"
                label={t('Mật khẩu mới')}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder={t('Tạo mật khẩu mới')}
                required
                type="password"
                value={newPassword}
              />
              {newPassword ? (
                <div className="strength-meter" aria-live="polite">
                  <div>
                    {[0, 1, 2, 3].map((step) => (
                      <span
                        className={step < strength ? `is-on is-level-${strength}` : ''}
                        key={step}
                      />
                    ))}
                  </div>
                  <small>
                    {t('Độ mạnh')}: {t(strengthLabels[strength]!)}
                  </small>
                </div>
              ) : null}
              <AuthField
                autoComplete="new-password"
                id="account-confirm-password"
                label={t('Nhập lại mật khẩu mới')}
                onChange={(event) => setConfirmPassword(event.target.value)}
                placeholder={t('Nhập lại mật khẩu mới')}
                required
                type="password"
                value={confirmPassword}
              />
              <div className="ws-form__actions">
                <Button isLoading={passwordMutation.isPending} type="submit">
                  {t('Đổi mật khẩu')}
                </Button>
              </div>
            </form>
          ) : (
            <div className="ws-callout">
              <p>{t('Tài khoản chưa có mật khẩu (đăng nhập bằng mạng xã hội).')}</p>
              <Link className="button button--outline" to="/forgot-password">
                {t('Tạo mật khẩu')}
              </Link>
            </div>
          )}
        </Panel>

        <div className="ws-stack">
          <Panel className="security-card" icon="shield" id="sessions" title={t('Phiên đăng nhập')}>
            <dl className="security-facts">
              <div>
                <dt>{t('Email')}</dt>
                <dd className="security-facts__email">
                  <span>{user.email ?? '—'}</span>
                  <a className="text-link security-facts__action" href="#email">
                    {t('Đổi email')}
                  </a>
                </dd>
              </div>
              <div>
                <dt>{t('Phương thức')}</dt>
                <dd className="security-facts__badges">
                  {hasPassword ? <StatusBadge tone="info">{t('Mật khẩu')}</StatusBadge> : null}
                  {(overview.data?.linked_providers ?? [])
                    // Đăng nhập bằng mật khẩu đã hiện ở huy hiệu "Mật khẩu" phía trước.
                    .filter((provider) => provider !== 'password')
                    .map((provider) => (
                      <StatusBadge key={provider} tone="neutral">
                        {provider === 'google'
                          ? 'Google'
                          : provider === 'facebook'
                            ? 'Facebook'
                            : provider}
                      </StatusBadge>
                    ))}
                </dd>
              </div>
              <div>
                <dt>{t('Đăng nhập gần nhất')}</dt>
                <dd>
                  {overview.data?.last_login_at
                    ? formatDisplayDateTime(overview.data.last_login_at)
                    : '—'}
                </dd>
              </div>
            </dl>
            <div className="security-card__footer">
              <Button
                className="button--danger-soft"
                isLoading={revokeMutation.isPending}
                onClick={() =>
                  void confirm({
                    title: t('Đăng xuất khỏi tất cả thiết bị, kể cả thiết bị này?'),
                    description: t('Bạn sẽ cần đăng nhập lại trên mọi thiết bị.'),
                    confirmLabel: t('Đăng xuất tất cả'),
                    tone: 'danger',
                  }).then((ok) => {
                    if (ok !== null) revokeMutation.mutate();
                  })
                }
                variant="secondary"
              >
                <AppIcon name="logout" size={15} /> {t('Đăng xuất mọi thiết bị')}
              </Button>
              <small>{t('Dùng khi quên đăng xuất trên máy lạ.')}</small>
            </div>
          </Panel>
          <ChangeEmailPanel hasPassword={hasPassword} />
          <DeleteAccountPanel hasPassword={hasPassword} />
        </div>
      </div>
      {dialog}
    </>
  );
}
