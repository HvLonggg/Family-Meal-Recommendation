/**
 * Kho chung cho lời mời cài ứng dụng (PWA).
 * Chrome/Edge/Samsung Internet phát `beforeinstallprompt` rất sớm, có khi trước khi React dựng xong,
 * nên bắt sự kiện ngay khi module được nạp và giữ lại để nút "Tải ứng dụng" ở bất kỳ đâu dùng chung.
 * `prompt()` chỉ gọi được một lần cho mỗi sự kiện.
 */
import { useSyncExternalStore } from 'react';

import { type BeforeInstallPromptEvent, isStandalone } from '@/features/pwa/pwa';

export type InstallPlatform = 'ios-safari' | 'ios-other' | 'android' | 'desktop';

interface InstallState {
  /** Sự kiện cài đặt gốc của trình duyệt (null nếu trình duyệt không hỗ trợ hoặc đã dùng). */
  deferred: BeforeInstallPromptEvent | null;
  /** Đang mở dưới dạng ứng dụng đã cài, hoặc vừa cài xong. */
  installed: boolean;
}

let state: InstallState = { deferred: null, installed: false };
const listeners = new Set<() => void>();

function setState(next: Partial<InstallState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

export function subscribeInstall(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getInstallState() {
  return state;
}

/** Trạng thái cài đặt cho component React (tự cập nhật khi trình duyệt phát sự kiện). */
export function useInstallState() {
  return useSyncExternalStore(subscribeInstall, getInstallState, getInstallState);
}

let started = false;
/** Gắn bộ nghe một lần; gọi sớm ở main.tsx để không lỡ sự kiện. */
export function startInstallCapture(win: Window = window) {
  if (started) return;
  started = true;
  if (isStandalone(win)) state = { ...state, installed: true };
  win.addEventListener('beforeinstallprompt', (event) => {
    // Giữ lại để tự hiện hộp cài khi người dùng bấm nút, thay cho dải nhắc mặc định của trình duyệt.
    event.preventDefault();
    setState({ deferred: event as BeforeInstallPromptEvent });
  });
  win.addEventListener('appinstalled', () => setState({ deferred: null, installed: true }));
}

/** Hiện hộp cài gốc của trình duyệt. Trả về null nếu không có sự kiện để dùng. */
export async function promptInstall() {
  const { deferred } = state;
  if (!deferred) return null;
  setState({ deferred: null });
  await deferred.prompt();
  const choice = await deferred.userChoice.catch(() => ({ outcome: 'dismissed' as const }));
  if (choice.outcome === 'accepted') setState({ installed: true });
  return choice.outcome;
}

/** Nhận diện hệ điều hành/trình duyệt để chọn cách cài phù hợp. */
export function detectInstallPlatform(userAgent: string, maxTouchPoints = 0): InstallPlatform {
  const ios =
    /iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/.test(userAgent) && maxTouchPoints > 1);
  if (ios) return /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(userAgent) ? 'ios-other' : 'ios-safari';
  if (/Android/i.test(userAgent)) return 'android';
  return 'desktop';
}

/** Chỉ dùng trong test: đưa kho về trạng thái ban đầu. */
export function resetInstallStateForTest(next: Partial<InstallState> = {}) {
  state = { deferred: null, installed: false, ...next };
  started = false;
  listeners.forEach((listener) => listener());
}
