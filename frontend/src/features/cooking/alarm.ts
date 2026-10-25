/**
 * Chuông báo khi vào bếp: âm báo tự tạo bằng Web Audio (không cần tệp âm thanh), rung,
 * thông báo hệ thống qua service worker và giữ màn hình sáng (Wake Lock).
 */

let context: AudioContext | null = null;
let ringing: number | null = null;

function audioContext() {
  if (typeof window === 'undefined') return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  context ??= new Ctor();
  return context;
}

/** Gọi trong thao tác bấm của người dùng để trình duyệt cho phép phát chuông về sau. */
export function unlockAudio() {
  const ctx = audioContext();
  if (ctx?.state === 'suspended') void ctx.resume().catch(() => undefined);
}

function chime(ctx: AudioContext) {
  const start = ctx.currentTime + 0.02;
  [880, 1175, 1568].forEach((frequency, index) => {
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'triangle';
    oscillator.frequency.value = frequency;
    const at = start + index * 0.18;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(0.45, at + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start(at);
    oscillator.stop(at + 0.55);
  });
}

export function startRinging() {
  if (ringing !== null) return;
  const ring = () => {
    const ctx = audioContext();
    if (ctx) {
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      chime(ctx);
    }
    navigator.vibrate?.([400, 200, 400]);
  };
  ring();
  ringing = window.setInterval(ring, 2200);
}

export function stopRinging() {
  if (ringing !== null) window.clearInterval(ringing);
  ringing = null;
  navigator.vibrate?.(0);
}

export function isRinging() {
  return ringing !== null;
}

// --- Service worker và thông báo hệ thống ---------------------------------------------------

export function serviceWorkerSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
}

export async function registerCookWorker() {
  if (!serviceWorkerSupported()) return null;
  try {
    return await navigator.serviceWorker.register('/sw.js', { scope: '/' });
  } catch {
    return null;
  }
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

/** Hiện thông báo hệ thống (cùng `tag` với thông báo đẩy nên không bị trùng). */
export async function showTimerNotification(timer: { id: string; label: string; url: string }) {
  if (notificationPermission() !== 'granted') return;
  const options: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body: timer.label,
    tag: `cook-timer-${timer.id}`,
    requireInteraction: true,
    data: { url: timer.url, timer_id: timer.id },
    icon: '/images/brand/icon-192.png',
    badge: '/images/brand/icon-192.png',
  };
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    if (registration) {
      await registration.showNotification('⏰ Hết giờ rồi!', {
        ...options,
        actions: [
          { action: 'done', title: 'Xong rồi' },
          { action: 'snooze', title: 'Thêm 5 phút' },
        ],
      } as NotificationOptions);
      return;
    }
    new Notification('⏰ Hết giờ rồi!', options);
  } catch {
    // Trình duyệt chặn thông báo: chuông trong ứng dụng vẫn kêu.
  }
}

export async function closeTimerNotification(timerId: string) {
  try {
    const registration = await navigator.serviceWorker?.getRegistration('/');
    const list = (await registration?.getNotifications({ tag: `cook-timer-${timerId}` })) ?? [];
    for (const notification of list) notification.close();
  } catch {
    // Không đóng được thì người dùng tự gạt bỏ.
  }
}

function base64UrlToBytes(value: string) {
  const padded = `${value}${'='.repeat((4 - (value.length % 4)) % 4)}`
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

/** Tr?ng th?i: default ch?a h?i; granted quy?n tr?nh duy?t; local chu?ng trong trang; push chu?ng m?y ch?. */
export type PushState = 'unsupported' | 'denied' | 'default' | 'granted' | 'local' | 'push';

/** Xin quyền thông báo và đăng ký Web Push với máy chủ. */
export async function enableTimerNotifications(
  getConfig: () => Promise<{ enabled: boolean; public_key: string | null }>,
  save: (subscription: PushSubscriptionJSON) => Promise<unknown>,
): Promise<PushState> {
  if (notificationPermission() === 'unsupported') return 'unsupported';
  const permission =
    Notification.permission === 'default'
      ? await Notification.requestPermission()
      : Notification.permission;
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'default';
  const registration = await registerCookWorker();
  if (!registration || !('pushManager' in registration)) return 'local';
  try {
    const config = await getConfig();
    if (!config.enabled || !config.public_key) return 'local';
    await navigator.serviceWorker.ready;
    const subscription =
      (await registration.pushManager.getSubscription()) ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(config.public_key),
      }));
    await save(subscription.toJSON());
    return 'push';
  } catch {
    return 'local';
  }
}

// --- Giữ màn hình sáng khi đang nấu ----------------------------------------------------------

type WakeLockSentinelLike = { release: () => Promise<void>; released?: boolean };

export function wakeLockSupported() {
  return typeof navigator !== 'undefined' && 'wakeLock' in navigator;
}

export async function requestWakeLock(): Promise<WakeLockSentinelLike | null> {
  if (!wakeLockSupported()) return null;
  try {
    const lock = (
      navigator as unknown as {
        wakeLock: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
      }
    ).wakeLock;
    return await lock.request('screen');
  } catch {
    return null;
  }
}
