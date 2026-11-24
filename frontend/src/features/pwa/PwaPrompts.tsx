import { useCallback, useEffect, useRef, useState } from 'react';

import { useI18n } from '@/features/i18n/I18nContext';
import {
  type BeforeInstallPromptEvent,
  activateUpdate,
  installDismissedRecently,
  isIosSafari,
  isStandalone,
  registerAppWorker,
  rememberInstallDismissed,
} from '@/features/pwa/pwa';
import '@/styles/mobile.css';
import { beginUpdate, cancelUpdate, finishUpdate } from './updateState';

// Chuỗi riêng của khối PWA (không đụng từ điển chung đang được nhóm khác sửa).
const TEXT = {
  vi: {
    updateTitle: 'Đã có phiên bản mới',
    update:
      'Cập nhật để dùng cải tiến và bản sửa lỗi mới nhất. Chỉ mất vài giây, dữ liệu của bạn vẫn được giữ.',
    updateCooking: 'Bạn có thể cập nhật sau khi nấu xong để không bị gián đoạn.',
    updateCta: 'Cập nhật ngay',
    updating: 'Đang cập nhật…',
    updatingHint: 'Vui lòng không tắt ứng dụng. Bếp Việt sẽ tự mở lại khi xong.',
    stages: ['Đang kiểm tra bản mới', 'Đang tải bản mới', 'Đang cài đặt', 'Hoàn tất, đang mở lại'],
    installTitle: 'Cài Bếp Việt lên điện thoại',
    installBody: 'Mở nhanh từ màn hình chính, dùng như ứng dụng.',
    installCta: 'Cài ứng dụng',
    iosBody: 'Trong Safari, chạm nút Chia sẻ rồi chọn "Thêm vào MH chính".',
    later: 'Để sau',
    close: 'Đóng',
  },
  en: {
    updateTitle: 'A new version is available',
    update:
      'Update to get the latest improvements and fixes. It takes a few seconds and your data is kept.',
    updateCooking: 'You can update after you finish cooking so nothing is interrupted.',
    updateCta: 'Update now',
    updating: 'Updating…',
    updatingHint: 'Please keep the app open. Bep Viet reopens automatically when done.',
    stages: [
      'Checking the new version',
      'Downloading the new version',
      'Installing',
      'Done, reopening',
    ],
    installTitle: 'Install Bep Viet on your phone',
    installBody: 'Open it from your home screen like an app.',
    installCta: 'Install app',
    iosBody: 'In Safari, tap Share, then "Add to Home Screen".',
    later: 'Later',
    close: 'Close',
  },
} as const;

type InstallMode = 'none' | 'android' | 'ios';
type PendingUpdate = { worker: ServiceWorker | null };

const VERSION_CHECK_MS = 15 * 60_000;
const UPDATE_SNOOZE_MS = 60 * 60_000;
const UPDATE_SNOOZE_KEY = 'bep-viet.update-snoozed-until';

function updateSnoozed() {
  try {
    return Number(sessionStorage.getItem(UPDATE_SNOOZE_KEY) ?? 0) > Date.now();
  } catch {
    return false;
  }
}

/** Hỏi máy chủ mã build mới nhất; true nếu khác bản đang chạy. */
async function newerBuildAvailable() {
  try {
    const response = await fetch('/version.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) return false;
    const { build } = (await response.json()) as { build?: string };
    return Boolean(build) && build !== __APP_BUILD__;
  } catch {
    return false;
  }
}

export function PwaPrompts() {
  const { language } = useI18n();
  const text = TEXT[language === 'en' ? 'en' : 'vi'];
  const [pending, setPending] = useState<PendingUpdate | null>(null);
  const [hidden, setHidden] = useState(updateSnoozed);
  const [updating, setUpdating] = useState(false);
  const [progress, setProgress] = useState(10);
  const [result, setResult] = useState<'success' | 'failed' | null>(null);
  const checkedResult = useRef(false);
  useEffect(() => {
    if (checkedResult.current) return;
    checkedResult.current = true;
    setResult(finishUpdate(__APP_BUILD__));
  }, []);
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null);
  const onWorkerUpdate = useCallback((worker: ServiceWorker) => {
    void newerBuildAvailable().then((available) => {
      if (available) setPending({ worker });
    });
  }, []);
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installMode, setInstallMode] = useState<InstallMode>('none');

  useEffect(() => {
    // Dev server không dùng SW để tránh cache nhầm mã đang sửa.
    if (!import.meta.env.PROD) return undefined;
    void registerAppWorker(onWorkerUpdate).then((registration) => {
      registrationRef.current = registration;
    });
    // Tab mở lâu vẫn biết có bản mới: kiểm tra định kỳ và mỗi khi người dùng quay lại tab.
    const check = async () => {
      if (document.hidden || !(await newerBuildAvailable())) return;
      await registrationRef.current?.update().catch(() => undefined);
      const waiting = registrationRef.current?.waiting ?? null;
      setPending((current) => current ?? { worker: waiting });
    };
    const timer = window.setInterval(() => void check(), VERSION_CHECK_MS);
    const onVisible = () => {
      if (!document.hidden) void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [onWorkerUpdate]);

  // "Để sau" chỉ hoãn một giờ rồi nhắc lại, không bỏ qua bản sửa lỗi mãi mãi.
  useEffect(() => {
    if (!hidden) return undefined;
    const timer = window.setTimeout(() => setHidden(false), UPDATE_SNOOZE_MS);
    return () => window.clearTimeout(timer);
  }, [hidden]);

  const snoozeUpdate = () => {
    try {
      sessionStorage.setItem(UPDATE_SNOOZE_KEY, String(Date.now() + UPDATE_SNOOZE_MS));
    } catch {
      // Bộ nhớ phiên có thể bị chặn; vẫn ẩn trong lần mở này.
    }
    setHidden(true);
  };

  const applyUpdate = async () => {
    if (updating) return;
    setUpdating(true);
    setResult(null);
    setProgress(10);
    try {
      if (!(await newerBuildAvailable())) throw new Error('Build unavailable');
      beginUpdate(__APP_BUILD__);
      setProgress(35);
      const worker = registrationRef.current?.waiting ?? pending?.worker;
      if (worker && worker.state !== 'activated') await activateUpdate(worker);
      setProgress(65);
      await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
      setProgress(100);
      // Cho thanh tiến trình kịp chạy tới 100% rồi mới tải lại bản mới.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 600));
      window.location.reload();
    } catch {
      cancelUpdate();
      setUpdating(false);
      setResult('failed');
    }
  };

  useEffect(() => {
    if (isStandalone() || installDismissedRecently()) return undefined;
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setDeferred(event as BeforeInstallPromptEvent);
      setInstallMode('android');
    };
    const onInstalled = () => setInstallMode('none');
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    let iosTimer: number | undefined;
    if (isIosSafari(navigator.userAgent, navigator.maxTouchPoints)) {
      // Đợi người dùng xem trang một lúc rồi mới gợi ý.
      iosTimer = window.setTimeout(() => setInstallMode('ios'), 20_000);
    }
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
      window.clearTimeout(iosTimer);
    };
  }, []);

  const dismissInstall = () => {
    rememberInstallDismissed();
    setInstallMode('none');
  };

  const install = async () => {
    if (!deferred) return;
    await deferred.prompt();
    const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
    if (choice.outcome === 'dismissed') rememberInstallDismissed();
    setDeferred(null);
    setInstallMode('none');
  };

  if (updating) {
    const stage = progress >= 100 ? 3 : progress >= 65 ? 2 : progress >= 35 ? 1 : 0;
    return (
      <div className="pwa-dialog-backdrop">
        <div
          aria-labelledby="pwa-update-title"
          aria-modal="true"
          className="pwa-dialog"
          role="dialog"
        >
          <img alt="" className="pwa-dialog__logo" src="/images/brand/bep-viet-logo.png" />
          <h2 id="pwa-update-title">{text.updating}</h2>
          <div
            aria-label={text.updating}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="pwa-progress"
            role="progressbar"
          >
            <span className="pwa-progress__fill" style={{ width: `${progress}%` }} />
          </div>
          <p className="pwa-progress__label" aria-live="polite">
            <span>{text.stages[stage]}</span>
            <strong>{progress}%</strong>
          </p>
          <p className="pwa-dialog__hint">{text.updatingHint}</p>
        </div>
      </div>
    );
  }

  if (result)
    return (
      <aside className="pwa-toast" role="status">
        <div className="pwa-toast__body">
          <p className="pwa-toast__title">
            {result === 'success'
              ? language === 'en'
                ? 'App updated successfully'
                : 'Ứng dụng đã cập nhật'
              : language === 'en'
                ? 'Update unsuccessful. Please try again.'
                : 'Chưa cập nhật được. Vui lòng thử lại.'}
          </p>
          <button className="pwa-btn" type="button" onClick={() => setResult(null)}>
            {text.close}
          </button>
        </div>
      </aside>
    );

  if (pending && !hidden) {
    const cooking = window.location.pathname.startsWith('/cook');
    return (
      <div className="pwa-dialog-backdrop">
        <div
          aria-describedby="pwa-update-text"
          aria-labelledby="pwa-update-title"
          aria-modal="true"
          className="pwa-dialog"
          role="dialog"
        >
          <img alt="" className="pwa-dialog__logo" src="/images/brand/bep-viet-logo.png" />
          <h2 id="pwa-update-title">{text.updateTitle}</h2>
          <p className="pwa-dialog__text" id="pwa-update-text">
            {cooking ? text.updateCooking : text.update}
          </p>
          <div className="pwa-dialog__actions">
            <button className="pwa-btn pwa-btn--ghost" onClick={snoozeUpdate} type="button">
              {text.later}
            </button>
            <button autoFocus className="pwa-btn" onClick={() => void applyUpdate()} type="button">
              {text.updateCta}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (installMode === 'none') return null;
  return (
    <aside aria-label={text.installTitle} className="pwa-toast pwa-toast--install">
      <img
        alt=""
        className="pwa-toast__icon"
        height={44}
        src="/icons/apple-touch-icon.png"
        width={44}
      />
      <div className="pwa-toast__body">
        <p className="pwa-toast__title">{text.installTitle}</p>
        <p className="pwa-toast__text">{installMode === 'ios' ? text.iosBody : text.installBody}</p>
        <div className="pwa-toast__actions">
          <button className="pwa-btn pwa-btn--ghost" onClick={dismissInstall} type="button">
            {installMode === 'ios' ? text.close : text.later}
          </button>
          {installMode === 'android' && (
            <button className="pwa-btn" onClick={() => void install()} type="button">
              {text.installCta}
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
