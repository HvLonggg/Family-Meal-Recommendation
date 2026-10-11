import { useSyncExternalStore } from 'react';

import { getRecipeCatalog, setRecipeDictionary, type RecipeDictionary } from '@/data/recipes';
import type { Language } from '@/features/auth/types';

/**
 * Nội dung món ăn (tên, mô tả, nguyên liệu, mẹo) có bản tiếng Anh riêng, chỉ tải khi người dùng
 * chọn English để không làm nặng gói JS của đa số người dùng tiếng Việt.
 * Các bước nấu vẫn là tiếng Việt gốc.
 */
let version = 0;
let active: Language = 'vi';
let requested: Language = 'vi';
let pending: Promise<RecipeDictionary> | null = null;
const listeners = new Set<() => void>();

function loadEnglishDictionary() {
  pending ??= import('@/features/i18n/recipeContent.en.json').then(
    (module) => module.default as RecipeDictionary,
  );
  return pending;
}

function commit(language: Language, dictionary: RecipeDictionary | null) {
  if (active === language) return;
  active = language;
  setRecipeDictionary(dictionary);
  version += 1;
  for (const listener of listeners) listener();
}

export async function applyRecipeLanguage(language: Language) {
  requested = language;
  if (language === 'vi') {
    commit('vi', null);
    return;
  }
  try {
    const dictionary = await loadEnglishDictionary();
    // Người dùng có thể đã đổi lại tiếng Việt trong lúc đang tải.
    if (requested === 'en') commit('en', dictionary);
  } catch {
    // Mất mạng khi tải: giữ nội dung tiếng Việt, lần đổi ngôn ngữ sau sẽ thử tải lại.
    pending = null;
  }
}

export function subscribeRecipeContent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getRecipeContentVersion = () => version;

/** Danh mục món theo ngôn ngữ hiện tại; tham chiếu mảng đổi khi đổi ngôn ngữ nên dùng được làm deps. */
export function useRecipeCatalog() {
  return useSyncExternalStore(subscribeRecipeContent, getRecipeCatalog);
}
