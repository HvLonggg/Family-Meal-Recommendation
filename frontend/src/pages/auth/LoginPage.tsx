import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { getAuthErrorMessage } from '@/features/auth/errors';

interface LoginForm {
  email: string;
  password: string;
}

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<LoginForm>();

  const submit = handleSubmit(async (values) => {
    setMessage('');
    setIsSubmitting(true);
    try {
      const user = await login(values);
      const requestedPath = (location.state as { from?: string } | null)?.from;
      await navigate(requestedPath ?? (user.role === 'admin' ? '/quan-tri' : '/tai-khoan'), {
        replace: true,
      });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">Chào mừng trở lại</span>
        <h2>Đăng nhập Bếp Việt</h2>
        <p>Tiếp tục hành trình chuẩn bị những bữa cơm thật nhẹ nhàng.</p>
      </div>

      {message ? <AuthAlert tone="info">{message}</AuthAlert> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField
          autoComplete="email"
          error={errors.email?.message}
          id="login-email"
          label="Địa chỉ email"
          placeholder="ban@example.com"
          type="email"
          {...register('email', {
            required: 'Vui lòng nhập email.',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Email chưa đúng định dạng.' },
          })}
        />
        <AuthField
          autoComplete="current-password"
          error={errors.password?.message}
          id="login-password"
          label="Mật khẩu"
          placeholder="Nhập mật khẩu"
          type="password"
          {...register('password', { required: 'Vui lòng nhập mật khẩu.' })}
        />
        <div className="auth-form__between">
          <label className="auth-checkbox">
            <input type="checkbox" />
            <span>Ghi nhớ thiết bị này</span>
          </label>
          <Link to="/quen-mat-khau">Quên mật khẩu?</Link>
        </div>
        <Button className="auth-submit" isLoading={isSubmitting} type="submit">
          Đăng nhập
        </Button>
      </form>

      <SocialLoginButtons onNotice={setMessage} />

      <p className="auth-switch">
        Chưa có tài khoản? <Link to="/dang-ky">Tạo tài khoản miễn phí</Link>
      </p>
    </>
  );
}
