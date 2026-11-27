import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { useAuthTitle } from '@/components/auth/useAuthTitle';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { authHref, landingPath, safeReturnPath } from '@/features/auth/landing';
import { errorMessage } from '@/lib/errors';
import { useI18n } from '@/features/i18n/I18nContext';

interface LoginForm {
  email: string;
  password: string;
  rememberMe: boolean;
}

const REMEMBERED_IDENTIFIER_KEY = 'bep-viet-login-hint-v1';

type Translate = ReturnType<typeof useI18n>['t'];

/** Lý do khách bị đưa tới trang đăng nhập, theo trang họ muốn mở. */
function guestReason(path: string, t: Translate) {
  if (path.startsWith('/planner')) return t('Đăng nhập để lên kế hoạch bữa ăn cho cả tuần.');
  if (path.startsWith('/cook')) return t('Đăng nhập để vào bếp và theo dõi từng bước nấu.');
  if (path.startsWith('/admin')) return t('Đăng nhập bằng tài khoản quản trị để tiếp tục.');
  return t('Đăng nhập để lưu món và lên kế hoạch bữa ăn.');
}

function getRememberedIdentifier() {
  try {
    return localStorage.getItem(REMEMBERED_IDENTIFIER_KEY) ?? '';
  } catch {
    return '';
  }
}

export function LoginPage() {
  const { isLoading, login, user: currentUser } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const loginState = location.state as { email?: string; from?: string; notice?: string } | null;
  // `?next=` giữ đường quay lại khi tải lại trang; state.from vẫn dùng cho điều hướng trong SPA.
  const returnPath =
    safeReturnPath(searchParams.get('next') ?? undefined) ??
    safeReturnPath(loginState?.from) ??
    undefined;
  // Khách bị chuyển tới từ một trang cần đăng nhập (không phải phiên hết hạn hay vừa đăng ký).
  const isGuestRedirect = Boolean(returnPath) && !loginState?.notice;
  useAuthTitle(t('Đăng nhập'));
  // Thông báo chuyển tiếp (vd. vừa đăng ký xong) là thông tin; lỗi đăng nhập hiển thị kiểu lỗi.
  const [notice, setNotice] = useState(() =>
    loginState?.notice
      ? t(loginState.notice)
      : returnPath && isGuestRedirect
        ? guestReason(returnPath, t)
        : '',
  );
  const registerLink = authHref('/register', returnPath);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginForm>({
    mode: 'onTouched',
    defaultValues: {
      email: loginState?.email ?? getRememberedIdentifier(),
      password: '',
      rememberMe: false,
    },
  });

  const submit = handleSubmit(async (values) => {
    setNotice('');
    setError('');
    setIsSubmitting(true);
    try {
      await login({
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
      // Quay lại đúng trang đã mở trước khi bị yêu cầu đăng nhập.
      await navigate(landingPath(returnPath), { replace: true });
    } catch (loginError) {
      setError(errorMessage(loginError, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  // Đã đăng nhập (mở lại /login hoặc bấm Quay lại) thì vào thẳng ứng dụng.
  if (!isLoading && currentUser && !isSubmitting) {
    return <Navigate replace to={landingPath(returnPath)} />;
  }

  return (
    <>
      <div className="auth-card__heading">
        {isGuestRedirect ? (
          <>
            <h1>{t('Đăng nhập hoặc tạo tài khoản')}</h1>
            <p>
              {t('Mới đến Bếp Việt?')}{' '}
              <Link className="auth-inline-link" to={registerLink}>
                {t('Tạo tài khoản miễn phí')}
              </Link>
            </p>
          </>
        ) : (
          <>
            <h1>{t('Đăng nhập')}</h1>
            <p>{t('Chào mừng bạn quay lại.')}</p>
          </>
        )}
      </div>

      {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
      {notice ? <AuthAlert tone="info">{notice}</AuthAlert> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField
          autoComplete="username"
          error={errors.email?.message}
          id="login-email"
          label={t('Email đăng nhập')}
          placeholder={t('ban@example.com')}
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
            <span>{t('Ghi nhớ đăng nhập')}</span>
          </label>
          <Link to="/forgot-password">{t('Quên mật khẩu?')}</Link>
        </div>
        <Button className="auth-submit" isLoading={isSubmitting} type="submit">
          {t('Đăng nhập')}
        </Button>
      </form>

      <SocialLoginButtons returnPath={returnPath} />

      <p className="auth-switch">
        {t('Chưa có tài khoản?')} <Link to={registerLink}>{t('Tạo tài khoản miễn phí')}</Link>
      </p>
    </>
  );
}
