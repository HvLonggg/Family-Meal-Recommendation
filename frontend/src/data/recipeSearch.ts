import { recipeMinutes, type Recipe } from '@/data/recipes';
import { matchesSearch, normalizeSearchText } from '@/lib/search';

const LIGHT_CATEGORIES = new Set(['Món canh', 'Món rau', 'Món chay']);
const SEAFOOD_INGREDIENT_PATTERN =
  /(?:^|[^\p{L}])(?:cá|tôm|mực|cua|ghẹ|nghêu|ngao|sò|ốc|hàu|bạch tuộc)(?=$|[^\p{L}])/iu;
const TIME_QUERY_PATTERN =
  /(?:(?:nau\s+)?(?:duoi|trong|toi\s+da|khong\s+qua)\s+)?(\d+)\s*(?:p|phut)\b/;
const FACET_PATTERNS = {
  vegetarian: /\b(?:mon\s+chay|do\s+chay|chay)\b/,
  light: /\b(?:mon\s+thanh\s+dam|thanh\s+dam|thanh\s+mat|nhe\s+bung|nhieu\s+rau)\b/,
  seafood: /\b(?:mon\s+hai\s+san|hai\s+san|seafood)\b/,
  soup: /\b(?:mon\s+canh|canh)\b/,
  vegetable: /\b(?:mon\s+rau|rau)\b/,
  chicken: /\b(?:mon\s+ga|ga)\b/,
  breakfast: /\b(?:mon\s+an\s+sang|an\s+sang)\b/,
  dessert: /\b(?:mon\s+trang\s+mieng|trang\s+mieng)\b/,
  easy: /\b(?:mon\s+de\s+nau|de\s+nau)\b/,
  region: /\b(?:mon\s+)?mien\s+(bac|trung|nam)\b/,
};

function isVegetarianRecipe(recipe: Recipe) {
  return (
    recipe.category === 'Món chay' || recipe.tags.some((tag) => matchesSearch('món chay', [tag]))
  );
}

function isLightRecipe(recipe: Recipe) {
  return (
    LIGHT_CATEGORIES.has(recipe.category) ||
    recipe.tags.some((tag) =>
      ['thanh đạm', 'thanh mát', 'nhẹ bụng', 'nhiều rau', 'ít dầu'].some((keyword) =>
        matchesSearch(keyword, [tag]),
      ),
    )
  );
}

function isSeafoodRecipe(recipe: Recipe) {
  const searchableIngredients = recipe.ingredients
    .filter((group) => !/gia vị|nước chấm|nước sốt|phần nêm/i.test(group.group))
    .flatMap((group) => group.items.map((item) => item.name));
  const seafoodTags = recipe.tags.some((tag) => matchesSearch('hải sản', [tag]));
  const seafoodText = [
    recipe.name,
    recipe.excerpt,
    recipe.ingredientCategory ?? '',
    ...searchableIngredients,
  ]
    .join(' ')
    .replace(/mắm[\s-]+tôm/giu, ' ');
  return seafoodTags || SEAFOOD_INGREDIENT_PATTERN.test(seafoodText);
}

export function matchesRecipeSearch(recipe: Recipe, query: string) {
  let remainingQuery = normalizeSearchText(query);
  const filters: ((item: Recipe) => boolean)[] = [];

  for (const [facet, pattern] of Object.entries(FACET_PATTERNS)) {
    const facetMatch = remainingQuery.match(pattern);
    if (!facetMatch) continue;
    remainingQuery = remainingQuery.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
    if (facet === 'vegetarian') filters.push(isVegetarianRecipe);
    if (facet === 'light') filters.push(isLightRecipe);
    if (facet === 'seafood') filters.push(isSeafoodRecipe);
    if (facet === 'soup') filters.push((item) => item.category === 'Món canh');
    if (facet === 'vegetable') filters.push((item) => item.category === 'Món rau');
    if (facet === 'chicken') {
      filters.push((item) =>
        matchesSearch('gà', [
          item.name,
          ...item.ingredients.flatMap((group) => group.items.map((ingredient) => ingredient.name)),
        ]),
      );
    }
    if (facet === 'breakfast') filters.push((item) => item.category === 'Món ăn sáng');
    if (facet === 'dessert') filters.push((item) => item.category === 'Món tráng miệng');
    if (facet === 'easy') filters.push((item) => item.difficulty === 'Dễ');
    if (facet === 'region') {
      const region = facetMatch[1];
      if (region) {
        const normalizedRegion = region === 'bac' ? 'Bắc' : region === 'trung' ? 'Trung' : 'Nam';
        filters.push((item) =>
          matchesSearch(normalizedRegion, [item.region, ...(item.regions ?? [])]),
        );
      }
    }
  }

  const timeMatch = remainingQuery.match(TIME_QUERY_PATTERN);
  if (timeMatch) {
    const maxMinutes = Number(timeMatch[1]);
    filters.push((item) => recipeMinutes(item) <= maxMinutes);
    remainingQuery = remainingQuery.replace(timeMatch[0], ' ').replace(/\s+/g, ' ').trim();
    remainingQuery = remainingQuery
      .split(' ')
      .filter(
        (term) => !['mon', 'nau', 'trong', 'duoi', 'toi', 'da', 'khong', 'qua'].includes(term),
      )
      .join(' ');
  }

  const matchesText =
    !remainingQuery ||
    matchesSearch(remainingQuery, [
      recipe.name,
      recipe.excerpt,
      recipe.category,
      recipe.region,
      `${recipeMinutes(recipe)} phút`,
      ...(recipe.aliases ?? []),
      ...(recipe.regions ?? []),
      recipe.ingredientCategory ?? '',
      ...recipe.tags,
      ...recipe.ingredients.flatMap((group) => group.items.map((ingredient) => ingredient.name)),
    ]);

  return matchesText && filters.every((matchesFacet) => matchesFacet(recipe));
}

export function recipeSearchRank(recipe: Recipe, query: string) {
  const keyword = normalizeSearchText(query);
  if (!keyword) return 0;
  const names = [recipe.name, ...(recipe.aliases ?? [])].map(normalizeSearchText);
  if (names.includes(keyword)) return 100;
  if (names.some((name) => name.includes(keyword))) return 50;
  if (names.some((name) => matchesSearch(query, [name]))) return 25;
  return 1;
}
