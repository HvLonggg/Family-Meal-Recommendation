import { useSyncExternalStore } from 'react';

import { getRecipeCatalog, setRecipeDictionary, type RecipeDictionary } from '@/data/recipes';
import type { Language } from '@/features/auth/types';

/** Tải từ điển món trước khi đổi ngôn ngữ giao diện. */
let active: Language = 'vi';
let requested: Language = 'vi';
let activeDictionary: RecipeDictionary | null = null;
let pending: Promise<RecipeDictionary> | null = null;
const listeners = new Set<() => void>();

function loadEnglishDictionary() {
  pending ??= import('@/features/i18n/recipeContent.en.json').then(
    (module) => module.default as RecipeDictionary,
  );
  return pending;
}

function commit(language: Language, dictionary: RecipeDictionary | null) {
  if (active === language && activeDictionary === dictionary) return;
  active = language;
  activeDictionary = dictionary;
  setRecipeDictionary(dictionary);
  for (const listener of listeners) listener();
}

export async function applyRecipeLanguage(language: Language) {
  requested = language;
  if (language === 'vi') {
    commit('vi', null);
    return true;
  }
  try {
    const dictionary = await loadEnglishDictionary();
    // Ignore a slower English load if the user has already switched back to Vietnamese.
    if (requested !== 'en') return false;
    commit('en', dictionary);
    return true;
  } catch {
    pending = null;
    return false;
  }
}

export function subscribeRecipeContent(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getRecipeLanguage = () => active;

/** Danh mục món theo ngôn ngữ hiện tại. */
export function useRecipeCatalog() {
  return useSyncExternalStore(subscribeRecipeContent, getRecipeCatalog);
}
