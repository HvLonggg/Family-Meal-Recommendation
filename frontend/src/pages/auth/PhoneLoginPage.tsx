import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { getAuthErrorMessage } from '@/features/auth/errors';
import type { AuthSession } from '@/features/auth/types';
import { apiPost } from '@/lib/api/client';

interface PhoneForm {
  phone: string;
}

interface OtpForm {
  code: string;
}

interface OtpChallenge {
  challenge_id: string;
  development_code: string | null;
  expires_in: number;
  message: string;
}

export function PhoneLoginPage() {
  const { acceptSession } = useAuth();
  const navigate = useNavigate();
  const [challenge, setChallenge] = useState<OtpChallenge | null>(null);
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const phoneForm = useForm<PhoneForm>();
  const otpForm = useForm<OtpForm>();

  const requestCode = phoneForm.handleSubmit(async (values) => {
    setMessage('');
    setIsSubmitting(true);
    try {
      setChallenge(await apiPost<OtpChallenge>('/auth/phone/request', values));
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  const verifyCode = otpForm.handleSubmit(async (values) => {
    if (!challenge) return;
    setMessage('');
    setIsSubmitting(true);
    try {
      const session = await apiPost<AuthSession>('/auth/phone/verify', {
        challenge_id: challenge.challenge_id,
        code: values.code,
      });
      acceptSession(session);
      await navigate('/tai-khoan', { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <>
      <div className="auth-card__heading">
        <span className="auth-kicker">Nhanh và tiện lợi</span>
        <h2>Đăng nhập bằng số điện thoại</h2>
        <p>Nhận mã gồm 6 chữ số để truy cập tài khoản mà không cần mật khẩu.</p>
      </div>
      {message ? <AuthAlert tone="danger">{message}</AuthAlert> : null}
      {challenge?.development_code ? (
        <AuthAlert tone="info">
          Mã dùng thử trên môi trường phát triển: <strong>{challenge.development_code}</strong>
        </AuthAlert>
      ) : null}

      {!challenge ? (
        <form className="auth-form" onSubmit={(event) => void requestCode(event)} noValidate>
          <AuthField
            autoComplete="tel"
            error={phoneForm.formState.errors.phone?.message}
            hint="Hỗ trợ định dạng 090 123 4567 hoặc +84 901 234 567."
            id="phone-number"
            inputMode="tel"
            label="Số điện thoại"
            placeholder="090 123 4567"
            {...phoneForm.register('phone', {
              required: 'Vui lòng nhập số điện thoại.',
              minLength: { value: 9, message: 'Số điện thoại chưa đủ ký tự.' },
            })}
          />
          <Button className="auth-submit" isLoading={isSubmitting} type="submit">
            Gửi mã xác thực
          </Button>
        </form>
      ) : (
        <form className="auth-form" onSubmit={(event) => void verifyCode(event)} noValidate>
          <AuthField
            autoComplete="one-time-code"
            error={otpForm.formState.errors.code?.message}
            id="phone-otp"
            inputMode="numeric"
            label="Mã xác thực"
            maxLength={6}
            placeholder="••••••"
            {...otpForm.register('code', {
              required: 'Vui lòng nhập mã xác thực.',
              pattern: { value: /^\d{6}$/, message: 'Mã xác thực gồm đúng 6 chữ số.' },
            })}
          />
          <Button className="auth-submit" isLoading={isSubmitting} type="submit">
            Xác nhận và đăng nhập
          </Button>
          <button className="auth-text-button" onClick={() => setChallenge(null)} type="button">
            Dùng số điện thoại khác
          </button>
        </form>
      )}
      <p className="auth-switch">
        <Link to="/dang-nhap">← Đăng nhập bằng email</Link>
      </p>
    </>
  );
}
