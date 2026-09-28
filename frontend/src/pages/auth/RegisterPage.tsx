import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router';

import { AuthAlert } from '@/components/auth/AuthAlert';
import { AuthField } from '@/components/auth/AuthField';
import { SocialLoginButtons } from '@/components/auth/SocialLoginButtons';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/features/auth/AuthContext';
import { getAuthErrorMessage } from '@/features/auth/errors';

interface RegisterForm {
  confirmPassword: string;
  email: string;
  fullName: string;
  password: string;
  terms: boolean;
}

export function RegisterPage() {
  const { register: createAccount } = useAuth();
  const navigate = useNavigate();
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    formState: { errors },
    getValues,
    handleSubmit,
    register,
  } = useForm<RegisterForm>();

  const submit = handleSubmit(async (values) => {
    setMessage('');
    setIsSubmitting(true);
    try {
      await createAccount({
        full_name: values.fullName,
        email: values.email,
        password: values.password,
      });
      await navigate('/tai-khoan', { replace: true });
    } catch (error) {
      setMessage(getAuthErrorMessage(error));
    } finally {
      setIsSubmitting(false);
    }
  });

  return (
    <div className="auth-page auth-page--register">
      <div className="auth-card__heading">
        <span className="auth-kicker">Bắt đầu miễn phí</span>
        <h2>Tạo tài khoản của bạn</h2>
        <p>Một tài khoản, mọi kế hoạch bữa ăn và món yêu thích.</p>
      </div>
      {message ? <AuthAlert tone="info">{message}</AuthAlert> : null}

      <form className="auth-form" onSubmit={(event) => void submit(event)} noValidate>
        <AuthField
          autoComplete="name"
          error={errors.fullName?.message}
          id="register-name"
          label="Họ và tên"
          placeholder="Nguyễn Ngọc Lan"
          {...register('fullName', {
            required: 'Vui lòng nhập họ tên.',
            minLength: { value: 2, message: 'Họ tên cần ít nhất 2 ký tự.' },
          })}
        />
        <AuthField
          autoComplete="email"
          error={errors.email?.message}
          id="register-email"
          label="Địa chỉ email"
          placeholder="ban@example.com"
          type="email"
          {...register('email', {
            required: 'Vui lòng nhập email.',
            pattern: { value: /^\S+@\S+\.\S+$/, message: 'Email chưa đúng định dạng.' },
          })}
        />
        <AuthField
          autoComplete="new-password"
          error={errors.password?.message}
          hint="Tối thiểu 8 ký tự, gồm chữ cái và chữ số."
          id="register-password"
          label="Mật khẩu"
          placeholder="Tạo mật khẩu an toàn"
          type="password"
          {...register('password', {
            required: 'Vui lòng tạo mật khẩu.',
            minLength: { value: 8, message: 'Mật khẩu cần ít nhất 8 ký tự.' },
            validate: (value) =>
              (/[A-Za-zÀ-ỹ]/.test(value) && /\d/.test(value)) ||
              'Mật khẩu cần có chữ cái và chữ số.',
          })}
        />
        <AuthField
          autoComplete="new-password"
          error={errors.confirmPassword?.message}
          id="register-confirm-password"
          label="Nhập lại mật khẩu"
          placeholder="Nhập lại mật khẩu"
          type="password"
          {...register('confirmPassword', {
            required: 'Vui lòng nhập lại mật khẩu.',
            validate: (value) => value === getValues('password') || 'Hai mật khẩu chưa trùng nhau.',
          })}
        />
        <label className="auth-checkbox auth-checkbox--terms">
          <input
            type="checkbox"
            {...register('terms', { required: 'Bạn cần đồng ý điều khoản để tiếp tục.' })}
          />
          <span>
            Tôi đồng ý với <a href="#dieu-khoan">Điều khoản</a> và{' '}
            <a href="#bao-mat">Chính sách bảo mật</a>.
          </span>
        </label>
        {errors.terms ? <p className="auth-field__error">{errors.terms.message}</p> : null}
        <Button className="auth-submit" isLoading={isSubmitting} type="submit">
          Tạo tài khoản
        </Button>
      </form>
      <SocialLoginButtons onNotice={setMessage} />
      <p className="auth-switch">
        Đã có tài khoản? <Link to="/dang-nhap">Đăng nhập</Link>
      </p>
    </div>
  );
}
