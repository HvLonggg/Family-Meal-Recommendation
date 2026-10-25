import { recipeMinutes, type Recipe } from '@/data/recipes';
import { matchesRecipeCategory, matchesRecipeSearch } from '@/data/recipeSearch';
import { normalizeSearchText } from '@/lib/search';

export type NutritionNeedId = 'balanced' | 'light' | 'family' | 'quick';

const balancedCategories = [
  ['Món mặn', 'Savory dishes'],
  ['Món canh', 'Soup'],
  ['Món rau', 'Vegetable dishes'],
  ['Món chay', 'Vegetarian dishes'],
];

const spicyPattern =
  /\bot\b|\bsa te\b|\btuong ot\b|\bvi cay\b|\bchua cay\b|\bcay nong\b|\bchilli?\b|\bhot sauce\b/;

function hasMildFlavor(recipe: Recipe) {
  const text = normalizeSearchText(
    [
      recipe.name,
      recipe.excerpt,
      ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.name)),
    ].join(' '),
  );
  return !spicyPattern.test(text.replace(/\bot chuong\b/g, ' '));
}

function interleaveBalancedCategories(catalog: Recipe[]) {
  const groups = balancedCategories.map((categories) =>
    catalog.filter((recipe) => matchesRecipeCategory(recipe, categories)),
  );
  const results: Recipe[] = [];
  const longest = Math.max(0, ...groups.map((group) => group.length));
  for (let index = 0; index < longest; index += 1) {
    for (const group of groups) {
      const recipe = group[index];
      if (recipe) results.push(recipe);
    }
  }
  return results;
}

export function getNutritionMatches(catalog: Recipe[], need: NutritionNeedId) {
  if (need === 'balanced') return interleaveBalancedCategories(catalog);
  if (need === 'light')
    return catalog.filter((recipe) => matchesRecipeSearch(recipe, 'món thanh đạm'));
  if (need === 'family') {
    return catalog.filter(
      (recipe) =>
        ['de', 'easy'].includes(normalizeSearchText(recipe.difficulty)) && hasMildFlavor(recipe),
    );
  }
  return catalog.filter((recipe) => recipeMinutes(recipe) <= 30);
}
