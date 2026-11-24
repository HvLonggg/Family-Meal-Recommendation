import { useEffect, useId, useRef, useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: 'danger' | 'primary';
  /** Khi có, hộp thoại hiện ô ghi chú và trả về nội dung đã nhập. */
  note?: { label: string; placeholder?: string; defaultValue?: string };
}

interface ConfirmDialogProps extends ConfirmOptions {
  open: boolean;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}

const FOCUSABLE =
  'button:not([disabled]), textarea, input, [href], [tabindex]:not([tabindex="-1"])';

/**
 * Hộp thoại xác nhận trong app thay cho window.confirm/prompt.
 * Focus mặc định vào nút an toàn (Hủy), Esc để hủy, Tab giữ trong hộp thoại.
 */
export function ConfirmDialog({
  cancelLabel,
  confirmLabel,
  description,
  note,
  onCancel,
  onConfirm,
  open,
  title,
  tone = 'primary',
}: ConfirmDialogProps) {
  const { t } = useI18n();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [noteValue, setNoteValue] = useState(note?.defaultValue ?? '');

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    cancelRef.current?.focus();
    return () => previous?.focus?.();
  }, [open]);

  if (!open) return null;
  const danger = tone === 'danger';
  const titleId = `${id}-title`;
  const textId = `${id}-text`;

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        aria-describedby={description ? textId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="modal modal--confirm"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onCancel();
            return;
          }
          if (event.key !== 'Tab' || !dialogRef.current) return;
          const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
          const first = items[0];
          const last = items.at(-1);
          if (!first || !last) return;
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
          }
        }}
        ref={dialogRef}
        role="alertdialog"
      >
        <div className="confirm-dialog">
          <span className={`confirm-dialog__icon${danger ? ' is-danger' : ''}`}>
            <AppIcon name={danger ? 'trash' : 'shield'} size={22} />
          </span>
          <div className="confirm-dialog__content">
            <h2 id={titleId}>{title}</h2>
            {description ? <p id={textId}>{description}</p> : null}
            {note ? (
              <label className="ws-field confirm-dialog__note">
                <span>{note.label}</span>
                <textarea
                  maxLength={1000}
                  onChange={(event) => setNoteValue(event.target.value)}
                  placeholder={note.placeholder}
                  rows={3}
                  value={noteValue}
                />
              </label>
            ) : null}
          </div>
        </div>
        <footer className="modal__foot">
          <button
            className="button button--secondary"
            onClick={onCancel}
            ref={cancelRef}
            type="button"
          >
            <span>{cancelLabel ?? t('Hủy')}</span>
          </button>
          <button
            className={`button button--primary${danger ? ' button--danger' : ''}`}
            onClick={() => onConfirm(noteValue.trim())}
            type="button"
          >
            <span>{confirmLabel}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
