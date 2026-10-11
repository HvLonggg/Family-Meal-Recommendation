import type { Translate } from '@/features/i18n/translate';
import { ApiError } from '@/lib/api/client';

/** Thông báo lỗi máy chủ trả về bằng tiếng Việt; dịch được nếu có trong từ điển. */
export function errorMessage(error: unknown, t: Translate) {
  if (error instanceof ApiError || error instanceof Error) return t(error.message);
  return t('Đã có lỗi xảy ra. Vui lòng thử lại.');
}
