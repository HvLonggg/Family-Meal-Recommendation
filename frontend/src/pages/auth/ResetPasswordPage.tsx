import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { errorMessage } from '@/lib/errors';
import { apiPost } from '@/lib/api/client';
import { useI18n } from '@/features/i18n/I18nContext';

interface ResetForm {
  confirmPassword: string;
  password: string;
}

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const { t } = useI18n();
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
      setMessage(t(response.message));
      setSuccess(true);
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">{t('Bảo vệ tài khoản')}</span>
        <h2>{t('Tạo mật khẩu mới')}</h2>
        <p>{t('Chọn mật khẩu riêng biệt và dễ nhớ với bạn.')}</p>
      </div>
      {!token ? (
        <AuthAlert tone="danger">{t('Liên kết đặt lại mật khẩu đang thiếu token.')}</AuthAlert>
      ) : null}
      {message ? <AuthAlert tone={success ? 'success' : 'danger'}>{message}</AuthAlert> : null}
      {!success ? (
        <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
          <AuthField
            autoComplete="new-password"
            error={errors.password?.message}
            hint={t('Tối thiểu 8 ký tự, gồm chữ cái và chữ số.')}
            id="reset-password"
            label={t('Mật khẩu mới')}
            placeholder={t('Nhập mật khẩu mới')}
            type="password"
            {...register('password', {
              required: t('Vui lòng nhập mật khẩu mới.'),
              minLength: { value: 8, message: t('Mật khẩu cần ít nhất 8 ký tự.') },
              validate: (value) =>
                (/[A-Za-zÀ-ỹ]/.test(value) && /\d/.test(value)) ||
                t('Mật khẩu cần có chữ cái và chữ số.'),
            })}
          />
          <AuthField
            autoComplete="new-password"
            error={errors.confirmPassword?.message}
            id="reset-confirm-password"
            label={t('Nhập lại mật khẩu')}
            placeholder={t('Nhập lại mật khẩu mới')}
            type="password"
            {...register('confirmPassword', {
              required: t('Vui lòng nhập lại mật khẩu.'),
              validate: (value) =>
                value === getValues('password') || t('Hai mật khẩu chưa trùng nhau.'),
            })}
          />
          <Button className="auth-submit" disabled={!token} isLoading={isSubmitting} type="submit">
            {t('Cập nhật mật khẩu')}
          </Button>
        </form>
      ) : null}
      <p className="auth-switch">
        <Link to="/login">{t('Đi tới đăng nhập')}</Link>
      </p>
    </>
  );
}
