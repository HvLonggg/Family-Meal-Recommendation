import { useEffect, useId, useRef, useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { useI18n } from '@/features/i18n/I18nContext';
import {
  detectInstallPlatform,
  type InstallPlatform,
  promptInstall,
  useInstallState,
} from '@/features/pwa/installPrompt';
import './install-app.css';

// Các bước cài theo từng hệ điều hành khi trình duyệt không tự hiện hộp cài được.
const GUIDES: Record<InstallPlatform, { title: string; steps: string[]; note?: string }> = {
  'ios-safari': {
    title: 'Cài trên iPhone / iPad',
    steps: [
      'Chạm nút Chia sẻ (ô vuông có mũi tên lên) ở thanh dưới của Safari.',
      'Kéo xuống và chọn "Thêm vào MH chính".',
      'Chạm "Thêm" ở góc trên bên phải. Biểu tượng Bếp Việt sẽ xuất hiện trên màn hình chính.',
    ],
  },
  'ios-other': {
    title: 'Cài trên iPhone / iPad',
    steps: [
      'Chạm nút Chia sẻ trên thanh địa chỉ của trình duyệt.',
      'Chọn "Thêm vào MH chính", rồi chạm "Thêm".',
    ],
    note: 'Nếu không thấy mục này, hãy mở bepviet-vn.vercel.app bằng Safari rồi làm lại.',
  },
  android: {
    title: 'Cài trên Android',
    steps: [
      'Chạm nút menu ⋮ ở góc trên bên phải của trình duyệt.',
      'Chọn "Cài đặt ứng dụng" hoặc "Thêm vào màn hình chính".',
      'Chạm "Cài đặt". Bếp Việt sẽ có trong danh sách ứng dụng của máy.',
    ],
  },
  desktop: {
    title: 'Cài trên máy tính',
    steps: [
      'Mở bằng Chrome hoặc Edge.',
      'Bấm biểu tượng cài đặt (màn hình có mũi tên xuống) ở cuối thanh địa chỉ.',
      'Chọn "Cài đặt".',
    ],
  },
};

const FOCUSABLE = 'button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

interface InstallAppButtonProps {
  className?: string;
  /** compact: viên nhỏ trên header điện thoại; footer: dưới giờ làm việc ở chân trang. */
  variant?: 'card' | 'compact' | 'footer';
}

/**
 * Nút "Tải ứng dụng": Android/Chrome/Edge mở hộp cài gốc của trình duyệt (cài thật vào máy);
 * iPhone/iPad và trình duyệt không hỗ trợ thì mở hướng dẫn từng bước đúng hệ điều hành.
 * Ẩn khi đang mở trong ứng dụng đã cài.
 */
export function InstallAppButton({ className = '', variant = 'card' }: InstallAppButtonProps) {
  const { t } = useI18n();
  const { deferred, installed } = useInstallState();
  const [guide, setGuide] = useState<InstallPlatform | null>(null);

  if (installed) return null;

  const handleClick = async () => {
    if (deferred) {
      const outcome = await promptInstall();
      if (outcome) return;
    }
    setGuide(detectInstallPlatform(navigator.userAgent, navigator.maxTouchPoints));
  };

  return (
    <>
      <button
        aria-label={variant === 'compact' ? t('Tải ứng dụng Bếp Việt') : undefined}
        className={`install-app-button install-app-button--${variant} ${className}`.trim()}
        onClick={() => void handleClick()}
        type="button"
      >
        <span aria-hidden="true" className="install-app-button__icon">
          <AppIcon name="download" size={18} />
        </span>
        {variant === 'compact' ? (
          <span aria-hidden="true" className="install-app-button__label">
            {t('Tải app')}
          </span>
        ) : (
          <span className="install-app-button__text">
            <strong>{t('Tải ứng dụng Bếp Việt')}</strong>
            <small>{t('Mở nhanh từ màn hình chính, dùng như app')}</small>
          </span>
        )}
      </button>
      {guide ? <InstallGuide onClose={() => setGuide(null)} platform={guide} /> : null}
    </>
  );
}

function InstallGuide({ onClose, platform }: { onClose: () => void; platform: InstallPlatform }) {
  const { t } = useI18n();
  const id = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const guide = GUIDES[platform];

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  return (
    <div
      className="modal-backdrop install-guide-backdrop"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        aria-labelledby={`${id}-title`}
        aria-modal="true"
        className="modal install-guide"
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.stopPropagation();
            onClose();
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
        role="dialog"
      >
        <div className="install-guide__head">
          <img alt="" height={48} src="/icons/apple-touch-icon.png" width={48} />
          <h2 id={`${id}-title`}>{t(guide.title)}</h2>
        </div>
        <ol className="install-guide__steps">
          {guide.steps.map((step) => (
            <li key={step}>{t(step)}</li>
          ))}
        </ol>
        {guide.note ? <p className="install-guide__note">{t(guide.note)}</p> : null}
        <button
          className="button button--primary install-guide__close"
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          {t('Đã hiểu')}
        </button>
      </div>
    </div>
  );
}
