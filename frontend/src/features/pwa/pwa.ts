/** Tiện ích PWA: đăng ký service worker, phát hiện bản mới, lời mời cài ứng dụng. */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export const INSTALL_DISMISS_KEY = 'bep-viet:install-dismissed-at';
/** Sau khi người dùng bấm "Để sau", im lặng 30 ngày. */
export const INSTALL_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000;

export function isStandalone(win: Window = window) {
  const nav = win.navigator as Navigator & { standalone?: boolean };
  return Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone);
}

/** iOS/iPadOS Safari không có beforeinstallprompt: phải hướng dẫn "Thêm vào MH chính". */
export function isIosSafari(userAgent: string, maxTouchPoints = 0) {
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  const otherBrowser = /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent);
  return ios && !otherBrowser && /Safari/.test(userAgent);
}

export function installDismissedRecently(now = Date.now()) {
  try {
    const raw = localStorage.getItem(INSTALL_DISMISS_KEY);
    if (!raw) return false;
    const at = Number(raw);
    return Number.isFinite(at) && now - at < INSTALL_SNOOZE_MS;
  } catch {
    return false;
  }
}

export function rememberInstallDismissed(now = Date.now()) {
  try {
    localStorage.setItem(INSTALL_DISMISS_KEY, String(now));
  } catch {
    // Trình duyệt chặn lưu trữ: chỉ ẩn trong phiên này.
  }
}

/**
 * Đăng ký /sw.js và gọi `onUpdate` khi có bản mới đang chờ kích hoạt.
 * Chỉ báo "bản mới" khi trang đã được một SW cũ điều khiển (lần cài đầu thì im lặng).
 */
export async function registerAppWorker(onUpdate: (worker: ServiceWorker) => void) {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });
    const notify = (worker: ServiceWorker | null) => {
      if (worker && navigator.serviceWorker.controller) onUpdate(worker);
    };
    notify(registration.waiting);
    registration.addEventListener('updatefound', () => {
      const installing = registration.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') notify(installing);
      });
    });
    return registration;
  } catch {
    return null;
  }
}

/** Kích hoạt SW mới rồi tải lại trang một lần khi nó nắm quyền điều khiển. */
export function activateUpdate(worker: ServiceWorker) {
  return new Promise<void>((resolve, reject) => {
    const cleanup = () => {
      window.clearTimeout(timer);
      navigator.serviceWorker.removeEventListener('controllerchange', changed);
    };
    const changed = () => {
      cleanup();
      resolve();
    };
    const timer = window.setTimeout(() => {
      cleanup();
      reject(new Error('Update activation timed out'));
    }, 15000);
    navigator.serviceWorker.addEventListener('controllerchange', changed);
    try {
      worker.postMessage({ type: 'SKIP_WAITING' });
    } catch (error) {
      cleanup();
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
