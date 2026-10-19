import { useState, type FormEvent } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { Notice } from '@/components/ui/Workspace';
import type { AdminUserCreate } from '@/features/admin/adminApi';
import { useI18n } from '@/features/i18n/I18nContext';

interface UserCreatorProps {
  error?: string | null;
  isSaving: boolean;
  onClose: () => void;
  onSave: (payload: AdminUserCreate) => void;
}

/** Mật khẩu tạm 12 ký tự, luôn có chữ hoa, chữ thường và chữ số. */
function generatePassword() {
  const pools = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789'];
  const all = pools.join('');
  const random = (max: number) => (crypto.getRandomValues(new Uint32Array(1))[0] ?? 0) % max;
  const chars = [
    ...pools.map((pool) => pool[random(pool.length)]),
    ...Array.from({ length: 9 }, () => all[random(all.length)]),
  ];
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const swap = random(index + 1);
    [chars[index], chars[swap]] = [chars[swap], chars[index]];
  }
  return chars.join('');
}

export function UserCreator({ error, isSaving, onClose, onSave }: UserCreatorProps) {
  const { t } = useI18n();
  const [form, setForm] = useState<AdminUserCreate>({
    full_name: '',
    email: '',
    password: '',
    role: 'user',
  });
  const [showPassword, setShowPassword] = useState(false);
  const update = <K extends keyof AdminUserCreate>(key: K, value: AdminUserCreate[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const weakPassword =
    form.password.length > 0 && !(/[a-zA-Z]/.test(form.password) && /\d/.test(form.password));

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (weakPassword) return;
    onSave({ ...form, full_name: form.full_name.trim(), email: form.email.trim() });
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        aria-labelledby="user-creator-title"
        aria-modal="true"
        className="modal modal--narrow ws-form"
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        onSubmit={submit}
        role="dialog"
      >
        <header className="modal__head">
          <div>
            <span className="section-label">{t('Tài khoản Bếp Việt')}</span>
            <h2 id="user-creator-title">{t('Thêm người dùng')}</h2>
          </div>
          <button aria-label={t('Đóng')} className="icon-button" onClick={onClose} type="button">
            <AppIcon name="close" size={18} />
          </button>
        </header>
        <div className="modal__body">
          <label className="ws-field">
            <span>{t('Họ và tên')}</span>
            <input
              autoComplete="off"
              autoFocus
              maxLength={120}
              minLength={2}
              onChange={(event) => update('full_name', event.target.value)}
              required
              value={form.full_name}
            />
          </label>
          <label className="ws-field">
            <span>{t('Email đăng nhập')}</span>
            <input
              autoComplete="off"
              maxLength={320}
              onChange={(event) => update('email', event.target.value)}
              required
              type="email"
              value={form.email}
            />
          </label>
          <div className="ws-field">
            <label htmlFor="user-creator-password">{t('Mật khẩu tạm thời')}</label>
            <div className="user-creator__password">
              <input
                autoComplete="new-password"
                id="user-creator-password"
                maxLength={128}
                minLength={8}
                onChange={(event) => update('password', event.target.value)}
                required
                type={showPassword ? 'text' : 'password'}
                value={form.password}
              />
              <button
                aria-label={showPassword ? t('Ẩn mật khẩu') : t('Hiện mật khẩu')}
                className="icon-button"
                onClick={() => setShowPassword((current) => !current)}
                type="button"
              >
                <AppIcon name="eye" size={17} />
              </button>
              <button
                className="button button--secondary"
                onClick={() => {
                  update('password', generatePassword());
                  setShowPassword(true);
                }}
                type="button"
              >
                <AppIcon name="refresh" size={15} /> {t('Tạo ngẫu nhiên')}
              </button>
            </div>
            <small className={weakPassword ? 'is-error' : undefined}>
              {t('Tối thiểu 8 ký tự, gồm chữ cái và chữ số. Gửi mật khẩu này cho người dùng.')}
            </small>
          </div>
          <fieldset className="user-creator__roles">
            <legend>{t('Vai trò')}</legend>
            {(
              [
                ['user', 'Thành viên', 'Dùng kho món, kế hoạch và cộng đồng.'],
                ['admin', 'Quản trị viên', 'Vào thẳng khu quản trị, quản lý toàn hệ thống.'],
              ] as const
            ).map(([role, label, hint]) => (
              <label className={form.role === role ? 'is-active' : ''} key={role}>
                <input
                  checked={form.role === role}
                  name="role"
                  onChange={() => update('role', role)}
                  type="radio"
                  value={role}
                />
                <span>
                  <strong>{t(label)}</strong>
                  <small>{t(hint)}</small>
                </span>
              </label>
            ))}
          </fieldset>
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>
        <footer className="modal__foot">
          <button className="text-button" onClick={onClose} type="button">
            {t('Hủy')}
          </button>
          <Button isLoading={isSaving} type="submit">
            <AppIcon name="plus" size={16} /> {t('Tạo tài khoản')}
          </Button>
        </footer>
      </form>
    </div>
  );
}
