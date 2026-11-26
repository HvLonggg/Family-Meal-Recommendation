import type { Language } from '@/features/auth/types';

export type TranslateVars = Record<string, string | number>;
export type Translate = (text: string, vars?: TranslateVars) => string;

// Bản dịch giao diện tiếng Anh tải riêng (không nằm trong gói JS đầu của người dùng tiếng Việt);
// recipeContent chỉ chuyển sang 'en' sau khi tệp này đã nạp xong.
let en: Record<string, string> = {};
let uiMessagesRequest: Promise<void> | null = null;

export function loadEnglishUiMessages(): Promise<void> {
  uiMessagesRequest ??= import('@/features/i18n/messages.en').then(
    (module) => {
      en = module.en;
    },
    (error: unknown) => {
      uiMessagesRequest = null;
      throw error;
    },
  );
  return uiMessagesRequest;
}

export const LANGUAGE_STORAGE_KEY = 'bep-viet-language';
export const LOCALES: Record<Language, string> = { vi: 'vi-VN', en: 'en-US' };

function interpolate(text: string, vars?: TranslateVars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Dịch chuỗi giao diện, giữ nguyên nếu chưa có bản dịch. */
export function translate(language: Language, text: string, vars?: TranslateVars) {
  const template = language === 'en' ? (en[text] ?? text) : text;
  return interpolate(template, vars);
}

export function readStoredLanguage(): Language {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return stored === 'en' || stored === 'vi' ? stored : 'vi';
  } catch {
    return 'vi';
  }
}
