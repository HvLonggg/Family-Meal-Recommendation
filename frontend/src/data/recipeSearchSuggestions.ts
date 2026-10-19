import type { Recipe } from '@/data/recipes';
import { matchesRecipeSearch } from '@/data/recipeSearch';

export const RECIPE_SEARCH_SUGGESTIONS = [
  'Món chay',
  'Món thanh đạm',
  'Món hải sản',
  'Nấu trong 30 phút',
  'Món canh',
  'Món rau',
  'Món gà',
  'Món miền Bắc',
  'Món miền Trung',
  'Món miền Nam',
  'Món ăn sáng',
  'Món tráng miệng',
  'Món dễ nấu',
] as const;

/** Chọn chủ đề gợi ý có món phù hợp trong danh mục. */
export function pickRecipeSearchSuggestions(
  catalog: Recipe[],
  count = 5,
  random: () => number = Math.random,
) {
  const pool = RECIPE_SEARCH_SUGGESTIONS.filter((query) =>
    catalog.some((recipe) => matchesRecipeSearch(recipe, query)),
  );
  const suggestions: string[] = [];

  while (pool.length > 0 && suggestions.length < count) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const [suggestion] = pool.splice(Math.max(0, index), 1);
    if (suggestion) suggestions.push(suggestion);
  }

  return suggestions;
}
