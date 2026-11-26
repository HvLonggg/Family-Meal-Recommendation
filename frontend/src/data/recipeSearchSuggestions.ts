import { matchesCatalogCategory, matchesIngredientFacets } from '@/data/recipeCatalogFilters';
import type { Recipe } from '@/data/recipes';
import { matchesRecipeRegion, matchesRecipeSearch } from '@/data/recipeSearch';

/**
 * Chip gợi ý ở trang chủ. Nhóm món, nguyên liệu và vùng miền mở thẳng bộ lọc của Kho món
 * thay vì đưa nhãn vào tìm kiếm chữ (ví dụ “Món hải sản” → lọc cá, tôm, hải sản).
 */
export type RecipeSearchSuggestion = {
  label: string;
  category?: string;
  ingredients?: readonly string[];
  region?: string;
  q?: string;
  sort?: 'quick' | 'easy';
};

export const RECIPE_SEARCH_SUGGESTIONS: readonly RecipeSearchSuggestion[] = [
  { label: 'Món chay', category: 'Món chay' },
  { label: 'Món thanh đạm', q: 'Món thanh đạm', sort: 'quick' },
  { label: 'Món hải sản', ingredients: ['fish', 'shrimp', 'seafood'] },
  { label: 'Nấu trong 30 phút', q: 'Nấu trong 30 phút', sort: 'quick' },
  { label: 'Món canh', category: 'Món canh' },
  { label: 'Món rau', category: 'Món rau' },
  { label: 'Món gà', ingredients: ['chicken'] },
  { label: 'Món thịt heo', ingredients: ['pork'] },
  { label: 'Món thịt bò', ingredients: ['beef'] },
  { label: 'Món vịt', ingredients: ['duck', 'muscovy'] },
  { label: 'Món miền Bắc', region: 'Bắc' },
  { label: 'Món miền Trung', region: 'Trung' },
  { label: 'Món miền Nam', region: 'Nam' },
  { label: 'Món ăn sáng', category: 'Món ăn sáng' },
  { label: 'Món tráng miệng', category: 'Món tráng miệng' },
  { label: 'Món ăn vặt', category: 'Món ăn vặt' },
  { label: 'Món dễ nấu', q: 'Món dễ nấu', sort: 'easy' },
  { label: 'Món chay dưới 30 phút', category: 'Món chay', q: 'dưới 30 phút', sort: 'quick' },
];

/** Đường dẫn Kho món đã áp dụng đúng bộ lọc của chip. */
export function recipeSuggestionHref(suggestion: RecipeSearchSuggestion) {
  const params = new URLSearchParams();
  if (suggestion.q) params.set('q', suggestion.q);
  if (suggestion.category) params.set('category', suggestion.category);
  if (suggestion.ingredients?.length) params.set('ingredients', suggestion.ingredients.join(','));
  if (suggestion.region) params.set('region', suggestion.region);
  if (suggestion.sort) params.set('sort', suggestion.sort);
  return `/recipes?${params.toString()}`;
}

export function matchesRecipeSuggestion(recipe: Recipe, suggestion: RecipeSearchSuggestion) {
  return (
    (!suggestion.category || matchesCatalogCategory(recipe, suggestion.category)) &&
    matchesIngredientFacets(recipe, suggestion.ingredients ?? []) &&
    (!suggestion.region || matchesRecipeRegion(recipe, suggestion.region)) &&
    (!suggestion.q || matchesRecipeSearch(recipe, suggestion.q))
  );
}

/** Chọn chủ đề gợi ý có món phù hợp trong danh mục. */
export function pickRecipeSearchSuggestions(
  catalog: Recipe[],
  count = 5,
  random: () => number = Math.random,
) {
  const pool = RECIPE_SEARCH_SUGGESTIONS.filter((suggestion) =>
    catalog.some((recipe) => matchesRecipeSuggestion(recipe, suggestion)),
  );
  const suggestions: RecipeSearchSuggestion[] = [];

  while (pool.length > 0 && suggestions.length < count) {
    const index = Math.min(pool.length - 1, Math.floor(random() * pool.length));
    const [suggestion] = pool.splice(Math.max(0, index), 1);
    if (suggestion) suggestions.push(suggestion);
  }

  return suggestions;
}
