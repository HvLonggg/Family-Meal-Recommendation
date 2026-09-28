import { useState, type InputHTMLAttributes } from 'react';

interface AuthFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: string;
  hint?: string;
  label: string;
}

export function AuthField({ error, hint, id, label, type = 'text', ...props }: AuthFieldProps) {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const describedBy = [error ? `${id}-error` : '', hint ? `${id}-hint` : '']
    .filter(Boolean)
    .join(' ');

  return (
    <div className="auth-field">
      <label htmlFor={id}>{label}</label>
      <div className={`auth-input${error ? ' auth-input--error' : ''}`}>
        <input
          aria-describedby={describedBy || undefined}
          aria-invalid={Boolean(error)}
          id={id}
          type={isPassword && showPassword ? 'text' : type}
          {...props}
        />
        {isPassword ? (
          <button
            aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
            className="auth-input__action"
            onClick={() => setShowPassword((current) => !current)}
            type="button"
          >
            {showPassword ? 'Ẩn' : 'Hiện'}
          </button>
        ) : null}
      </div>
      {error ? (
        <p className="auth-field__error" id={`${id}-error`}>
          {error}
        </p>
      ) : hint ? (
        <p className="auth-field__hint" id={`${id}-hint`}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}
