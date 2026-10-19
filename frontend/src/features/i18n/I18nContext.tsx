import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type PropsWithChildren,
} from 'react';

import { useAuth } from '@/features/auth/AuthContext';
import type { Language } from '@/features/auth/types';
import { savePreferences } from '@/features/account/accountApi';
import {
  applyRecipeLanguage,
  getRecipeLanguage,
  subscribeRecipeContent,
} from '@/features/i18n/recipeContent';
import {
  LANGUAGE_STORAGE_KEY,
  LOCALES,
  readStoredLanguage,
  translate,
  type Translate,
} from '@/features/i18n/translate';

export type { Translate, TranslateVars } from '@/features/i18n/translate';

interface I18nContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  t: Translate;
  formatDate: (value: Date | string, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string;
}

function toDate(value: Date | string) {
  if (value instanceof Date) return value;
  // Ngày dạng YYYY-MM-DD được hiểu theo giờ địa phương để không lệch sang ngày trước.
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00`) : new Date(value);
}

function createValue(
  language: Language,
  setLanguage: (language: Language) => void,
): I18nContextValue {
  const locale = LOCALES[language];
  return {
    language,
    locale,
    setLanguage,
    t: (text, vars) => translate(language, text, vars),
    formatDate: (value, options) => new Intl.DateTimeFormat(locale, options).format(toDate(value)),
    formatNumber: (value, options) => new Intl.NumberFormat(locale, options).format(value),
  };
}

const I18nContext = createContext<I18nContextValue>(createValue('vi', () => undefined));

export function I18nProvider({ children }: PropsWithChildren) {
  const { updateUser, user } = useAuth();
  const [guestLanguage, setGuestLanguage] = useState<Language>(readStoredLanguage);
  const requestedLanguage = user?.preferences?.language ?? guestLanguage;
// Đồng bộ ngôn ngữ giao diện với từ điển món ăn.
  const language = useSyncExternalStore(subscribeRecipeContent, getRecipeLanguage);

  const setLanguage = useCallback(
    (next: Language) => {
      // Chỉ đổi giao diện và lưu lựa chọn sau khi bản dịch món đã sẵn sàng.
      void applyRecipeLanguage(next).then((applied) => {
        if (!applied) return;
        setGuestLanguage(next);
        try {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        } catch {
          // Trình duyệt chặn lưu trữ: ngôn ngữ vẫn áp dụng trong phiên hiện tại.
        }
        if (user?.preferences) {
          const preferences = { ...user.preferences, language: next };
          updateUser({ ...user, preferences });
          void savePreferences(preferences).catch(() => undefined);
        }
      });
    },
    [updateUser, user],
  );

  useEffect(() => {
    void applyRecipeLanguage(requestedLanguage);
  }, [requestedLanguage]);

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      // Ghi nhớ để màn hình khởi động lần sau hiển thị đúng ngôn ngữ ngay từ đầu.
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    } catch {
      // Bỏ qua khi trình duyệt chặn lưu trữ.
    }
  }, [language]);

  const value = useMemo(() => createValue(language, setLanguage), [language, setLanguage]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useI18n() {
  return useContext(I18nContext);
}
