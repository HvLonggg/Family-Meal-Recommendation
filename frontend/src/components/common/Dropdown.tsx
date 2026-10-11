import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router';

interface DropdownProps {
  align?: 'start' | 'end';
  className?: string;
  label: string;
  trigger: ReactNode;
  triggerClassName?: string;
  children: (close: () => void) => ReactNode;
}

/** Menu thả xuống: đóng khi bấm ra ngoài, nhấn Esc hoặc chuyển trang. */
export function Dropdown({
  align = 'start',
  children,
  className = '',
  label,
  trigger,
  triggerClassName = '',
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const location = useLocation();
  const [openedAt, setOpenedAt] = useState(location.key);

  if (open && openedAt !== location.key) {
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const handlePointer = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('pointerdown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [open]);

  return (
    <div className={`dropdown ${open ? 'is-open' : ''} ${className}`.trim()} ref={rootRef}>
      <button
        aria-controls={panelId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={label}
        className={triggerClassName}
        onClick={() => {
          setOpenedAt(location.key);
          setOpen((value) => !value);
        }}
        ref={triggerRef}
        type="button"
      >
        {trigger}
      </button>
      {open ? (
        <div className={`dropdown__panel dropdown__panel--${align}`} id={panelId}>
          {children(() => setOpen(false))}
        </div>
      ) : null}
    </div>
  );
}
