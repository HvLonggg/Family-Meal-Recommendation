import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { getAuthErrorMessage } from '@/features/auth/errors';
import { apiPost } from '@/lib/api/client';

interface ResetForm {
  confirmPassword: string;
  password: string;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
  } = useForm<ResetForm>();

  const submit = handleSubmit(async (values) => {
    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await apiPost<{ message: string }>('/auth/reset-password', {
        token,
        new_password: values.password,
      });
      setMessage(response.message);
      setSuccess(true);
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">Bảo vệ tài khoản</span>
        <h2>Tạo mật khẩu mới</h2>
        <p>Chọn mật khẩu riêng biệt và dễ nhớ với bạn.</p>
      </div>
      {!token ? (
        <AuthAlert tone="danger">Liên kết đặt lại mật khẩu đang thiếu token.</AuthAlert>
      ) : null}
      {message ? <AuthAlert tone={success ? 'success' : 'danger'}>{message}</AuthAlert> : null}
      {!success ? (
        <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
          <AuthField
            autoComplete="new-password"
            error={errors.password?.message}
            hint="Tối thiểu 8 ký tự, gồm chữ cái và chữ số."
            id="reset-password"
            label="Mật khẩu mới"
            placeholder="Nhập mật khẩu mới"
            type="password"
            {...register('password', {
              required: 'Vui lòng nhập mật khẩu mới.',
              minLength: { value: 8, message: 'Mật khẩu cần ít nhất 8 ký tự.' },
              validate: (value) =>
                (/[A-Za-zÀ-ỹ]/.test(value) && /\d/.test(value)) ||
                'Mật khẩu cần có chữ cái và chữ số.',
            })}
          />
          <AuthField
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            id="reset-confirm-password"
            label="Nhập lại mật khẩu"
            placeholder="Nhập lại mật khẩu mới"
            type="password"
            {...register('confirmPassword', {
              required: 'Vui lòng nhập lại mật khẩu.',
              validate: (value) =>
                value === getValues('password') || 'Hai mật khẩu chưa trùng nhau.',
            })}
          />
          <Button className="auth-submit" disabled={!token} isLoading={isSubmitting} type="submit">
            Cập nhật mật khẩu
          </Button>
        </form>
      ) : null}
      <p className="auth-switch">
        <Link to="/dang-nhap">Đi tới đăng nhập</Link>
      </p>
    </>
  );
}
