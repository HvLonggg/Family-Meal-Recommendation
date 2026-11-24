/**
 * Trạng thái vận hành của hệ thống mà người dùng cần biết:
 * - maintenance: máy chủ báo đang bảo trì (503 MAINTENANCE) → màn hình bảo trì.
 * - outage: không gọi được máy chủ hoặc cổng trả 502/503/504 → dải thông báo, tự thử lại.
 * - busy: máy chủ quá tải (503 OVERLOADED, 429 chung, request quá hạn) → dải thông báo kèm
 *   đếm ngược theo Retry-After; tự xóa khi có phản hồi thành công.
 * - offline: thiết bị mất mạng.
 * Ghi nhận từ client API; giao diện đọc qua useSystemStatus().
 */
import { useSyncExternalStore } from 'react';

export type SystemStatusKind = 'ok' | 'maintenance' | 'outage' | 'busy' | 'offline';

export interface SystemStatus {
  kind: SystemStatusKind;
  message?: string;
  endsAt?: string;
  /** busy: thời điểm (ms) nên thử lại, lấy từ Retry-After. */
  retryAt?: number;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
const OK: SystemStatus = { kind: 'ok' };
// Vài lỗi mạng lẻ tẻ chưa phải sự cố: chỉ báo khi lỗi lặp lại liên tiếp.
const OUTAGE_THRESHOLD = 2;
// Retry-After hợp lệ được giới hạn trong khoảng này; thêm độ lệch ngẫu nhiên để hàng nghìn
// trình duyệt không cùng thử lại một lúc khi hết thời gian chờ.
const BUSY_MIN_SECONDS = 5;
const BUSY_MAX_SECONDS = 120;
const BUSY_DEFAULT_SECONDS = 15;
const BUSY_JITTER_MS = 3_000;

let current: SystemStatus = OK;
let consecutiveFailures = 0;
const listeners = new Set<() => void>();

function set(next: SystemStatus) {
  if (
    next.kind === current.kind &&
    next.message === current.message &&
    next.endsAt === current.endsAt &&
    next.retryAt === current.retryAt
  ) {
    return;
  }
  current = next;
  listeners.forEach((listener) => listener());
}

export function getSystemStatus() {
  return current;
}

export function subscribeSystemStatus(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useSystemStatus() {
  return useSyncExternalStore(subscribeSystemStatus, getSystemStatus, getSystemStatus);
}

export function reportMaintenance(message?: string, endsAt?: string | null) {
  consecutiveFailures = 0;
  set({ kind: 'maintenance', message: message || undefined, endsAt: endsAt || undefined });
}

/** Một yêu cầu không tới được máy chủ (mất mạng, máy chủ sập, cổng 502/503/504). */
export function reportUnreachable() {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    set({ kind: 'offline' });
    return;
  }
  consecutiveFailures += 1;
  if (consecutiveFailures >= OUTAGE_THRESHOLD && current.kind !== 'maintenance') {
    set({ kind: 'outage' });
  }
}

/** Máy chủ quá tải: hiện "đang đông khách" và chờ Retry-After giây trước khi thử lại. */
export function reportBusy(retryAfterSeconds?: number | null) {
  consecutiveFailures = 0;
  if (current.kind === 'maintenance') return;
  const seconds = Math.min(
    BUSY_MAX_SECONDS,
    Math.max(BUSY_MIN_SECONDS, retryAfterSeconds || BUSY_DEFAULT_SECONDS),
  );
  const retryAt = Date.now() + seconds * 1000 + Math.round(Math.random() * BUSY_JITTER_MS);
  // Đang chờ thì không rút ngắn thời gian chờ đã báo.
  if (current.kind === 'busy' && (current.retryAt ?? 0) >= retryAt) return;
  set({ kind: 'busy', retryAt });
}

/** Số mili-giây còn phải chờ trước khi gửi lại request khi máy chủ báo quá tải. */
export function busyRemainingMs(now = Date.now()) {
  return current.kind === 'busy' ? Math.max(0, (current.retryAt ?? 0) - now) : 0;
}

/** Hết thời gian chờ quá tải: bỏ dải thông báo để thử lại (lần lỗi sau sẽ hiện lại). */
export function clearBusy() {
  if (current.kind === 'busy') set(OK);
}

/** Máy chủ trả lời bình thường: xóa cảnh báo sự cố (bảo trì chỉ xóa khi /status xác nhận). */
export function reportReachable() {
  consecutiveFailures = 0;
  if (current.kind === 'outage' || current.kind === 'offline' || current.kind === 'busy') set(OK);
}

export function reportOffline() {
  set({ kind: 'offline' });
}

/** Hỏi máy chủ trạng thái hiện tại; trả về true nếu hệ thống đã hoạt động bình thường. */
export async function refreshSystemStatus(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/status`, {
      cache: 'no-store',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      reportUnreachable();
      return false;
    }
    const payload = (await response.json()) as {
      data?: { maintenance?: boolean; message?: string | null; ends_at?: string | null };
    };
    if (payload.data?.maintenance) {
      reportMaintenance(payload.data.message ?? undefined, payload.data.ends_at);
      return false;
    }
    consecutiveFailures = 0;
    // /status luôn được phục vụ kể cả khi quá tải: không dùng nó để xóa trạng thái "đông khách".
    if (current.kind !== 'busy') set(OK);
    return true;
  } catch {
    reportUnreachable();
    return false;
  }
}

/** Chỉ dùng trong test. */
export function resetSystemStatusForTest() {
  consecutiveFailures = 0;
  current = OK;
  listeners.forEach((listener) => listener());
}
