import type { Translate } from '@/features/i18n/translate';
import { ApiError } from '@/lib/api/client';

const GENERIC_ERROR = 'Đã có lỗi xảy ra. Vui lòng thử lại.';

/** Lỗi có câu chữ viết cho người dùng (ví dụ "Tệp vượt quá 8 MB."), được phép hiển thị. */
export class UserFacingError extends Error {}

/** Ch? hi?n th? l?i ?? so?n cho ng??i d?ng; l?i k? thu?t d?ng th?ng b?o chung. */
export function errorMessage(error: unknown, t: Translate) {
  if (error instanceof ApiError || error instanceof UserFacingError) return t(error.message);
  return t(GENERIC_ERROR);
}
