import { recipeMinutes, type Recipe } from '@/data/recipes';
import {
  describeMealComposition,
  getMealRole,
  hasVegetarianMealLabel,
} from '@/data/mealComposition';
import { seededShuffle } from '@/lib/seededShuffle';

const HOME_MEAL_SUGGESTION_STORAGE_KEY = 'bepviet.home-meal-suggestions.v1';
const RECENT_HOME_MEAL_SUGGESTION_LIMIT = 36;

export type HomeMealSuggestion = {
  id: string;
  title: string;
  description: string;
  time: string;
  minutes: number;
  servings: number;
  recipeSlugs: string[];
  /** Dữ liệu cấu trúc để giao diện tự dịch tiêu đề và mô tả. */
  anchorName?: string;
};

export function getHomeMealSuggestionKey(meal: HomeMealSuggestion): string {
  return meal.recipeSlugs.slice().sort().join('|');
}

export function readRecentHomeMealSuggestionKeys(): string[] {
  if (typeof window === 'undefined') return [];

  try {
    const stored = window.localStorage.getItem(HOME_MEAL_SUGGESTION_STORAGE_KEY);
    const parsed: unknown = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed)
      ? parsed
          .filter((key): key is string => typeof key === 'string')
          .slice(0, RECENT_HOME_MEAL_SUGGESTION_LIMIT)
      : [];
  } catch {
    return [];
  }
}

export function rememberHomeMealSuggestions(
  meals: HomeMealSuggestion[],
  recentKeys = readRecentHomeMealSuggestionKeys(),
): void {
  if (typeof window === 'undefined' || meals.length === 0) return;

  try {
    const nextKeys = [...new Set([...meals.map(getHomeMealSuggestionKey), ...recentKeys])].slice(
      0,
      RECENT_HOME_MEAL_SUGGESTION_LIMIT,
    );
    window.localStorage.setItem(HOME_MEAL_SUGGESTION_STORAGE_KEY, JSON.stringify(nextKeys));
  } catch {
    return;
  }
}

export function selectHomeMealSuggestions(
  candidates: HomeMealSuggestion[],
  seed: string,
  recentKeys: string[] = [],
  limit = 9,
): HomeMealSuggestion[] {
  const count = Math.min(candidates.length, Math.max(0, Math.floor(limit)));
  if (count === 0) return [];

  const recent = new Set(recentKeys);
  const unseen = candidates.filter((meal) => !recent.has(getHomeMealSuggestionKey(meal)));
  const shuffled = seededShuffle(unseen, `${seed}:featured-meals`, getHomeMealSuggestionKey);
  const selected: HomeMealSuggestion[] = [];
  const selectedKeys = new Set<string>();
  const selectedRecipes = new Set<string>();

  for (const meal of shuffled) {
    const key = getHomeMealSuggestionKey(meal);
    if (selectedKeys.has(key) || meal.recipeSlugs.some((slug) => selectedRecipes.has(slug)))
      continue;
    selected.push(meal);
    selectedKeys.add(key);
    meal.recipeSlugs.forEach((slug) => selectedRecipes.add(slug));
    if (selected.length === count) return selected;
  }

  const previouslyShown = seededShuffle(
    candidates.filter((meal) => recent.has(getHomeMealSuggestionKey(meal))),
    `${seed}:recent-fallback`,
    getHomeMealSuggestionKey,
  );
  for (const meal of previouslyShown) {
    const key = getHomeMealSuggestionKey(meal);
    if (selectedKeys.has(key)) continue;
    selected.push(meal);
    selectedKeys.add(key);
    if (selected.length === count) break;
  }

  return selected;
}

function pickRecipe(candidates: Recipe[], index: number, excluded: Set<string>) {
  for (let offset = 0; offset < candidates.length; offset += 1) {
    const candidate = candidates[(index + offset) % candidates.length];
    if (candidate && !excluded.has(candidate.slug)) return candidate;
  }
  return undefined;
}

function preferRegion(candidates: Recipe[], region: Recipe['region']) {
  const matching = candidates.filter(
    (recipe) => recipe.region === region || recipe.region === 'Ba miền',
  );
  return matching.length ? matching : candidates;
}

export function createHomeMealSuggestions(
  catalog: Recipe[],
  seed = 'bep-viet',
): HomeMealSuggestion[] {
  if (!catalog.length) return [];

  const mealCatalog = catalog.filter((recipe) => getMealRole(recipe) !== 'other');
  const anchors = seededShuffle(mealCatalog, seed, (recipe) => recipe.slug);

  const mains = catalog.filter((recipe) => getMealRole(recipe) === 'main');
  const soups = catalog.filter((recipe) => getMealRole(recipe) === 'soup');
  const vegetables = catalog.filter((recipe) => getMealRole(recipe) === 'vegetable');
  const vegetarianMains = mains.filter(hasVegetarianMealLabel);
  const vegetarianSoups = soups.filter(hasVegetarianMealLabel);
  const vegetarianVegetables = vegetables.filter(hasVegetarianMealLabel);
  const shuffledPools = {
    mains: seededShuffle(mains, `${seed}:main`, (recipe) => recipe.slug),
    soups: seededShuffle(soups, `${seed}:soup`, (recipe) => recipe.slug),
    vegetables: seededShuffle(vegetables, `${seed}:vegetable`, (recipe) => recipe.slug),
    vegetarianMains: seededShuffle(
      vegetarianMains,
      `${seed}:vegetarian-main`,
      (recipe) => recipe.slug,
    ),
    vegetarianSoups: seededShuffle(
      vegetarianSoups,
      `${seed}:vegetarian-soup`,
      (recipe) => recipe.slug,
    ),
    vegetarianVegetables: seededShuffle(
      vegetarianVegetables,
      `${seed}:vegetarian-vegetable`,
      (recipe) => recipe.slug,
    ),
  };
  const seenCombinations = new Set<string>();

  return anchors.flatMap((anchor, index) => {
    const selected = new Set<string>([anchor.slug]);
    const anchorRole = getMealRole(anchor);
    const isMain = anchorRole === 'main';
    const isSoup = anchorRole === 'soup';
    const isVegetable = anchorRole === 'vegetable';
    const vegetarianAnchor = hasVegetarianMealLabel(anchor);
    const useVegetarianPools = vegetarianAnchor;
    const mainPool = useVegetarianPools ? shuffledPools.vegetarianMains : shuffledPools.mains;
    const soupPool = useVegetarianPools ? shuffledPools.vegetarianSoups : shuffledPools.soups;
    const vegetablePool = useVegetarianPools
      ? shuffledPools.vegetarianVegetables
      : shuffledPools.vegetables;
    const pickForAnchor = (pool: Recipe[], offset: number) =>
      pickRecipe(preferRegion(pool, anchor.region), index * 3 + offset, selected);
    const main = isMain ? anchor : pickForAnchor(mainPool, 0);
    if (main) selected.add(main.slug);
    const soup = isSoup ? anchor : pickForAnchor(soupPool, 1);
    if (soup) selected.add(soup.slug);
    const vegetable = isVegetable ? anchor : pickForAnchor(vegetablePool, 2);
    if (vegetable) selected.add(vegetable.slug);

    const mealRecipes = [main, soup, vegetable].filter((recipe): recipe is Recipe =>
      Boolean(recipe),
    );
    if (mealRecipes.length !== 3) return [];
    const combinationKey = mealRecipes
      .map((recipe) => recipe.slug)
      .sort()
      .join('|');
    if (seenCombinations.has(combinationKey)) return [];
    seenCombinations.add(combinationKey);

    const time = Math.max(...mealRecipes.map(recipeMinutes));
    // Tên mâm theo món chính, kể cả khi mâm được ghép quanh món canh hoặc món rau.
    const mainName = mealRecipes[0]!.name;
    return [
      {
        id: `goi-y-${anchor.slug}`,
        title: `Mâm cơm cùng ${mainName}`,
        description: describeMealComposition(mealRecipes),
        time: `${time} phút`,
        minutes: time,
        anchorName: mainName,
        servings: anchor.servings,
        recipeSlugs: mealRecipes.map((recipe) => recipe.slug),
      },
    ];
  });
}
