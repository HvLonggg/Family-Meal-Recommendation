import type { Language } from '@/features/auth/types';
import { en } from '@/features/i18n/messages.en';

export type TranslateVars = Record<string, string | number>;
export type Translate = (text: string, vars?: TranslateVars) => string;

export const LANGUAGE_STORAGE_KEY = 'bep-viet-language';
export const LOCALES: Record<Language, string> = { vi: 'vi-VN', en: 'en-US' };

function interpolate(text: string, vars?: TranslateVars) {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/** Chuỗi tiếng Việt là khóa gốc; tiếng Anh tra trong từ điển, thiếu thì giữ nguyên bản Việt. */
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
