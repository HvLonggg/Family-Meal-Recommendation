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

export async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      Accept: 'application/json',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({
      code: 'UNEXPECTED_ERROR',
      message: 'Đã có lỗi xảy ra. Vui lòng thử lại.',
      field_errors: {},
      trace_id: response.headers.get('X-Request-ID') ?? '',
    }))) as ErrorResponse;
    throw new ApiError(response.status, payload);
  }

  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

export function apiPost<T>(path: string, payload?: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method: 'POST',
    body: payload === undefined ? undefined : JSON.stringify(payload),
  });
}
