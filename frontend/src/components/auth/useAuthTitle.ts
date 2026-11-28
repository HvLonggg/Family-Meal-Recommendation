import { useEffect } from 'react';

import { useI18n } from '@/features/i18n/I18nContext';

/** Trang xác thực đặt lại tiêu đề tab về tên ứng dụng, không giữ tiêu đề của trang trước. */
export function useAuthTitle(title: string) {
  const { t } = useI18n();
  useEffect(() => {
    // Thanh tab luôn là tên ứng dụng; tham số giữ để các trang gọi không phải đổi.
    void title;
    document.title = t('Bếp Việt');
  }, [t, title]);
}
