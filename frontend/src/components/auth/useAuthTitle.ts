import { useEffect } from 'react';

import { useI18n } from '@/features/i18n/I18nContext';

/** Trang xác thực tự đặt tiêu đề tab, không giữ lại tiêu đề của trang trước. */
export function useAuthTitle(title: string) {
  const { t } = useI18n();
  useEffect(() => {
    document.title = `${title} · ${t('Bếp Việt')}`;
  }, [t, title]);
}
