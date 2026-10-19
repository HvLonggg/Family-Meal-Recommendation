import { useEffect, useRef } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { Button } from '@/components/ui/Button';
import { useI18n } from '@/features/i18n/I18nContext';

export interface ConfirmRequest {
  title: string;
  description: string;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
}

interface ConfirmDialogProps {
  request: ConfirmRequest | null;
  isPending?: boolean;
  onClose: () => void;
}

/** Hộp thoại xác nhận có hỗ trợ Esc và trả focus. */
export function ConfirmDialog({ isPending = false, onClose, request }: ConfirmDialogProps) {
  const { t } = useI18n();
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!request) return;
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.querySelector<HTMLButtonElement>('.button')?.focus();
    return () => previous?.focus();
  }, [request]);

  if (!request) return null;
  const danger = request.tone === 'danger';
  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-describedby="confirm-dialog-text"
        aria-labelledby="confirm-dialog-title"
        aria-modal="true"
        className="modal modal--confirm"
        ref={dialogRef}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onClose();
        }}
        role="alertdialog"
      >
        <div className="confirm-dialog">
          <span className={`confirm-dialog__icon${danger ? ' is-danger' : ''}`}>
            <AppIcon name={danger ? 'lock' : 'shield'} size={22} />
          </span>
          <div>
            <h2 id="confirm-dialog-title">{request.title}</h2>
            <p id="confirm-dialog-text">{request.description}</p>
          </div>
        </div>
        <footer className="modal__foot">
          <button className="text-button" onClick={onClose} type="button">
            {t('Hủy')}
          </button>
          <Button
            className={danger ? 'button--danger' : ''}
            isLoading={isPending}
            onClick={request.onConfirm}
          >
            {request.confirmLabel}
          </Button>
        </footer>
      </div>
    </div>
  );
}
