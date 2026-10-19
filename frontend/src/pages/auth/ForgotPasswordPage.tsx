import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { errorMessage } from '@/lib/errors';
import { apiPost } from '@/lib/api/client';
import { useI18n } from '@/features/i18n/I18nContext';

interface RecoveryForm {
  code: string;
  confirmPassword: string;
  password: string;
  email: string;
}

interface OtpChallenge {
  challenge_id: string;
  development_code: string | null;
  expires_in: number;
  message: string;
}

interface ResetTokenResponse {
  reset_token: string;
  expires_in: number;
  message: string;
}

type RecoveryStep = 'email' | 'code' | 'password' | 'complete';

export function ForgotPasswordPage() {
  const [step, setStep] = useState<RecoveryStep>('email');
  const { t } = useI18n();
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
  } = useForm<RecoveryForm>();

  const requestCode = handleSubmit(async (values) => {
    setError('');
    setMessage('');
    setIsSubmitting(true);
    try {
      const response = await apiPost<OtpChallenge>('/auth/forgot-password', {
        email: values.email,
      });
      setChallenge(response);
      setRecoveryEmail(values.email.trim().toLowerCase());
      setMessage(t(response.message));
      setStep('code');
    } catch (requestError) {
      setError(errorMessage(requestError, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  const verifyCode = handleSubmit(async (values) => {
    if (!challenge) return;
    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiPost<ResetTokenResponse>('/auth/forgot-password/verify-code', {
        challenge_id: challenge.challenge_id,
        code: values.code,
      });
      setResetToken(response.reset_token);
      setMessage(t(response.message));
      setStep('password');
    } catch (requestError) {
      setError(errorMessage(requestError, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  const resetPassword = handleSubmit(async (values) => {
    if (!resetToken) return;
    setError('');
    setIsSubmitting(true);
    try {
      const response = await apiPost<{ message: string }>('/auth/reset-password', {
        token: resetToken,
        new_password: values.password,
      });
      setMessage(t(response.message));
      setResetToken('');
      setStep('complete');
    } catch (requestError) {
      setError(errorMessage(requestError, t));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">{t('Khôi phục tài khoản')}</span>
        <h2>{t('Quên mật khẩu?')}</h2>
        <p>
          {t(
            step === 'email'
              ? 'Nhập email đã đăng ký để nhận mã OTP khôi phục.'
              : step === 'code'
                ? 'Nhập mã OTP vừa được gửi đến email của bạn.'
                : step === 'password'
                  ? 'Tạo mật khẩu mới để tiếp tục bảo vệ tài khoản.'
                  : 'Mật khẩu mới đã được lưu. Bạn có thể đăng nhập lại bằng email đã đăng ký.',
          )}
        </p>
      </div>
      {error ? <AuthAlert tone="danger">{error}</AuthAlert> : null}
      {message ? <AuthAlert tone="success">{message}</AuthAlert> : null}
      {step === 'code' && challenge?.development_code ? (
        <AuthAlert tone="info">
          {t('Mã OTP dùng thử trên môi trường phát triển:')}{' '}
          <strong>{challenge.development_code}</strong>
        </AuthAlert>
      ) : null}
      {step === 'code' && recoveryEmail ? (
        <AuthAlert tone="info">
          {t('Mã OTP được gửi tới:')} <strong>{recoveryEmail}</strong>
        </AuthAlert>
      ) : null}

      {step === 'email' ? (
        <form className="auth-form" onSubmit={(event) => void requestCode(event)} noValidate>
          <AuthField
            autoComplete="email"
            error={errors.email?.message}
            hint={t(
              'Nhập đúng email đã đăng ký và dùng để đăng nhập. Mã khôi phục chỉ được gửi đến email khớp với tài khoản.',
            )}
            id="forgot-email"
            label={t('Email đăng ký / đăng nhập')}
            placeholder="ban@example.com"
            type="email"
            {...register('email', {
              required: t('Vui lòng nhập email.'),
              pattern: { value: /^\S+@\S+\.\S+$/, message: t('Email chưa đúng định dạng.') },
            })}
          />
          <Button className="auth-submit" isLoading={isSubmitting} type="submit">
            {t('Gửi mã OTP qua email')}
          </Button>
        </form>
      ) : null}

      {step === 'code' ? (
        <form className="auth-form" onSubmit={(event) => void verifyCode(event)} noValidate>
          <AuthField
            autoComplete="one-time-code"
            error={errors.code?.message}
            hint={t('Mã gồm 5 chữ số, có hiệu lực trong {minutes} phút.', {
              minutes: Math.ceil((challenge?.expires_in ?? 300) / 60),
            })}
            id="forgot-otp"
            inputMode="numeric"
            label={t('Mã xác thực email')}
            maxLength={5}
            placeholder="•••••"
            {...register('code', {
              required: t('Vui lòng nhập mã xác thực.'),
              pattern: { value: /^\d{5}$/, message: t('Mã xác thực gồm đúng 5 chữ số.') },
            })}
          />
          <Button className="auth-submit" isLoading={isSubmitting} type="submit">
            {t('Xác minh email')}
          </Button>
          <button className="auth-text-button" onClick={() => setStep('email')} type="button">
            {t('Dùng email khác')}
          </button>
        </form>
      ) : null}

      {step === 'password' ? (
        <form className="auth-form" onSubmit={(event) => void resetPassword(event)} noValidate>
          <AuthField
            autoComplete="new-password"
            error={errors.password?.message}
            hint={t('Tối thiểu 8 ký tự, gồm chữ cái và chữ số.')}
            id="forgot-new-password"
            label={t('Mật khẩu mới')}
            placeholder={t('Tạo mật khẩu mới')}
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
            id="forgot-confirm-password"
            label={t('Nhập lại mật khẩu')}
            placeholder={t('Nhập lại mật khẩu mới')}
            type="password"
            {...register('confirmPassword', {
              required: t('Vui lòng nhập lại mật khẩu mới.'),
              validate: (value) =>
                value === getValues('password') || t('Hai mật khẩu chưa trùng nhau.'),
            })}
          />
          <Button className="auth-submit" isLoading={isSubmitting} type="submit">
            {t('Cập nhật mật khẩu')}
          </Button>
        </form>
      ) : null}

      {step === 'complete' && recoveryEmail ? (
        <AuthAlert tone="info">
          {t('Email đăng nhập của tài khoản vẫn là:')} <strong>{recoveryEmail}</strong>
        </AuthAlert>
      ) : null}

      <p className="auth-switch">
        <Link state={recoveryEmail ? { email: recoveryEmail } : undefined} to="/login">
          {step === 'complete' ? t('Đăng nhập bằng email này') : `← ${t('Quay lại đăng nhập')}`}
        </Link>
      </p>
    </>
  );
}
