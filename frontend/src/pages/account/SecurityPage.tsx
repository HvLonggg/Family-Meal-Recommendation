import { useMutation, useQuery } from '@tanstack/react-query';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import { AuthField } from '@/components/auth/AuthField';
import { AppIcon } from '@/components/common/AppIcon';
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
  const { formatDate, t } = useI18n();
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
        <p>{t('Giữ tài khoản an toàn và kiểm soát các thiết bị đang đăng nhập.')}</p>
      </header>

      {error ? <Notice tone="danger">{error}</Notice> : null}

      <div className="ws-split ws-split--wide">
        <Panel
          description={t(
            'Mỗi lần đổi mật khẩu, Bếp Việt sẽ gửi email thông báo và kết thúc các phiên cũ.',
          )}
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
                hint={t('Tối thiểu 8 ký tự, gồm chữ cái và chữ số.')}
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
                  {t('Đổi mật khẩu và đăng xuất phiên cũ')}
                </Button>
              </div>
            </form>
          ) : (
            <div className="ws-callout">
              <p>
                {t(
                  'Tài khoản đăng nhập bằng mạng xã hội chưa có mật khẩu. Hãy tạo mật khẩu qua chức năng quên mật khẩu.',
                )}
              </p>
              <Link className="button button--outline" to="/forgot-password">
                {t('Tạo mật khẩu')}
              </Link>
            </div>
          )}
        </Panel>

        <div className="ws-stack">
          <Panel icon="shield" title={t('Thông tin đăng nhập')}>
            <dl className="security-facts">
              <div>
                <dt>{t('Email')}</dt>
                <dd>{user.email ?? '—'}</dd>
              </div>
              <div>
                <dt>{t('Phương thức')}</dt>
                <dd className="security-facts__badges">
                  {hasPassword ? <StatusBadge tone="info">{t('Mật khẩu')}</StatusBadge> : null}
                  {(overview.data?.linked_providers ?? []).map((provider) => (
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
                    ? formatDate(overview.data.last_login_at, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      })
                    : '—'}
                </dd>
              </div>
            </dl>
          </Panel>
          <Panel
            description={t(
              'Dùng khi bạn quên đăng xuất trên máy lạ hoặc nghi ngờ tài khoản bị truy cập trái phép.',
            )}
            icon="logout"
            title={t('Đăng xuất mọi thiết bị')}
          >
            <Button
              className="button--danger-soft"
              isLoading={revokeMutation.isPending}
              onClick={() => {
                if (window.confirm(t('Đăng xuất khỏi tất cả thiết bị, kể cả thiết bị này?'))) {
                  revokeMutation.mutate();
                }
              }}
              variant="secondary"
            >
              <AppIcon name="logout" size={16} /> {t('Đăng xuất tất cả')}
            </Button>
          </Panel>
          <Panel icon="sparkles" title={t('Mẹo giữ an toàn')}>
            <ul className="tip-list">
              <li>{t('Không dùng lại mật khẩu của tài khoản khác.')}</li>
              <li>{t('Bếp Việt không bao giờ hỏi mật khẩu qua email hay điện thoại.')}</li>
              <li>{t('Đăng xuất sau khi dùng máy tính công cộng.')}</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}
