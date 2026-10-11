import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { errorMessage } from '@/lib/errors';
import { apiPost } from '@/lib/api/client';
import { useI18n } from '@/features/i18n/I18nContext';

interface RegisterForm {
  confirmPassword: string;
  email: string;
  fullName: string;
  password: string;
  terms: boolean;
}

export function RegisterPage() {
  const navigate = useNavigate();
  const { t } = useI18n();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const registrationForm = useForm<RegisterForm>();

  const submit = registrationForm.handleSubmit(async (values) => {
    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await apiPost<{ message: string }>('/auth/register', {
        full_name: values.fullName,
        email: values.email,
        password: values.password,
      });
      await navigate('/login', {
        replace: true,
        state: { notice: t(response.message), email: values.email.trim() },
      });
    } catch (error) {
      setMessage(errorMessage(error, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="auth-page auth-page--register">
      <div className="auth-card__heading">
        <span className="auth-kicker">{t('Bắt đầu miễn phí')}</span>
        <h2>{t('Tạo tài khoản của bạn')}</h2>
        <p>
          {t(
            'Điền thông tin để tạo tài khoản. Sau đó bạn có thể đăng nhập và nhận email chào mừng từ Bếp Việt.',
          )}
        </p>
      </div>
      {message ? <AuthAlert tone="danger">{message}</AuthAlert> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField
          autoComplete="name"
          error={registrationForm.formState.errors.fullName?.message}
          id="register-name"
          label={t('Họ và tên')}
          placeholder="Nguyễn Ngọc Lan"
          {...registrationForm.register('fullName', {
            required: t('Vui lòng nhập họ tên.'),
            minLength: { value: 2, message: t('Họ tên cần ít nhất 2 ký tự.') },
          })}
        />
        <AuthField
          autoComplete="email"
          error={registrationForm.formState.errors.email?.message}
          id="register-email"
          label={t('Địa chỉ email')}
          placeholder="ban@example.com"
          type="email"
          {...registrationForm.register('email', {
            required: t('Vui lòng nhập email.'),
            pattern: { value: /^\S+@\S+\.\S+$/, message: t('Email chưa đúng định dạng.') },
          })}
        />
        <AuthField
          autoComplete="new-password"
          error={registrationForm.formState.errors.password?.message}
          hint={t('Tối thiểu 8 ký tự, gồm chữ cái và chữ số.')}
          id="register-password"
          label={t('Mật khẩu')}
          placeholder={t('Tạo mật khẩu an toàn')}
          type="password"
          {...registrationForm.register('password', {
            required: t('Vui lòng tạo mật khẩu.'),
            minLength: { value: 8, message: t('Mật khẩu cần ít nhất 8 ký tự.') },
            validate: (value) =>
              (/[A-Za-zÀ-ỹ]/.test(value) && /\d/.test(value)) ||
              t('Mật khẩu cần có chữ cái và chữ số.'),
          })}
        />
        <AuthField
          autoComplete="new-password"
          error={registrationForm.formState.errors.confirmPassword?.message}
          id="register-confirm-password"
          label={t('Nhập lại mật khẩu')}
          placeholder={t('Nhập lại mật khẩu')}
          type="password"
          {...registrationForm.register('confirmPassword', {
            required: t('Vui lòng nhập lại mật khẩu.'),
            validate: (value) =>
              value === registrationForm.getValues('password') ||
              t('Hai mật khẩu chưa trùng nhau.'),
          })}
        />
        <label className="auth-checkbox auth-checkbox--terms">
          <input
            type="checkbox"
            {...registrationForm.register('terms', {
              required: t('Bạn cần đồng ý điều khoản để tiếp tục.'),
            })}
          />
          <span>
            {t('Tôi đồng ý với')} <a href="#dieu-khoan">{t('Điều khoản')}</a> {t('và')}{' '}
            <a href="#bao-mat">{t('Chính sách bảo mật')}</a>.
          </span>
        </label>
        {registrationForm.formState.errors.terms ? (
          <p className="auth-field__error">{registrationForm.formState.errors.terms.message}</p>
        ) : null}
        <Button className="auth-submit" isLoading={isSubmitting} type="submit">
          {t('Tạo tài khoản')}
        </Button>
      </form>
      <p className="auth-switch">
        {t('Đã có tài khoản?')} <Link to="/login">{t('Đăng nhập')}</Link>
      </p>
    </div>
  );
}
