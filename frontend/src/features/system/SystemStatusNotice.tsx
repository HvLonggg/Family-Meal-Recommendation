import { useEffect, useState } from 'react';

import { useI18n } from '@/features/i18n/I18nContext';
import {
  busyRemainingMs,
  clearBusy,
  refreshSystemStatus,
  reportOffline,
  useSystemStatus,
} from '@/features/system/systemStatus';
import '@/features/system/system-status.css';

// Chuỗi riêng của khối trạng thái hệ thống (giống khối PWA) để luôn hiển thị được.
const TEXT = {
  vi: {
    eyebrow: 'Bảo trì hệ thống',
    title: 'Bếp Việt đang được nâng cấp',
    message:
      'Chúng mình đang bảo trì để hệ thống chạy nhanh và ổn định hơn. Vui lòng quay lại sau ít phút.',
    endsAt: 'Dự kiến hoạt động lại',
    safe: 'Món đã lưu, kế hoạch và tài khoản của bạn vẫn được giữ nguyên.',
    autoCheck: 'Trang sẽ tự mở lại khi bảo trì xong.',
    retry: 'Kiểm tra lại',
    checking: 'Đang kiểm tra…',
    outage: 'Chưa kết nối được máy chủ. Bếp Việt đang tự thử lại.',
    busy: 'Bếp Việt đang đông khách, hệ thống đang xử lý chậm. Vui lòng thử lại sau ít giây.',
    busyCountdown: 'Tự thử lại sau',
    seconds: 'giây',
    offline: 'Bạn đang ngoại tuyến. Món đã xem vẫn mở được, thay đổi mới cần có mạng.',
  },
  en: {
    eyebrow: 'Scheduled maintenance',
    title: 'Bep Viet is being upgraded',
    message:
      'We are doing maintenance to make the service faster and more reliable. Please check back in a few minutes.',
    endsAt: 'Expected back',
    safe: 'Your saved dishes, plans and account are safe.',
    autoCheck: 'This page reopens automatically when maintenance ends.',
    retry: 'Check again',
    checking: 'Checking…',
    outage: 'Cannot reach the server. Bep Viet is retrying automatically.',
    busy: 'Bep Viet is very busy right now. Please try again in a few seconds.',
    busyCountdown: 'Retrying in',
    seconds: 's',
    offline: 'You are offline. Dishes you have viewed still open; new changes need a connection.',
  },
} as const;

const MAINTENANCE_POLL_MS = 30_000;
const OUTAGE_POLL_MS = 15_000;

function formatEndsAt(value: string, locale: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export function SystemStatusNotice() {
  const { language } = useI18n();
  const text = TEXT[language === 'en' ? 'en' : 'vi'];
  const status = useSystemStatus();
  const [checking, setChecking] = useState(false);
  const [busyLeftMs, setBusyLeftMs] = useState(0);

  // Hỏi trạng thái ngay khi mở app: khách ở trang đăng nhập cũng thấy thông báo bảo trì.
  useEffect(() => {
    void refreshSystemStatus();
    const onOffline = () => reportOffline();
    const onOnline = () => void refreshSystemStatus();
    if (navigator.onLine === false) reportOffline();
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
    };
  }, []);

  // Tự kiểm tra lại; bảo trì xong thì tải lại trang để nhận dữ liệu và phiên bản mới.
  useEffect(() => {
    if (status.kind !== 'maintenance' && status.kind !== 'outage') return undefined;
    const wasMaintenance = status.kind === 'maintenance';
    const timer = window.setInterval(
      () => {
        if (document.hidden) return;
        void refreshSystemStatus().then((recovered) => {
          if (recovered && wasMaintenance) window.location.reload();
        });
      },
      wasMaintenance ? MAINTENANCE_POLL_MS : OUTAGE_POLL_MS,
    );
    return () => window.clearInterval(timer);
  }, [status.kind]);

  // Đếm ngược theo Retry-After; hết giờ thì bỏ dải thông báo để giao diện tải lại dữ liệu.
  useEffect(() => {
    if (status.kind !== 'busy') return undefined;
    const tick = () => {
      const left = busyRemainingMs();
      setBusyLeftMs(left);
      if (left <= 0) clearBusy();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [status.kind, status.retryAt]);

  const checkNow = async () => {
    const wasMaintenance = status.kind === 'maintenance';
    setChecking(true);
    const recovered = await refreshSystemStatus();
    setChecking(false);
    if (recovered && wasMaintenance) window.location.reload();
  };

  if (status.kind === 'maintenance') {
    const endsAt = status.endsAt
      ? formatEndsAt(status.endsAt, language === 'en' ? 'en-GB' : 'vi-VN')
      : null;
    return (
      <div
        aria-labelledby="system-maintenance-title"
        aria-modal="true"
        className="system-maintenance"
        role="alertdialog"
      >
        <div className="system-maintenance__card">
          <img
            alt="Bếp Việt"
            className="system-maintenance__logo"
            height={88}
            src="/images/brand/bep-viet-logo.png"
            width={88}
          />
          <span className="system-maintenance__eyebrow">{text.eyebrow}</span>
          <h1 id="system-maintenance-title">{text.title}</h1>
          <p className="system-maintenance__message">{status.message ?? text.message}</p>
          {endsAt ? (
            <p className="system-maintenance__eta">
              {text.endsAt}: <strong>{endsAt}</strong>
            </p>
          ) : null}
          <p className="system-maintenance__safe">{text.safe}</p>
          <button
            className="system-maintenance__retry"
            disabled={checking}
            onClick={() => void checkNow()}
            type="button"
          >
            {checking ? text.checking : text.retry}
          </button>
          <p className="system-maintenance__hint">{text.autoCheck}</p>
        </div>
      </div>
    );
  }

  if (status.kind === 'busy') {
    const seconds = Math.ceil(busyLeftMs / 1000);
    return (
      <div className="system-banner system-banner--busy" role="status">
        <span aria-hidden="true" className="system-banner__dot" />
        <span>{text.busy}</span>
        {seconds > 0 ? (
          <span className="system-banner__countdown">
            {text.busyCountdown} {seconds} {text.seconds}
          </span>
        ) : null}
      </div>
    );
  }

  if (status.kind === 'outage' || status.kind === 'offline') {
    return (
      <div className={`system-banner system-banner--${status.kind}`} role="status">
        <span aria-hidden="true" className="system-banner__dot" />
        <span>{status.kind === 'offline' ? text.offline : text.outage}</span>
        {status.kind === 'outage' ? (
          <button disabled={checking} onClick={() => void checkNow()} type="button">
            {checking ? text.checking : text.retry}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}
