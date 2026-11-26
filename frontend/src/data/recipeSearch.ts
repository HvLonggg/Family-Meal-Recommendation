import { useSyncExternalStore } from 'react';

import { recipeMinutes, type Recipe } from '@/data/recipes';
import { matchesSearch, normalizeSearchText } from '@/lib/search';

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

function recipeFields(recipe: Recipe) {
  const english = englishRecipes[recipe.slug];
  return [
    recipe.name,
    recipe.excerpt,
    recipe.category,
    recipe.region,
    `${recipeMinutes(recipe)} phút`,
    `${recipeMinutes(recipe)} minutes`,
    ...(recipe.aliases ?? []),
    ...(recipe.regions ?? []),
    ...(recipe.provinces ?? []),
    recipe.ingredientCategory ?? '',
    ...recipe.tags,
    ...recipe.ingredients.flatMap((group) => [
      group.group,
      ...group.items.map((ingredient) => ingredient.name),
    ]),
    ...(english?.names ?? []),
    ...(english?.ingredients ?? []),
    ...(english?.fields ?? []),
  ];
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

export function matchesRecipeSearch(recipe: Recipe, query: string) {
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
  const matchesText = !remainingQuery || matchesSearch(remainingQuery, recipeFields(recipe));
  return matchesText && filters.every((matchesFacet) => matchesFacet(recipe));
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

/** Chữ thường giữ dấu, dùng để ưu tiên món khớp đúng dấu (“phở” trước “phổ”). */
function accentSearchText(value: string) {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

type RankText = { normalized: string; words: string[]; accented: string; accentedWords: string[] };
type RankData = { names: RankText[]; aliases: RankText[]; strong: string[]; weak: string[] };
type RankQuery = {
  normalized: string;
  terms: string[];
  accented: string;
  accentedTerms: string[];
  hasDiacritics: boolean;
};

function rankText(value: string): RankText {
  const normalized = normalizeSearchText(value);
  const accented = accentSearchText(value);
  return {
    normalized,
    words: normalized.split(' ').filter(Boolean),
    accented,
    accentedWords: accented.split(' ').filter(Boolean),
  };
}

// Dữ liệu xếp hạng tính một lần cho mỗi món; tìm kiếm chạy lại ở mỗi lần gõ phím.
let rankDataCache = new WeakMap<Recipe, RankData>();

function recipeRankData(recipe: Recipe): RankData {
  const cached = rankDataCache.get(recipe);
  if (cached) return cached;
  const english = englishRecipes[recipe.slug];
  const englishNames = english?.names ?? [];
  const aliases = [...(recipe.aliases ?? [])];
  // Giao diện tiếng Anh đặt tên Việt gốc ở cuối danh sách tên gọi khác: vẫn coi là tên chính.
  const primary = [recipe.name, ...englishNames];
  if (englishNames.includes(recipe.name) && aliases.length > 0) primary.push(aliases.pop()!);
  const data: RankData = {
    names: primary.map(rankText).filter((item) => item.normalized),
    aliases: aliases.map(rankText).filter((item) => item.normalized),
    strong: [
      recipe.category,
      recipe.ingredientCategory ?? '',
      ...recipe.tags,
      ...recipe.ingredients.flatMap((group) => group.items.map((ingredient) => ingredient.name)),
      ...(english?.ingredients ?? []),
    ]
      .map(normalizeSearchText)
      .filter(Boolean),
    weak: [
      recipe.excerpt,
      recipe.region,
      ...(recipe.regions ?? []),
      ...(recipe.provinces ?? []),
      ...recipe.ingredients.map((group) => group.group),
      ...(english?.fields ?? []),
    ]
      .map(normalizeSearchText)
      .filter(Boolean),
  };
  rankDataCache.set(recipe, data);
  return data;
}

let lastRankQuery: { raw: string; parsed: RankQuery } | null = null;

function parseRankQuery(raw: string): RankQuery {
  if (lastRankQuery?.raw === raw) return lastRankQuery.parsed;
  const normalized = normalizeSearchText(raw);
  const accented = accentSearchText(raw);
  const parsed = {
    normalized,
    terms: normalized.split(' ').filter(Boolean),
    accented,
    accentedTerms: accented.split(' ').filter(Boolean),
    hasDiacritics: accented !== normalized,
  };
  lastRankQuery = { raw, parsed };
  return parsed;
}

function termsInOrder(words: string[], terms: string[]) {
  let from = 0;
  for (const term of terms) {
    const index = words.indexOf(term, from);
    if (index < 0) return false;
    from = index + 1;
  }
  return true;
}

// Bậc điểm cách nhau ≥ 40 để điểm cộng đúng dấu (≤ 30) và độ dài tên (≤ 9) không vượt bậc.
function nameScore(name: RankText, query: RankQuery) {
  const { normalized, words } = name;
  const phrase = query.normalized;
  let score: number;
  if (normalized === phrase) score = 1000;
  else if (normalized.startsWith(`${phrase} `)) score = 850;
  else if (` ${normalized} `.includes(` ${phrase} `)) score = 720;
  else if (query.terms.every((term) => words.includes(term)))
    score = termsInOrder(words, query.terms) ? 680 : 640;
  // Từ cuối đang gõ dở, ví dụ “pho b” → “Phở bò”.
  else if (normalized.startsWith(phrase)) score = 600;
  else if (phrase.length >= 3 && normalized.includes(phrase)) score = 560;
  else return 0;
  if (query.hasDiacritics) {
    if (` ${name.accented} `.includes(` ${query.accented} `)) score += 30;
    else if (query.accentedTerms.every((term) => name.accentedWords.includes(term))) score += 20;
  }
  return score - Math.min(9, Math.max(0, words.length - query.terms.length));
}

function fieldScore(fields: string[], query: RankQuery) {
  const phrase = ` ${query.normalized} `;
  if (fields.some((field) => field === query.normalized)) return 40;
  if (fields.some((field) => ` ${field} `.includes(phrase))) return 30;
  if (fields.some((field) => query.terms.every((term) => field.split(' ').includes(term))))
    return 20;
  return 0;
}

/**
 * Điểm liên quan: trùng tên > tên bắt đầu bằng cụm từ > đủ các từ trong tên (đúng thứ tự hơn)
 * > tên chứa cụm từ > tên gọi khác > thẻ/loại món/nguyên liệu > mô tả > khớp gần đúng.
 * Không phân biệt dấu khi so khớp nhưng ưu tiên tên viết đúng dấu như từ khóa.
 */
export function recipeSearchRank(recipe: Recipe, query: string) {
  const parsed = parseRankQuery(query);
  if (!parsed.normalized) return 0;
  const data = recipeRankData(recipe);
  let best = 0;
  for (const name of data.names) best = Math.max(best, nameScore(name, parsed));
  if (best >= 560) return best;
  // Tên gọi khác luôn xếp sau mọi kiểu khớp tên chính.
  for (const alias of data.aliases) best = Math.max(best, Math.round(nameScore(alias, parsed) / 2));
  if (best > 0) return best;
  const strong = fieldScore(data.strong, parsed);
  if (strong) return 300 + strong;
  const weak = fieldScore(data.weak, parsed);
  if (weak) return 200 + weak;
  // Gõ sai một ký tự chỉ là phương án dự phòng yếu.
  if (data.names.some((name) => matchesSearch(query, [name.normalized]))) return 150;
  return matchesRecipeSearch(recipe, query) ? 100 : 0;
}
