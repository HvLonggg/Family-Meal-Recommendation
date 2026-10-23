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

function send(path: string, init?: RequestInit) {
  return fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });
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
