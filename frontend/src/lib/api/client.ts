import {
  reportBusy,
  reportMaintenance,
  reportReachable,
  reportUnreachable,
} from '@/features/system/systemStatus';
import { REQUEST_TIMEOUT_CODE } from '@/lib/api/retryPolicy';

interface ErrorResponse {
  code: string;
  message: string;
  field_errors: Record<string, string[]>;
  trace_id: string;
}

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api/v1';
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;
}

interface SessionHandlers {
  /** Gia hạn phiên bằng refresh token (cookie); trả về true nếu có token mới. */
  refresh: () => Promise<boolean>;
  /** Phiên không gia hạn được: đăng xuất ở giao diện và quay về trang đăng nhập. */
  expired: () => void;
}

let sessionHandlers: SessionHandlers | null = null;

export function setSessionHandlers(handlers: SessionHandlers | null) {
  sessionHandlers = handlers;
}

// Các endpoint xác thực tự xử lý 401 (sai mật khẩu, hết phiên) nên không tự gia hạn.
const isAuthEndpoint = (path: string) => path.startsWith('/auth/');

export class ApiError extends Error {
  readonly code: string;
  readonly fieldErrors: Record<string, string[]>;
  readonly status: number;
  readonly traceId: string;

  constructor(status: number, payload: ErrorResponse) {
    super(payload.message);
    this.name = 'ApiError';
    this.status = status;
    this.code = payload.code;
    this.fieldErrors = payload.field_errors;
    this.traceId = payload.trace_id;
  }
}

// Cổng/proxy trả các mã này khi máy chủ API không phản hồi (sập, đang khởi động lại).
const GATEWAY_FAILURES = new Set([502, 503, 504]);
// Không để giao diện chờ mãi khi máy chủ quá tải: quá hạn thì báo "đang đông khách".
// Ghi dữ liệu (tải tệp, hỏi Chú Rồng) được chờ lâu hơn đọc dữ liệu.
export const READ_TIMEOUT_MS = 25_000;
export const WRITE_TIMEOUT_MS = 60_000;
const TIMEOUT_MESSAGE = 'Máy chủ phản hồi quá lâu. Vui lòng thử lại sau ít giây.';

/** Giây phải chờ theo header Retry-After (số giây hoặc ngày giờ HTTP). */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds : undefined;
  const at = Date.parse(value);
  return Number.isNaN(at) ? undefined : Math.max(0, Math.round((at - Date.now()) / 1000));
}

async function errorCode(response: Response) {
  if (!response.headers.get('Content-Type')?.includes('json')) return undefined;
  const payload = (await response
    .clone()
    .json()
    .catch(() => null)) as Partial<ErrorResponse> | null;
  return payload ?? undefined;
}

async function send(path: string, init?: RequestInit) {
  let response: Response;
  try {
    response = await rawSend(path, init);
  } catch (error) {
    if (error instanceof ApiError && error.code === REQUEST_TIMEOUT_CODE) {
      reportBusy();
      throw error;
    }
    // Bị hủy chủ động (rời trang, hết thời gian chờ do nơi gọi đặt) không phải sự cố máy chủ.
    if (!(error instanceof DOMException && error.name === 'AbortError')) reportUnreachable();
    throw error;
  }
  const retryAfter = parseRetryAfter(response.headers.get('Retry-After'));
  if (response.status === 503) {
    const payload = await errorCode(response);
    if (payload?.code === 'MAINTENANCE') {
      reportMaintenance(payload.message);
      return response;
    }
    if (payload?.code === 'OVERLOADED') {
      reportBusy(retryAfter);
      return response;
    }
  }
  if (response.status === 429 && !isAuthEndpoint(path)) {
    // Giới hạn riêng từng tính năng (*_RATE_LIMITED) đã có thông báo tại chỗ; 429 chung
    // (từ proxy hay giới hạn tần suất toàn hệ thống) nghĩa là máy chủ đang đông.
    const payload = await errorCode(response);
    if (!payload?.code?.endsWith('_RATE_LIMITED')) {
      reportBusy(retryAfter);
      return response;
    }
  }
  if (GATEWAY_FAILURES.has(response.status)) reportUnreachable();
  else reportReachable();
  return response;
}

async function rawSend(path: string, init?: RequestInit) {
  // Nơi gọi tự đặt signal (kho món, luồng SSE) thì tự quản thời gian chờ.
  const controller = init?.signal ? null : new AbortController();
  const timeoutMs = init?.method && init.method !== 'GET' ? WRITE_TIMEOUT_MS : READ_TIMEOUT_MS;
  let timedOut = false;
  const timer = controller
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, timeoutMs)
    : undefined;
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      ...(controller ? { signal: controller.signal } : {}),
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...init?.headers,
      },
    });
  } catch (error) {
    if (timedOut) {
      throw new ApiError(504, {
        code: REQUEST_TIMEOUT_CODE,
        message: TIMEOUT_MESSAGE,
        field_errors: {},
        trace_id: '',
      });
    }
    throw error;
  } finally {
    // Chỉ giới hạn thời gian chờ phản hồi đầu tiên; đọc thân phản hồi lớn không bị cắt.
    clearTimeout(timer);
  }
}

/** Gửi request có xác thực; trả về Response thành công hoặc ném ApiError. */
async function authorized(path: string, init?: RequestInit): Promise<Response> {
  let response = await send(path, init);

  // Access token hết hạn (15 phút): gia hạn một lần bằng refresh token rồi gửi lại.
  if (response.status === 401 && accessToken && sessionHandlers && !isAuthEndpoint(path)) {
    const refreshed = await sessionHandlers.refresh();
    if (refreshed) {
      response = await send(path, init);
    }
    if (!refreshed || response.status === 401) {
      sessionHandlers.expired();
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({
      code: 'UNEXPECTED_ERROR',
      message: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
      field_errors: {},
      trace_id: response.headers.get('X-Request-ID') ?? '',
    }))) as ErrorResponse;
    throw new ApiError(response.status, payload);
  }
  return response;
}

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await authorized(path, init);
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** Request trả về luồng (SSE): nơi gọi tự đọc `response.body`. */
export function apiStream(path: string, init?: RequestInit): Promise<Response> {
  return authorized(path, init);
}

export function apiPost<T>(path: string, payload?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export function apiPatch<T>(path: string, payload?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PATCH',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export function apiPut<T>(path: string, payload?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'PUT',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}

export function apiDelete<T = void>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: 'DELETE' });
}

/** Tạo URL ảnh từ đường dẫn tương đối của API. */
export function apiUrl(path: string | null | undefined) {
  if (!path) return undefined;
  if (/^(https?:|data:|blob:)/.test(path)) return path;
  return `${API_BASE_URL}${path}`;
}
