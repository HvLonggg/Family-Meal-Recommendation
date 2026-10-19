import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { errorMessage } from '@/lib/errors';
import { useI18n } from '@/features/i18n/I18nContext';

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

const REMEMBERED_IDENTIFIER_KEY = 'bep-viet-login-hint-v1';

function getRememberedIdentifier() {
  try {
    return localStorage.getItem(REMEMBERED_IDENTIFIER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const loginState = location.state as { email?: string; from?: string; notice?: string } | null;
  const [message, setMessage] = useState(() => (loginState?.notice ? t(loginState.notice) : ''));
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginForm>({
    defaultValues: {
      email: loginState?.email ?? getRememberedIdentifier(),
      password: '',
      rememberMe: false,
    },
  });

  const submit = handleSubmit(async (values) => {
    setMessage('');
    setIsSubmitting(true);
    try {
      const user = await login({
        email: values.email,
        password: values.password,
        remember_me: values.rememberMe,
      });
      try {
        if (values.rememberMe) {
          localStorage.setItem(REMEMBERED_IDENTIFIER_KEY, values.email.trim());
        } else {
          localStorage.removeItem(REMEMBERED_IDENTIFIER_KEY);
        }
      } catch {
        // Authentication still works when browser storage is disabled.
      }
      const requestedPath = loginState?.from;
// Chỉ giữ đường dẫn chuyển tiếp trong khu quản trị.
      const landing =
        user.role === 'admin'
          ? requestedPath?.startsWith('/admin')
            ? requestedPath
            : '/admin'
          : (requestedPath ?? '/account');
      await navigate(landing, {
        replace: true,
      });
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">{t('Chào mừng trở lại')}</span>
        <h2>{t('Đăng nhập Bếp Việt')}</h2>
        <p>{t('Tiếp tục hành trình chuẩn bị những bữa cơm thật nhẹ nhàng.')}</p>
      </div>

      {message ? <AuthAlert tone="info">{message}</AuthAlert> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField
          autoComplete="username"
          error={errors.email?.message}
          id="login-email"
          label={t('Email đăng nhập')}
          placeholder="ban@example.com"
          type="email"
          {...register('email', {
            required: t('Vui lòng nhập email.'),
            pattern: { value: /^\S+@\S+\.\S+$/, message: t('Email chưa đúng định dạng.') },
          })}
        />
        <AuthField
          autoComplete="current-password"
          error={errors.password?.message}
          id="login-password"
          label={t('Mật khẩu')}
          placeholder={t('Nhập mật khẩu')}
          type="password"
          {...register('password', { required: t('Vui lòng nhập mật khẩu.') })}
        />
        <div className="auth-form__between">
          <label className="auth-checkbox">
            <input type="checkbox" {...register('rememberMe')} />
            <span>{t('Ghi nhớ thiết bị này')}</span>
          </label>
          <Link to="/forgot-password">{t('Quên mật khẩu?')}</Link>
        </div>
        <p className="auth-field__hint">
          {t(
            'Giữ phiên đăng nhập và gợi ý email trên thiết bị này. Mật khẩu chỉ được trình duyệt lưu nếu bạn đồng ý với trình quản lý mật khẩu của trình duyệt.',
          )}
        </p>
        <Button className="auth-submit" isLoading={isSubmitting} type="submit">
          {t('Đăng nhập')}
        </Button>
      </form>

      <SocialLoginButtons onNotice={setMessage} />

      <p className="auth-switch">
        {t('Chưa có tài khoản?')} <Link to="/register">{t('Tạo tài khoản miễn phí')}</Link>
      </p>
    </>
  );
}
