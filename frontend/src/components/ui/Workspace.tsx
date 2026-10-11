import type { PropsWithChildren, ReactNode } from 'react';

import { AppIcon, type IconName } from '@/components/common/AppIcon';

interface PanelProps extends PropsWithChildren {
  title: string;
  description?: string;
  icon?: IconName;
  actions?: ReactNode;
  className?: string;
  id?: string;
}

export function Panel({
  actions,
  children,
  className = '',
  description,
  icon,
  id,
  title,
}: PanelProps) {
  const headingId = id ? `${id}-title` : undefined;
  return (
    <section aria-labelledby={headingId} className={`ws-panel ${className}`.trim()} id={id}>
      <header className="ws-panel__head">
        {icon ? (
          <span className="ws-panel__icon">
            <AppIcon name={icon} size={20} />
          </span>
        ) : null}
        <div>
          <h2 id={headingId}>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {actions ? <div className="ws-panel__actions">{actions}</div> : null}
      </header>
      <div className="ws-panel__body">{children}</div>
    </section>
  );
}

interface ToggleProps {
  checked: boolean;
  label: string;
  description?: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

export function Toggle({ checked, description, disabled, label, onChange }: ToggleProps) {
  return (
    <label className={`ws-toggle${disabled ? ' is-disabled' : ''}`}>
      <span>
        <strong>{label}</strong>
        {description ? <small>{description}</small> : null}
      </span>
      <input
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        role="switch"
        type="checkbox"
      />
      <span aria-hidden="true" className="ws-toggle__track">
        <span />
      </span>
    </label>
  );
}

export type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

export function StatusBadge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={`ws-badge ws-badge--${tone}`}>{children}</span>;
}

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ action, description, icon, title }: EmptyStateProps) {
  return (
    <div className="ws-empty">
      <span>
        <AppIcon name={icon} size={26} />
      </span>
      <strong>{title}</strong>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function Notice({
  children,
  tone = 'info',
}: PropsWithChildren<{ tone?: 'info' | 'success' | 'danger' | 'warning' }>) {
  return (
    <p className={`ws-notice ws-notice--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <AppIcon
        name={tone === 'success' ? 'check' : tone === 'danger' ? 'close' : 'sparkles'}
        size={16}
      />
      <span>{children}</span>
    </p>
  );
}

export function LoadingBlock({ label }: { label: string }) {
  return (
    <div className="route-loading ws-loading" role="status">
      <span aria-hidden="true" className="button__spinner" /> {label}
    </div>
  );
}

interface PaginationProps {
  total: number;
  limit: number;
  offset: number;
  onChange: (offset: number) => void;
  labels: { previous: string; next: string; summary: string };
}

export function Pagination({ labels, limit, offset, onChange, total }: PaginationProps) {
  if (total <= limit) return null;
  return (
    <nav aria-label={labels.summary} className="ws-pagination">
      <span>{labels.summary}</span>
      <div>
        <button
          className="button button--outline"
          disabled={offset === 0}
          onClick={() => onChange(Math.max(0, offset - limit))}
          type="button"
        >
          ‹ {labels.previous}
        </button>
        <button
          className="button button--outline"
          disabled={offset + limit >= total}
          onClick={() => onChange(offset + limit)}
          type="button"
        >
          {labels.next} ›
        </button>
      </div>
    </nav>
  );
}
