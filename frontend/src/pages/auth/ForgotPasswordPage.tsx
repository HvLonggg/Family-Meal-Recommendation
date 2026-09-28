import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { getAuthErrorMessage } from '@/features/auth/errors';
import { apiPost } from '@/lib/api/client';

interface ForgotForm {
  email: string;
}

interface ForgotResponse {
  development_reset_token: string | null;
  message: string;
}

export function ForgotPasswordPage() {
  const [result, setResult] = useState<ForgotResponse | null>(null);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    handleSubmit,
    register,
  } = useForm<ForgotForm>();

  const submit = handleSubmit(async (values) => {
    setError('');
    setIsSubmitting(true);
    try {
      setResult(await apiPost<ForgotResponse>('/auth/forgot-password', values));
    } catch (requestError) {
      setError(getAuthErrorMessage(requestError));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">Khôi phục tài khoản</span>
        <h2>Quên mật khẩu?</h2>
        <p>Nhập email đã đăng ký, chúng tôi sẽ giúp bạn tạo mật khẩu mới.</p>
      </div>
      {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
      {result ? (
        <AuthAlert tone="success">
          <p>{result.message}</p>
          {result.development_reset_token ? (
            <Link
              className="auth-inline-link"
              to={`/dat-lai-mat-khau?token=${encodeURIComponent(result.development_reset_token)}`}
            >
              Mở liên kết đặt lại mật khẩu thử nghiệm
            </Link>
          ) : null}
        </AuthAlert>
      ) : null}
      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField
          autoComplete="email"
          error={errors.email?.message}
          id="forgot-email"
          label="Địa chỉ email"
          placeholder="ban@example.com"
          type="email"
          {...register('email', {
            required: 'Vui lòng nhập email.',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Email chưa đúng định dạng.' },
          })}
        />
        <Button className="auth-submit" isLoading={isSubmitting} type="submit">
          Gửi hướng dẫn khôi phục
        </Button>
      </form>
      <p className="auth-switch">
        <Link to="/dang-nhap">← Quay lại đăng nhập</Link>
      </p>
    </>
  );
}
