import type { PropsWithChildren } from 'react';

interface AuthAlertProps extends PropsWithChildren {
  tone?: 'danger' | 'info' | 'success';
}

export function AuthAlert({ children, tone = 'info' }: AuthAlertProps) {
  return (
    <div className={`auth-alert auth-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <span aria-hidden="true">{tone === 'success' ? '✓' : tone === 'danger' ? '!' : 'i'}</span>
      <div>{children}</div>
    </div>
  );
}
