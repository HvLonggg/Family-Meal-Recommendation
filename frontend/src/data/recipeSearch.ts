import { useSyncExternalStore } from 'react';

import { getRecipeCatalog, recipeMinutes, type Recipe } from '@/data/recipes';
import {
  accentKey,
  FUZZY_MIN_LENGTH,
  matchesSearch,
  normalizeSearchText,
  oneEditApart,
  searchTokens,
  type SearchToken,
} from '@/lib/search';

type EnglishSearchEntry = { names: string[]; ingredients: string[]; fields: string[] };
// Chỉ mục tên/nguyên liệu tiếng Anh (~1,7 MB) không nằm trong gói JS đầu: tải ở nền sau khi app
// hiện (hoặc khi người dùng bắt đầu tìm). Trong lúc chờ, tìm kiếm vẫn chạy với dữ liệu tiếng Việt.
let englishRecipes: Record<string, EnglishSearchEntry> = {};
let englishIndexVersion = 0;
let englishIndexRequest: Promise<void> | null = null;
const englishIndexListeners = new Set<() => void>();

export function loadEnglishSearchIndex(): Promise<void> {
  englishIndexRequest ??= import('@/data/recipeSearchEnglish.json').then(
    (module) => {
      englishRecipes = module.default;
      rankDataCache = new WeakMap();
      englishIndexVersion += 1;
      for (const listener of englishIndexListeners) listener();
    },
    () => {
      // Lỗi mạng: cho phép thử lại ở lần tìm sau.
      englishIndexRequest = null;
    },
  );
  return englishIndexRequest;
}

function subscribeEnglishIndex(listener: () => void) {
  englishIndexListeners.add(listener);
  void loadEnglishSearchIndex();
  return () => englishIndexListeners.delete(listener);
}

/** Phiên bản chỉ mục tiếng Anh: đưa vào deps của useMemo để kết quả tìm cập nhật khi tải xong. */
export function useEnglishSearchIndexVersion() {
  return useSyncExternalStore(
    subscribeEnglishIndex,
    () => englishIndexVersion,
    () => englishIndexVersion,
  );
}

// Phần tiếng Anh; tiếng Việt so khớp có dấu bằng SEAFOOD_VI_PATTERN.
const SEAFOOD_PATTERN =
  /(?:^| )(?:fish|shrimp|prawns?|crabs?|squid|clams?|mussels?|oysters?|octopus|jellyfish|scallops?|snails?|seafood)(?=$| )/;
const CHICKEN_PATTERN = /(?:^| )(?:ga|chicken|poultry)(?=$| )/;
const EGG_PATTERN = /(?:^| )(?:trung|egg|eggs)(?=$| )/;
const CONDIMENT_PATTERN =
  /(?:gia vi|nuoc cham|nuoc sot|mam tom|mam ruoc|seasoning|sauce|dressing|fish sauce|shrimp paste|oyster sauce)/;
const LIGHT_TAGS = [
  'thanh đạm',
  'thanh mát',
  'nhẹ bụng',
  'nhiều rau',
  'ít dầu',
  'light',
  'low fat',
  'vegetable forward',
];
const TIME_QUERY_PATTERN =
  /(?:(?:nau|cook|ready|in|under|within|up to|no more than|less than|at most|duoi|trong|toi da|khong qua)\s+)*(\d+)\s*(?:p|min|mins|minute|minutes|phut)\b/;
const FACET_PATTERNS = {
  vegetarian: /\b(?:mon\s+chay|do\s+chay|chay|vegetarian|vegan|plant\s+based)\b/,
  light:
    /\b(?:mon\s+thanh\s+dam|thanh\s+dam|thanh\s+mat|nhe\s+bung|nhieu\s+rau|it\s+dau|light|low\s+fat)\b/,
  seafood: /\b(?:mon\s+hai\s+san|hai\s+san|seafood)\b/,
  soup: /\b(?:mon\s+canh|canh|soup)\b/,
  vegetable: /\b(?:mon\s+rau(?:\s+cu)?|rau\s+cu|rau|vegetables?|veggies?)\b/,
  chicken: /\b(?:mon\s+ga|ga|chicken|poultry)\b/,
  pork: /\b(?:mon\s+thit\s+(?:heo|lon)|thit\s+(?:heo|lon)|pork)\b/,
  beef: /\b(?:mon\s+thit\s+bo|thit\s+bo|beef)\b/,
  duck: /\b(?:mon\s+vit|vit|ngan|duck|muscovy)\b/,
  breakfast: /\b(?:mon\s+an\s+sang|an\s+sang|breakfast)\b/,
  dessert: /\b(?:mon\s+trang\s+mieng|trang\s+mieng|dessert)\b/,
  snack: /\b(?:mon\s+an\s+vat|an\s+vat|snack|street\s+food)\b/,
  easy: /\b(?:mon\s+de\s+nau|de\s+nau|easy\s+to\s+cook|easy)\b/,
  quick: /\b(?:quick|quickly|fast|nau\s+nhanh|mon\s+nhanh|nhanh\s+gon|nhanh)\b/,
};

const SEARCH_META_WORDS = new Set([
  'a',
  'an',
  'and',
  'dish',
  'dishes',
  'food',
  'foods',
  'meal',
  'meals',
  'mon',
  'recipe',
  'recipes',
  'thuc',
  'pham',
]);

function stripSearchMetaWords(query: string) {
  return query
    .split(' ')
    .filter((term) => term && !SEARCH_META_WORDS.has(term))
    .join(' ');
}

function isCategory(recipe: Recipe, vietnamese: string, english: string) {
  const category = normalizeSearchText(recipe.category);
  return category === normalizeSearchText(vietnamese) || category === normalizeSearchText(english);
}

export function matchesRecipeCategory(recipe: { category: string }, categories: string[]) {
  const category = normalizeSearchText(recipe.category);
  return categories.some((candidate) => category === normalizeSearchText(candidate));
}

function isVegetarianRecipe(recipe: Recipe) {
  return (
    isCategory(recipe, 'Món chay', 'Vegetarian dishes') ||
    recipe.tags.some(
      (tag) => matchesSearch('món chay', [tag]) || matchesSearch('vegetarian', [tag]),
    )
  );
}

function isVegetableRecipe(recipe: Recipe) {
  return (
    isCategory(recipe, 'Món rau', 'Vegetable dishes') ||
    recipe.tags.some(
      (tag) => matchesSearch('món rau', [tag]) || matchesSearch('vegetable dish', [tag]),
    )
  );
}

function isLightRecipe(recipe: Recipe) {
  const taggedLight = recipe.tags.some((tag) =>
    LIGHT_TAGS.some((keyword) => matchesSearch(keyword, [tag])),
  );
  if (taggedLight) return true;

  const categoryIsLightBase =
    isCategory(recipe, 'Món canh', 'Soup') ||
    isCategory(recipe, 'Món rau', 'Vegetable dishes') ||
    isCategory(recipe, 'Món chay', 'Vegetarian dishes');
  if (!categoryIsLightBase) return false;

  const heavyDishText = normalizeSearchText(
    [
      recipe.name,
      ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.name)),
      ...recipe.tags,
    ].join(' '),
  );
  return !/\b(?:chien|ran|quay|cream|kem beo|nuoc cot dua|thit ba chi|thit mo|chan gio|heo quay|thit quay|vit quay|pha lau|fried|crispy|fatty|butter|deep fry|deep fried)\b/.test(
    heavyDishText,
  );
}

// So khớp có dấu để “cá” không lẫn “cà”, “cua” không lẫn “của”, “sò” không lẫn “số”.
const SEAFOOD_VI_PATTERN =
  /(?<![\p{L}\p{N}])(?:cá|tôm|tép|mực|cua|ghẹ|nghêu|ngao|sò|ốc|hàu|hến|bạch tuộc|sứa)(?![\p{L}\p{N}])/u;
// Nấm sò/nấm hàu (oyster mushroom) và các loại mắm, nước sốt không phải món hải sản.
const SEAFOOD_LOOKALIKE_VI =
  /(?:nấm (?:sò|hàu)|mắm (?:tôm|ruốc|cua|tép|cái|cá|nêm)|dầu hào|nước mắm)/gu;
const SEAFOOD_LOOKALIKE_EN =
  /\b(?:(?:king\s+)?oyster\s+mushrooms?|oyster\s+sauce|(?:fermented\s+)?(?:fish|crab|shrimp|anchovy)\s+(?:ferment(?:ed)?\s+)?(?:sauce|paste|dip))\b/g;

function isSeafoodRecipe(recipe: Recipe) {
  if (isVegetarianRecipe(recipe)) return false;
  // Khớp nguyên cụm để thẻ “đặc sản Hải Phòng” không bị hiểu là “hải sản”.
  if (recipe.tags.some((tag) => /(?:^| )(?:hải sản|seafood)(?: |$)/u.test(accentSearchText(tag))))
    return true;

  const ingredients = recipe.ingredients.flatMap((group) =>
    group.items
      .filter((item) => !CONDIMENT_PATTERN.test(normalizeSearchText(`${group.group} ${item.name}`)))
      .map((item) => item.name),
  );
  const vietnamese = [recipe.name, ...(recipe.aliases ?? []), ...ingredients].map((value) =>
    accentSearchText(value).replace(SEAFOOD_LOOKALIKE_VI, ' '),
  );
  if (vietnamese.some((value) => SEAFOOD_VI_PATTERN.test(value))) return true;
  // Giao diện tiếng Anh: tên và nguyên liệu đã dịch.
  const english = [...(englishRecipes[recipe.slug]?.names ?? []), ...ingredients];
  return english.some((name) =>
    SEAFOOD_PATTERN.test(normalizeSearchText(name).replace(SEAFOOD_LOOKALIKE_EN, ' ')),
  );
}

function isChickenRecipe(recipe: Recipe) {
  const ingredients = recipe.ingredients.flatMap((group) =>
    group.items
      .filter((item) => !EGG_PATTERN.test(normalizeSearchText(item.name)))
      .map((item) => item.name),
  );
  const names = [
    recipe.name,
    ...(recipe.aliases ?? []),
    ...(englishRecipes[recipe.slug]?.names ?? []),
  ].map((name) => normalizeSearchText(name).replace(/\b(?:trung\s+ga|chicken\s+eggs?)\b/g, ' '));
  return [...names, ...ingredients].some((value) => {
    const normalized = normalizeSearchText(value);
    return (
      !/^(?:trung ga|egg|eggs|chicken egg)$/.test(normalized) && CHICKEN_PATTERN.test(normalized)
    );
  });
}

function hasIngredientOrName(recipe: Recipe, pattern: RegExp, englishNames: string[] = []) {
  const names = [recipe.name, ...(recipe.aliases ?? []), ...englishNames];
  const ingredients = recipe.ingredients.flatMap((group) => group.items.map((item) => item.name));
  return [...names, ...ingredients, ...(englishRecipes[recipe.slug]?.ingredients ?? [])].some(
    (value) => pattern.test(normalizeSearchText(value)),
  );
}

function isPorkRecipe(recipe: Recipe) {
  return hasIngredientOrName(
    recipe,
    /\b(?:thit\s+(?:heo|lon)|ba\s+chi|pork|pig)\b/,
    englishRecipes[recipe.slug]?.names,
  );
}

function isBeefRecipe(recipe: Recipe) {
  return hasIngredientOrName(
    recipe,
    /\b(?:thit\s+bo|beef|brisket|steak)\b/,
    englishRecipes[recipe.slug]?.names,
  );
}

function isDuckRecipe(recipe: Recipe) {
  return hasIngredientOrName(
    recipe,
    /\b(?:vit|ngan|duck|muscovy)\b/,
    englishRecipes[recipe.slug]?.names,
  );
}

function isSnackRecipe(recipe: Recipe) {
  return (
    isCategory(recipe, 'Món ăn vặt', 'Snacks') ||
    recipe.tags.some((tag) =>
      ['ăn vặt', 'ăn nhẹ', 'snack', 'street food', 'street snack'].some((keyword) =>
        matchesSearch(keyword, [tag]),
      ),
    )
  );
}

function isDessertRecipe(recipe: Recipe) {
  return (
    isCategory(recipe, 'Món tráng miệng', 'Desserts') ||
    recipe.tags.some((tag) =>
      ['tráng miệng', 'món ngọt', 'dessert', 'sweet dish'].some((keyword) =>
        matchesSearch(keyword, [tag]),
      ),
    )
  );
}

function isRegion(recipe: Recipe, region: 'Bắc' | 'Trung' | 'Nam') {
  const exactRegions = {
    Bắc: ['bac', 'north', 'northern', 'northern vietnam'],
    Trung: ['trung', 'central', 'central vietnam'],
    Nam: ['nam', 'south', 'southern', 'southern vietnam'],
  }[region];
  const regionalCues = {
    Bắc: [
      'red river delta',
      'dong bang song hong',
      'dong bang bac bo',
      'trung du va mien nui bac bo',
      'trung du mien nui phia bac',
      'dong bac bo',
      'dong bac',
      'tay bac bo',
      'tay bac',
      'hanoi',
      'hai phong',
      'quang ninh',
      'cao bang',
      'lang son',
      'bac giang',
      'thai nguyen',
      'phu tho',
      'yen bai',
      'lao cai',
      'dien bien',
      'son la',
      'hoa binh',
      'tuyen quang',
      'nam dinh',
      'ninh binh',
      'thai binh',
      'hai duong',
      'hung yen',
      'bac ninh',
      'ha nam',
    ],
    Trung: [
      'bac trung bo',
      'nam trung bo',
      'duyen hai nam trung bo',
      'duyen hai mien trung',
      'trung bo',
      'central coast',
      'tay nguyen',
      'thanh hoa',
      'nghe an',
      'ha tinh',
      'quang binh',
      'quang tri',
      'hue',
      'thua thien hue',
      'da nang',
      'quang nam',
      'quang ngai',
      'binh dinh',
      'phu yen',
      'khanh hoa',
      'ninh thuan',
      'binh thuan',
      'gia lai',
      'kon tum',
      'dak lak',
      'dak nong',
      'lam dong',
    ],
    Nam: [
      'dong nam bo',
      'dong bang song cuu long',
      'nam bo',
      'tay nam bo',
      'mien tay',
      'mekong delta',
      'southeast vietnam',
      'ho chi minh',
      'sai gon',
      'binh phuoc',
      'tay ninh',
      'binh duong',
      'dong nai',
      'ba ria',
      'vung tau',
      'long an',
      'tien giang',
      'ben tre',
      'tra vinh',
      'vinh long',
      'dong thap',
      'an giang',
      'kien giang',
      'can tho',
      'hau giang',
      'soc trang',
      'bac lieu',
      'ca mau',
    ],
  }[region];
  const regions = [recipe.region, ...(recipe.regions ?? []), ...(recipe.provinces ?? [])]
    .map(normalizeSearchText)
    .filter(Boolean);
  return (
    regions.some((value) => exactRegions.includes(value)) ||
    regionalCues.some((cue) => regions.some((value) => value === cue || value.includes(cue)))
  );
}

type RecipeQuery = {
  filters: ((item: Recipe) => boolean)[];
  /** Phần chữ còn lại sau khi tách chủ đề, giữ nguyên dấu người dùng gõ. */
  text: string;
  /** Có chủ đề và còn chữ: món khớp nguyên câu theo tên cũng được nhận (“bánh canh”). */
  matchWholeQuery: boolean;
};

const recipeQueryCache = new Map<string, RecipeQuery>();

/** Giữ lại các từ gốc (có dấu) tương ứng với chuỗi không dấu còn lại sau khi tách chủ đề. */
function keepAccentedWords(query: string, remaining: string) {
  const wanted = remaining.split(' ').filter(Boolean);
  const kept: string[] = [];
  let position = 0;
  for (const token of searchTokens(query)) {
    if (token.norm !== wanted[position]) continue;
    kept.push(token.accented);
    position += 1;
  }
  return position === wanted.length ? kept.join(' ') : remaining;
}

function parseRecipeQuery(query: string): RecipeQuery {
  const cached = recipeQueryCache.get(query);
  if (cached) return cached;
  let remainingQuery = normalizeSearchText(query);
  const filters: ((item: Recipe) => boolean)[] = [];

  for (const [facet, pattern] of Object.entries(FACET_PATTERNS)) {
    if (!pattern.test(remainingQuery)) continue;
    remainingQuery = remainingQuery.replace(pattern, ' ').replace(/\s+/g, ' ').trim();
    if (facet === 'vegetarian') filters.push(isVegetarianRecipe);
    if (facet === 'light') filters.push(isLightRecipe);
    if (facet === 'seafood') filters.push(isSeafoodRecipe);
    if (facet === 'soup') filters.push((item) => isCategory(item, 'Món canh', 'Soup'));
    if (facet === 'vegetable') filters.push(isVegetableRecipe);
    if (facet === 'chicken') filters.push(isChickenRecipe);
    if (facet === 'pork') filters.push(isPorkRecipe);
    if (facet === 'beef') filters.push(isBeefRecipe);
    if (facet === 'duck') filters.push(isDuckRecipe);
    if (facet === 'breakfast')
      filters.push((item) => isCategory(item, 'Món ăn sáng', 'Breakfast dishes'));
    if (facet === 'dessert') filters.push(isDessertRecipe);
    if (facet === 'snack') filters.push(isSnackRecipe);
    if (facet === 'easy') {
      filters.push((item) => ['de', 'easy'].includes(normalizeSearchText(item.difficulty)));
    }
    if (facet === 'quick') filters.push((item) => recipeMinutes(item) <= 30);
  }

  const regionMatch = remainingQuery.match(
    /\b(?:mon\s+)?mien\s+(bac|trung|nam)\b|\b(northern|north|central|southern|south)(?:\s+vietnam)?\b/,
  );
  if (regionMatch) {
    const value = regionMatch[1] ?? regionMatch[2];
    const region =
      value === 'bac' || value === 'northern' || value === 'north'
        ? 'Bắc'
        : value === 'trung' || value === 'central'
          ? 'Trung'
          : 'Nam';
    filters.push((item) => isRegion(item, region));
    remainingQuery = remainingQuery.replace(regionMatch[0], ' ').replace(/\s+/g, ' ').trim();
  }

  const timeMatch = remainingQuery.match(TIME_QUERY_PATTERN);
  if (timeMatch) {
    const maxMinutes = Number(timeMatch[1]);
    filters.push((item) => recipeMinutes(item) <= maxMinutes);
    remainingQuery = remainingQuery.replace(timeMatch[0], ' ').replace(/\s+/g, ' ').trim();
    remainingQuery = remainingQuery
      .split(' ')
      .filter(
        (term) =>
          ![
            'mon',
            'nau',
            'cook',
            'ready',
            'under',
            'within',
            'up',
            'to',
            'no',
            'more',
            'than',
            'duoi',
            'trong',
            'toi',
            'da',
            'khong',
            'qua',
            'in',
          ].includes(term),
      )
      .join(' ');
  }

  const queryWithoutMetaWords = stripSearchMetaWords(remainingQuery);
  if (queryWithoutMetaWords || filters.length > 0) remainingQuery = queryWithoutMetaWords;
  const parsed: RecipeQuery = {
    filters,
    text: filters.length > 0 ? keepAccentedWords(query, remainingQuery) : query,
    matchWholeQuery:
      filters.length > 0 && remainingQuery.length > 0 && parseQuery(query).terms.length > 1,
  };
  if (recipeQueryCache.size > 200) recipeQueryCache.clear();
  recipeQueryCache.set(query, parsed);
  return parsed;
}

/**
 * Món có khớp từ khóa không. `pool` là danh mục dùng để quyết định có cần bậc dự phòng
 * (tiền tố/gõ sai) hay không: chỉ dùng khi không món nào trong danh mục khớp chính xác.
 */
export function matchesRecipeSearch(
  recipe: Recipe,
  query: string,
  pool: readonly Recipe[] = getRecipeCatalog(),
) {
  const { filters, text, matchWholeQuery } = parseRecipeQuery(query);
  if (matchWholeQuery && matchesSearchText(recipe, query, pool)) return true;
  // Chủ đề (gà, canh, rau…) đã thay cho từ kiểu nguyên liệu: các từ còn lại phải nằm trong tên.
  return (
    matchesSearchText(recipe, text, pool, filters.length > 0) &&
    filters.every((matchesFacet) => matchesFacet(recipe))
  );
}

export function matchesRecipeRegion(recipe: Recipe, region: string) {
  return region === 'Ba miền'
    ? normalizeSearchText(recipe.region) === normalizeSearchText(region) ||
        recipe.regions?.some(
          (value) => normalizeSearchText(value) === normalizeSearchText(region),
        ) === true
    : ['Bắc', 'Trung', 'Nam'].includes(region)
      ? isRegion(recipe, region as 'Bắc' | 'Trung' | 'Nam')
      : false;
}

/** Chữ thường giữ dấu, dùng để so khớp có dấu (“cá” khác “cà”, “sò” khác “số”). */
function accentSearchText(value: string) {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/*
 * Tìm kiếm chặt theo tên món:
 * - Mỗi từ khóa phải khớp NGUYÊN TỪ trong cùng một tên món (tên chính, tên tiếng Anh hoặc tên gọi
 *   khác). Từ có dấu so đúng dấu (“cà” ≠ “cá”, “cua” có dấu ≠ “của”); từ không dấu khớp mọi dấu.
 * - Nguyên liệu/thẻ chỉ được tính cho đúng MỘT từ khóa kiểu nguyên liệu (cá, gà, bò, tôm…) khi
 *   mọi từ còn lại đã khớp tên, hoặc khi cả cụm từ khóa nằm liền trong một nguyên liệu/thẻ/vùng
 *   (“lá trà xanh”, “thịt bò”, “Hà Nội”). Một từ đơn (“gà”) vẫn tìm cả theo nguyên liệu.
 * - Bậc dự phòng chỉ dùng khi bậc chặt hơn không có món nào trong danh mục:
 *   bậc 1: tiền tố của từ cuối đang gõ (≥3 ký tự; ≥2 nếu đã có từ trước, ví dụ “bun bo hu”),
 *          trừ khi từ cuối đã là một từ trọn vẹn trong tên món (“kho” không mở rộng thành “khoai”);
 *   bậc 2: bỏ qua dấu và chấp nhận sai một ký tự với từ ≥5 chữ (“phơ bo”, “ca cheep”);
 *   bậc 3: như bậc 2, thêm tiền tố của từ cuối.
 */
type Tier = 0 | 1 | 2 | 3;
const TIERS: readonly Tier[] = [0, 1, 2, 3];
const WHOLE_WORD_TIERS: readonly Tier[] = [0, 2];
const usesPrefix = (tier: Tier) => tier === 1 || tier === 3;

type SearchField = { tokens: SearchToken[]; norms: string[]; keys: string[] };
type SearchIndex = {
  names: SearchField[];
  aliases: SearchField[];
  allNames: SearchField[];
  vietnameseNameKeys: string[];
  /** Mọi từ của món (không trùng): loại nhanh món không thể khớp ở bậc dự phòng. */
  vocabulary: SearchToken[];
  vocabularyNorms: Set<string>;
  vocabularyKeys: Set<string>;
  /** Chỉ tên nguyên liệu: dùng cho một từ kiểu nguyên liệu khi các từ còn lại khớp tên. */
  ingredient: SearchField;
  /** Nguyên liệu, thẻ, loại món: dùng khi từ khóa chỉ có một từ (“gà”). */
  broad: SearchField;
  broadNorms: Set<string>;
  broadKeys: Set<string>;
  /** Nguyên liệu, thẻ, loại món, vùng miền: chỉ khớp khi cả cụm nằm liền trong một mục. */
  phrases: SearchField[];
};
/** `exact`: câu tìm có dấu nên mọi từ so đúng dấu, kể cả từ gõ không dấu (“thịt kho” ≠ “khổ”). */
type QueryTerm = SearchToken & { ingredientLike: boolean; exact: boolean };
type ParsedQuery = { terms: QueryTerm[]; hasDiacritics: boolean };

// Từ khóa chỉ nguyên liệu chính. “ca”, “dau”, “so” không dấu quá mơ hồ (cà chua, dầu ăn, số).
const INGREDIENT_WORDS = new Set(
  [
    'cá',
    'gà',
    'bò',
    'heo',
    'lợn',
    'vịt',
    'ngan',
    'tôm',
    'tép',
    'cua',
    'ghẹ',
    'mực',
    'ốc',
    'sò',
    'nghêu',
    'ngao',
    'hến',
    'hàu',
    'trứng',
    'sườn',
    'đậu',
    'nấm',
    'ếch',
    'lươn',
    'chim',
    'cút',
    'dê',
    'chicken',
    'beef',
    'pork',
    'fish',
    'shrimp',
    'prawn',
    'prawns',
    'crab',
    'squid',
    'egg',
    'eggs',
    'tofu',
    'duck',
    'mushroom',
    'mushrooms',
    'clams',
    'snails',
    'goat',
  ].map(accentKey),
);
const AMBIGUOUS_UNACCENTED = new Set(['ca', 'dau', 'so']);
const UNACCENTED_INGREDIENT_WORDS = new Set(
  [...INGREDIENT_WORDS].map(normalizeSearchText).filter((word) => !AMBIGUOUS_UNACCENTED.has(word)),
);

function searchField(value: string): SearchField {
  const tokens = searchTokens(value);
  return {
    tokens,
    norms: tokens.map((token) => token.norm),
    keys: tokens.map((token) => token.key),
  };
}

// Chỉ mục tính một lần cho mỗi món; tìm kiếm chạy lại ở mỗi lần gõ phím.
let rankDataCache = new WeakMap<Recipe, SearchIndex>();

function recipeSearchIndex(recipe: Recipe): SearchIndex {
  const cached = rankDataCache.get(recipe);
  if (cached) return cached;
  const english = englishRecipes[recipe.slug];
  const englishNames = english?.names ?? [];
  const aliases = [...(recipe.aliases ?? [])];
  // Giao diện tiếng Anh đặt tên Việt gốc ở cuối danh sách tên gọi khác: vẫn coi là tên chính.
  const primary = [recipe.name, ...englishNames];
  if (englishNames.includes(recipe.name) && aliases.length > 0) primary.push(aliases.pop()!);
  const ingredientNames = [
    ...recipe.ingredients.flatMap((group) => group.items.map((ingredient) => ingredient.name)),
    ...(english?.ingredients ?? []),
  ];
  const ingredientTexts = [
    recipe.category,
    recipe.ingredientCategory ?? '',
    ...recipe.tags,
    ...ingredientNames,
  ].filter(Boolean);
  const broad = searchField(ingredientTexts.join(' · '));
  const names = primary.map(searchField).filter((field) => field.tokens.length > 0);
  const aliasFields = aliases.map(searchField).filter((field) => field.tokens.length > 0);
  const data: SearchIndex = {
    names,
    aliases: aliasFields,
    allNames: [...names, ...aliasFields],
    // Tên tiếng Anh viết không dấu (“Hu tieu”) không được làm “hu” thành từ trọn vẹn.
    vietnameseNameKeys: [recipe.name, ...(recipe.aliases ?? [])]
      .filter((name) => !englishNames.includes(name))
      .flatMap((name) => searchField(name).keys),
    vocabulary: [],
    vocabularyNorms: new Set(),
    vocabularyKeys: new Set(),
    ingredient: searchField(ingredientNames.join(' · ')),
    broad,
    broadNorms: new Set(broad.norms),
    broadKeys: new Set(broad.keys),
    phrases: [
      ...ingredientTexts,
      recipe.region,
      ...(recipe.regions ?? []),
      ...(recipe.provinces ?? []),
    ]
      .map(searchField)
      .filter((field) => field.tokens.length > 0),
  };
  const unique = new Map<string, SearchToken>();
  for (const field of [...data.allNames, broad, ...data.phrases])
    for (const token of field.tokens) unique.set(token.key, token);
  data.vocabulary = [...unique.values()];
  data.vocabularyNorms = new Set(data.vocabulary.map((token) => token.norm));
  data.vocabularyKeys = new Set(unique.keys());
  rankDataCache.set(recipe, data);
  return data;
}

const parsedQueryCache = new Map<string, ParsedQuery>();

function parseQuery(query: string): ParsedQuery {
  const cached = parsedQueryCache.get(query);
  if (cached) return cached;
  const tokens = searchTokens(query);
  const meaningful = tokens.filter((token) => !SEARCH_META_WORDS.has(token.norm));
  const picked = meaningful.length > 0 ? meaningful : tokens;
  const exact = picked.some((token) => token.hasDiacritics);
  const terms = picked.map((token) => ({
    ...token,
    exact,
    ingredientLike: exact
      ? INGREDIENT_WORDS.has(token.key)
      : UNACCENTED_INGREDIENT_WORDS.has(token.norm),
  }));
  const parsed = { terms, hasDiacritics: exact };
  if (parsedQueryCache.size > 200) parsedQueryCache.clear();
  parsedQueryCache.set(query, parsed);
  return parsed;
}

function isSynonym(term: string, word: string) {
  return (term === 'sao' && word === 'xao') || (term === 'xao' && word === 'sao');
}

function prefixAllowed(term: QueryTerm, isLast: boolean, termCount: number) {
  return isLast && term.norm.length >= (termCount > 1 ? 2 : 3);
}

/** Một từ khóa có khớp một từ của món ở bậc `tier` không. */
function termMatchesToken(
  term: QueryTerm,
  token: SearchToken,
  tier: Tier,
  isLast: boolean,
  termCount: number,
) {
  if (tier < 2) {
    if (term.exact ? token.key === term.key : token.norm === term.norm) return true;
    if (!term.exact && isSynonym(term.norm, token.norm)) return true;
    if (tier === 0 || !prefixAllowed(term, isLast, termCount)) return false;
    return term.exact
      ? token.accented.startsWith(term.accented) || token.key.startsWith(term.key)
      : token.norm.startsWith(term.norm);
  }
  if (token.norm === term.norm || isSynonym(term.norm, token.norm)) return true;
  if (
    usesPrefix(tier) &&
    prefixAllowed(term, isLast, termCount) &&
    token.norm.startsWith(term.norm)
  )
    return true;
  return term.norm.length >= FUZZY_MIN_LENGTH && oneEditApart(term.norm, token.norm);
}

function termInField(term: QueryTerm, field: SearchField, tier: Tier, isLast: boolean, n: number) {
  // Bậc 0 tra mảng chuỗi cho nhanh; bậc dự phòng mới duyệt từng từ.
  if (tier === 0) {
    if (term.exact) return field.keys.includes(term.key);
    return (
      field.norms.includes(term.norm) ||
      ((term.norm === 'sao' || term.norm === 'xao') &&
        field.norms.includes(term.norm === 'sao' ? 'xao' : 'sao'))
    );
  }
  return field.tokens.some((token) => termMatchesToken(term, token, tier, isLast, n));
}

function fieldHasTerms(field: SearchField, terms: QueryTerm[], tier: Tier, skip = -1) {
  const last = terms.length - 1;
  return terms.every(
    (term, index) => index === skip || termInField(term, field, tier, index === last, terms.length),
  );
}

function fieldHasPhrase(field: SearchField, terms: QueryTerm[], tier: Tier) {
  const last = terms.length - 1;
  const { tokens } = field;
  for (let start = 0; start + terms.length <= tokens.length; start += 1) {
    if (
      terms.every((term, offset) =>
        termMatchesToken(term, tokens[start + offset]!, tier, offset === last, terms.length),
      )
    )
      return true;
  }
  return false;
}

function broadHasTerm(index: SearchIndex, term: QueryTerm, tier: Tier) {
  if (tier === 0)
    return term.exact ? index.broadKeys.has(term.key) : index.broadNorms.has(term.norm);
  return termInField(term, index.broad, tier, true, 1);
}

type TextMatch = 'name' | 'alias' | 'mixed' | 'phrase' | 'ingredient';

function hasWordExactly(index: SearchIndex, term: QueryTerm) {
  if (term.exact) return index.vocabularyKeys.has(term.key);
  if (index.vocabularyNorms.has(term.norm)) return true;
  return (
    (term.norm === 'sao' && index.vocabularyNorms.has('xao')) ||
    (term.norm === 'xao' && index.vocabularyNorms.has('sao'))
  );
}

/**
 * Kiểu khớp chữ của món ở bậc `tier`. `namesOnly`: chỉ tên/tên gọi khác (và cụm từ ≥2 từ),
 * dùng khi một từ đã được thay bằng bộ lọc chủ đề.
 */
function textMatchAt(
  index: SearchIndex,
  terms: QueryTerm[],
  tier: Tier,
  namesOnly = false,
): TextMatch | null {
  const last = terms.length - 1;
  // Loại nhanh: phần lớn món thiếu hẳn một từ khóa, chỉ cần tra Set.
  if (tier === 0 && !terms.every((term) => hasWordExactly(index, term))) return null;
  if (
    tier > 0 &&
    !terms.every((term, position) =>
      index.vocabulary.some((token) =>
        termMatchesToken(term, token, tier, position === last, terms.length),
      ),
    )
  )
    return null;
  if (index.names.some((field) => fieldHasTerms(field, terms, tier))) return 'name';
  if (index.aliases.some((field) => fieldHasTerms(field, terms, tier))) return 'alias';
  // Khớp qua nguyên liệu/thẻ không dùng tiền tố đang gõ dở: tránh “gà ran” → “Cơm rang”.
  if (terms.length === 1 && !namesOnly) {
    return broadHasTerm(index, terms[0]!, tier) ? 'ingredient' : null;
  }
  if (usesPrefix(tier) || terms.length === 1) return null;
  for (let skip = 0; skip < terms.length; skip += 1) {
    const term = terms[skip]!;
    if (namesOnly || !term.ingredientLike) continue;
    if (!termInField(term, index.ingredient, tier, skip === last, terms.length)) continue;
    if (index.allNames.some((field) => fieldHasTerms(field, terms, tier, skip))) return 'mixed';
  }
  return index.phrases.some((field) => fieldHasPhrase(field, terms, tier)) ? 'phrase' : null;
}

type ActiveTier = { pool: readonly Recipe[]; version: number; tiers: readonly Tier[] };

// Từ vựng tên món của danh mục (khóa có dấu), để biết từ cuối đã là một từ trọn vẹn chưa.
let vocabularyCache: { pool: readonly Recipe[]; version: number; keys: Set<string> } | null = null;

function nameVocabulary(pool: readonly Recipe[]) {
  if (vocabularyCache?.pool === pool && vocabularyCache.version === englishIndexVersion)
    return vocabularyCache.keys;
  const keys = new Set<string>();
  for (const recipe of pool) {
    for (const key of recipeSearchIndex(recipe).vietnameseNameKeys) keys.add(key);
  }
  vocabularyCache = { pool, version: englishIndexVersion, keys };
  return keys;
}

const poolMemberCache = new WeakMap<readonly Recipe[], Set<Recipe>>();

function poolMembers(pool: readonly Recipe[]) {
  let members = poolMemberCache.get(pool);
  if (!members) {
    members = new Set(pool);
    poolMemberCache.set(pool, members);
  }
  return members;
}

// Một lần gõ có thể dùng hai câu (nguyên câu và phần sau khi tách chủ đề): nhớ theo từng câu.
const activeTierCache = new Map<string, ActiveTier>();

/**
 * Các bậc được dùng cho câu tìm: dừng ở bậc chặt nhất có ít nhất một món trong danh mục, nên
 * bậc dự phòng chỉ hiện ra khi bậc trên trống.
 */
function activeTiers(
  query: string,
  terms: QueryTerm[],
  pool: readonly Recipe[],
  namesOnly: boolean,
) {
  const cacheKey = `${namesOnly ? 'n' : 'a'}|${query}`;
  const cache = activeTierCache.get(cacheKey);
  if (cache?.pool === pool && cache.version === englishIndexVersion) return cache.tiers;
  const lastTerm = terms[terms.length - 1]!;
  // So bằng khóa có dấu: “hu” không dấu chưa phải từ trọn vẹn dù tên có “Hủ”, “Huế”.
  const lastIsWord = nameVocabulary(pool).has(lastTerm.key);
  const allowed = lastIsWord ? WHOLE_WORD_TIERS : TIERS;
  let tiers: readonly Tier[] = [];
  for (const [position, candidate] of allowed.entries()) {
    if (
      pool.some((recipe) => textMatchAt(recipeSearchIndex(recipe), terms, candidate, namesOnly))
    ) {
      tiers = allowed.slice(0, position + 1);
      break;
    }
  }
  if (activeTierCache.size > 50) activeTierCache.clear();
  activeTierCache.set(cacheKey, { pool, version: englishIndexVersion, tiers });
  return tiers;
}

function matchesSearchText(
  recipe: Recipe,
  query: string,
  pool: readonly Recipe[],
  namesOnly = false,
) {
  const { terms } = parseQuery(query);
  if (terms.length === 0) return true;
  const index = recipeSearchIndex(recipe);
  // Chỉ thử đến bậc đang dùng: bậc dự phòng (tốn hơn) hầu như không phải chạy.
  // Danh sách đang lọc không nằm trong `pool` (dữ liệu riêng của trang/test): xét từng món.
  const active = activeTiers(query, terms, pool, namesOnly);
  const tiers = active.length > 0 || poolMembers(pool).has(recipe) ? active : TIERS;
  return tiers.some((tier) => textMatchAt(index, terms, tier, namesOnly));
}

function termsInOrder(field: SearchField, terms: QueryTerm[], tier: Tier) {
  let from = 0;
  const last = terms.length - 1;
  for (const [position, term] of terms.entries()) {
    let found = -1;
    for (let index = from; index < field.tokens.length; index += 1) {
      if (termMatchesToken(term, field.tokens[index]!, tier, position === last, terms.length)) {
        found = index;
        break;
      }
    }
    if (found < 0) return false;
    from = found + 1;
  }
  return true;
}

function phraseAt(field: SearchField, terms: QueryTerm[], tier: Tier, start: number) {
  const last = terms.length - 1;
  return terms.every((term, offset) => {
    const token = field.tokens[start + offset];
    return (
      token !== undefined && termMatchesToken(term, token, tier, offset === last, terms.length)
    );
  });
}

// Bậc điểm cách nhau ≥ 40 để điểm cộng đúng dấu (≤ 20) và độ dài tên (≤ 9) không vượt bậc.
function nameScore(field: SearchField, terms: QueryTerm[], tier: Tier) {
  if (!fieldHasTerms(field, terms, tier)) return 0;
  const length = field.tokens.length;
  let score: number;
  if (phraseAt(field, terms, tier, 0)) score = length === terms.length ? 1000 : 850;
  else if (field.tokens.some((_, start) => phraseAt(field, terms, tier, start))) score = 720;
  else score = termsInOrder(field, terms, tier) ? 680 : 640;
  // Từ không dấu khớp cả “cá” lẫn “cà”: ưu tiên tên viết đúng dấu như từ khóa.
  if (tier > 0 && terms.some((term) => term.exact) && fieldHasTerms(field, terms, 0)) score += 20;
  return score - Math.min(9, Math.max(0, length - terms.length));
}

function textScore(index: SearchIndex, terms: QueryTerm[], tier: Tier) {
  let best = 0;
  for (const field of index.names) best = Math.max(best, nameScore(field, terms, tier));
  if (best) return best;
  // Tên gọi khác luôn xếp sau mọi kiểu khớp tên chính.
  for (const field of index.aliases)
    best = Math.max(best, Math.round(nameScore(field, terms, tier) / 2));
  if (best) return best;
  const match = textMatchAt(index, terms, tier);
  if (match === 'mixed') return 310;
  if (match === 'phrase') {
    const exact = index.phrases.some(
      (field) => field.tokens.length === terms.length && fieldHasPhrase(field, terms, tier),
    );
    return exact ? 300 : 290;
  }
  return match === 'ingredient' ? 280 : 0;
}

/**
 * Điểm liên quan: trùng tên > tên bắt đầu bằng cụm từ > tên chứa cụm từ > đủ các từ trong tên
 * (đúng thứ tự hơn) > tên gọi khác > nguyên liệu chính + tên > nguyên liệu/thẻ/vùng.
 * Khớp tiền tố từ cuối (bậc 1) và khớp gần đúng (bậc 2, 3) luôn xếp sau mọi khớp chính xác.
 */
export function recipeSearchRank(recipe: Recipe, query: string) {
  const { terms } = parseQuery(query);
  if (terms.length === 0) return 0;
  const index = recipeSearchIndex(recipe);
  for (const tier of TIERS) {
    const score = textScore(index, terms, tier);
    if (!score) continue;
    if (tier === 0) return score;
    return tier === 1 ? 150 + Math.round(score / 20) : 100 + Math.round(score / 25) - tier;
  }
  // Khớp nhờ chủ đề (gà, món chay, 30 phút…) mà không khớp chữ.
  return matchesRecipeSearch(recipe, query) ? 50 : 0;
}
