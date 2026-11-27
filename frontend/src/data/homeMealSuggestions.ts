import { recipeMinutes, type Recipe } from '@/data/recipes';
import {
  describeMealComposition,
  getMealRole,
  hasVegetarianMealLabel,
} from '@/data/mealComposition';
import { seasonalWeight, weightedSeededShuffle, type Season } from '@/data/seasonalPicks';
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
  /** Mức hợp mùa của cả mâm (1 = trung tính); chỉ có khi tạo theo mùa. */
  seasonWeight?: number;
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
  // Mâm có trọng số mùa thì xáo có trọng số để món hợp thời tiết thường được chọn hơn.
  const shuffled = candidates.some((meal) => meal.seasonWeight !== undefined)
    ? weightedSeededShuffle(
        unseen,
        `${seed}:featured-meals`,
        getHomeMealSuggestionKey,
        (meal) => meal.seasonWeight ?? 1,
      )
    : seededShuffle(unseen, `${seed}:featured-meals`, getHomeMealSuggestionKey);
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

  // Hết mâm không trùng món: lấy tiếp các mâm chưa xem còn lại (có thể chung một món),
  // để băng chuyền trang chủ chạy được trên toàn bộ tổ hợp trước khi quay lại mâm đã xem.
  for (const meal of shuffled) {
    const key = getHomeMealSuggestionKey(meal);
    if (selectedKeys.has(key)) continue;
    selected.push(meal);
    selectedKeys.add(key);
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

/**
 * Trọng số mùa của cả mâm: trung bình nhân các món, nhưng không vượt món kém hợp mùa nhất,
 * để chỉ một món trái mùa cũng khiến cả mâm hiếm xuất hiện.
 */
function mealSeasonWeight(mealRecipes: Recipe[], weightOf: (recipe: Recipe) => number) {
  const weights = mealRecipes.map(weightOf);
  const geometricMean = Math.exp(
    weights.reduce((sum, weight) => sum + Math.log(weight), 0) / weights.length,
  );
  return Math.min(geometricMean, ...weights);
}

/**
 * Ghép mâm cơm (món mặn + canh + rau). Khi truyền `season`, thứ tự món được xáo có trọng số
 * theo mùa: món hợp thời tiết hay xuất hiện, món trái mùa vẫn có nhưng hiếm.
 */
export function createHomeMealSuggestions(
  catalog: Recipe[],
  seed = 'bep-viet',
  season?: Season,
): HomeMealSuggestion[] {
  if (!catalog.length) return [];

  // Trọng số mùa (dò từ khóa trên tên món) cũng chỉ tính một lần cho mỗi món.
  const weights = new Map<string, number>();
  const weightOf = (recipe: Recipe) => {
    let weight = weights.get(recipe.slug);
    if (weight === undefined) {
      weight = season ? seasonalWeight(recipe, season) : 1;
      weights.set(recipe.slug, weight);
    }
    return weight;
  };
  const shuffle = (items: Recipe[], key: string) =>
    season
      ? weightedSeededShuffle(items, key, (recipe) => recipe.slug, weightOf)
      : seededShuffle(items, key, (recipe) => recipe.slug);

  // Phân loại món mỗi món một lần (getMealRole khá tốn khi chạy trên cả kho ~800 món).
  const roles = new Map(catalog.map((recipe) => [recipe.slug, getMealRole(recipe)]));
  const roleOf = (recipe: Recipe) => roles.get(recipe.slug) ?? getMealRole(recipe);
  const mealCatalog = catalog.filter((recipe) => roleOf(recipe) !== 'other');
  const anchors = shuffle(mealCatalog, seed);

  const mains = catalog.filter((recipe) => roleOf(recipe) === 'main');
  const soups = catalog.filter((recipe) => roleOf(recipe) === 'soup');
  const vegetables = catalog.filter((recipe) => roleOf(recipe) === 'vegetable');
  const vegetarianMains = mains.filter(hasVegetarianMealLabel);
  const vegetarianSoups = soups.filter(hasVegetarianMealLabel);
  const vegetarianVegetables = vegetables.filter(hasVegetarianMealLabel);
  const shuffledPools = {
    mains: shuffle(mains, `${seed}:main`),
    soups: shuffle(soups, `${seed}:soup`),
    vegetables: shuffle(vegetables, `${seed}:vegetable`),
    vegetarianMains: shuffle(vegetarianMains, `${seed}:vegetarian-main`),
    vegetarianSoups: shuffle(vegetarianSoups, `${seed}:vegetarian-soup`),
    vegetarianVegetables: shuffle(vegetarianVegetables, `${seed}:vegetarian-vegetable`),
  };
  const seenCombinations = new Set<string>();

  return anchors.flatMap((anchor, index) => {
    const selected = new Set<string>([anchor.slug]);
    const anchorRole = roleOf(anchor);
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
    let description: string | undefined;
    // Tên mâm theo món chính, kể cả khi mâm được ghép quanh món canh hoặc món rau.
    const mainName = mealRecipes[0]!.name;
    return [
      {
        id: `goi-y-${anchor.slug}`,
        title: `Mâm cơm cùng ${mainName}`,
        // Mô tả chỉ tính khi cần đọc: trang chủ tạo hàng trăm mâm nhưng chỉ hiện vài thẻ.
        get description() {
          description ??= describeMealComposition(mealRecipes);
          return description;
        },
        time: `${time} phút`,
        minutes: time,
        anchorName: mainName,
        servings: anchor.servings,
        recipeSlugs: mealRecipes.map((recipe) => recipe.slug),
        ...(season ? { seasonWeight: mealSeasonWeight(mealRecipes, weightOf) } : {}),
      },
    ];
  });
}
