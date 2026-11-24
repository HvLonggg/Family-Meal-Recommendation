/**
 * Chính sách thử lại khi gọi API. Tách khỏi client.ts để nơi cấu hình TanStack Query vẫn dùng
 * được khi test giả lập client. Nhận diện lỗi theo hình dạng (status/code) của ApiError.
 */
export const REQUEST_TIMEOUT_CODE = 'REQUEST_TIMEOUT';

interface ApiLikeError {
  status: number;
  code: string;
}

function isApiLikeError(error: unknown): error is ApiLikeError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as ApiLikeError).status === 'number' &&
    typeof (error as ApiLikeError).code === 'string'
  );
}

/** Lỗi do máy chủ quá tải: không tự thử lại ngay (đợi Retry-After, tránh dồn thêm tải). */
export function isServerBusyError(error: unknown) {
  if (!isApiLikeError(error)) return false;
  return (
    error.code === 'OVERLOADED' ||
    error.code === REQUEST_TIMEOUT_CODE ||
    (error.status === 429 && !error.code.endsWith('_RATE_LIMITED'))
  );
}

/** TanStack Query: thử lại một lần cho lỗi mạng/5xx; không thử lại lỗi 4xx hay khi quá tải. */
export function shouldRetryQuery(failureCount: number, error: unknown) {
  if (failureCount >= 1 || isServerBusyError(error)) return false;
  return !(isApiLikeError(error) && error.status >= 400 && error.status < 500);
}
