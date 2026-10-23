import englishSearchIndex from '@/data/recipeSearchEnglish.json';
import { recipeMinutes, type Recipe } from '@/data/recipes';
import { matchesSearch, normalizeSearchText } from '@/lib/search';

type EnglishSearchEntry = { names: string[]; ingredients: string[]; fields: string[] };
const englishRecipes = englishSearchIndex as Record<string, EnglishSearchEntry>;

const SEAFOOD_PATTERN =
  /(?:^| )(?:ca|tom|muc|cua|ghe|nghieu|ngao|so|oc|hau|bach tuoc|fish|shrimp|prawn|crab|squid|clam|mussel|oyster|octopus)(?=$| )/;
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
  /(?:(?:nau|cook|ready|under|within|up to|no more than|duoi|trong|toi da|khong qua)\s+)*(\d+)\s*(?:p|min|mins|minute|minutes|phut)\b/;
const FACET_PATTERNS = {
  vegetarian: /\b(?:mon\s+chay|do\s+chay|chay|vegetarian|vegan|plant\s+based)\b/,
  light: /\b(?:mon\s+thanh\s+dam|thanh\s+dam|thanh\s+mat|nhe\s+bung|nhieu\s+rau|it\s+dau|light|low\s+fat)\b/,
  seafood: /\b(?:mon\s+hai\s+san|hai\s+san|seafood)\b/,
  soup: /\b(?:mon\s+canh|canh|soup)\b/,
  vegetable: /\b(?:mon\s+rau|rau|vegetable|veggie)\b/,
  chicken: /\b(?:mon\s+ga|ga|chicken|poultry)\b/,
  breakfast: /\b(?:mon\s+an\s+sang|an\s+sang|breakfast)\b/,
  dessert: /\b(?:mon\s+trang\s+mieng|trang\s+mieng|dessert)\b/,
  snack: /\b(?:mon\s+an\s+vat|an\s+vat|snack|street\s+food)\b/,
  easy: /\b(?:mon\s+de\s+nau|de\s+nau|easy\s+to\s+cook|easy)\b/,
  quick: /\b(?:quick|quickly|nhanh\s+gon)\b/,
};

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

function isVegetarianRecipe(recipe: Recipe) {
  return (
    isCategory(recipe, 'Món chay', 'Vegetarian dishes') ||
    recipe.tags.some((tag) => matchesSearch('món chay', [tag]) || matchesSearch('vegetarian', [tag]))
  );
}

function isLightRecipe(recipe: Recipe) {
  const taggedLight = recipe.tags.some((tag) =>
    LIGHT_TAGS.some((keyword) => matchesSearch(keyword, [tag])),
  );
  if (taggedLight) return true;

  const categoryIsLightBase =
    isCategory(recipe, 'Món canh', 'Soup') || isCategory(recipe, 'Món rau', 'Vegetable dishes');
  if (!categoryIsLightBase) return false;

  const heavyDishText = normalizeSearchText(
    [recipe.name, recipe.excerpt, ...recipe.ingredients.flatMap((group) => group.items.map((item) => item.name))].join(' '),
  );
  return !/(chien|ran|cream|kem beo|thit ba chi|thit mo|chan gio|heo quay|thit quay|vit quay|thit bo|thit heo|thit ga|pha lau|fried|crispy|fatty)/.test(heavyDishText);
}

function isSeafoodRecipe(recipe: Recipe) {
  if (recipe.tags.some((tag) => matchesSearch('hải sản', [tag]) || matchesSearch('seafood', [tag])))
    return true;

  const ingredients = recipe.ingredients.flatMap((group) =>
    group.items
      .filter((item) => !CONDIMENT_PATTERN.test(normalizeSearchText(`${group.group} ${item.name}`)))
      .map((item) => item.name),
  );
  const names = [recipe.name, ...(recipe.aliases ?? []), ...(englishRecipes[recipe.slug]?.names ?? [])]
    .map((name) => normalizeSearchText(name).replace(CONDIMENT_PATTERN, ' '));
  const normalized = normalizeSearchText([...names, ...ingredients].join(' '));
  return SEAFOOD_PATTERN.test(normalized);
}

function isChickenRecipe(recipe: Recipe) {
  const ingredients = recipe.ingredients.flatMap((group) =>
    group.items
      .filter((item) => !EGG_PATTERN.test(normalizeSearchText(item.name)))
      .map((item) => item.name),
  );
  const names = [recipe.name, ...(recipe.aliases ?? []), ...(englishRecipes[recipe.slug]?.names ?? [])]
    .map((name) => normalizeSearchText(name).replace(/\b(?:trung\s+ga|chicken\s+eggs?)\b/g, ' '));
  return [...names, ...ingredients].some((value) => {
    const normalized = normalizeSearchText(value);
    return !/^(?:trung ga|egg|eggs|chicken egg)$/.test(normalized) && CHICKEN_PATTERN.test(normalized);
  });
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
      'red river delta', 'dong bang song hong', 'dong bang bac bo',
      'trung du va mien nui bac bo', 'trung du mien nui phia bac',
      'dong bac bo', 'dong bac', 'tay bac bo', 'tay bac', 'hanoi', 'hai phong',
      'quang ninh', 'cao bang', 'lang son', 'bac giang', 'thai nguyen', 'phu tho',
      'yen bai', 'lao cai', 'dien bien', 'son la', 'hoa binh', 'tuyen quang',
      'nam dinh', 'ninh binh', 'thai binh', 'hai duong', 'hung yen', 'bac ninh', 'ha nam',
    ],
    Trung: [
      'bac trung bo', 'nam trung bo', 'duyen hai nam trung bo', 'duyen hai mien trung',
      'trung bo', 'central coast', 'tay nguyen', 'thanh hoa', 'nghe an', 'ha tinh',
      'quang binh', 'quang tri', 'hue', 'thua thien hue', 'da nang', 'quang nam',
      'quang ngai', 'binh dinh', 'phu yen', 'khanh hoa', 'ninh thuan', 'binh thuan',
      'gia lai', 'kon tum', 'dak lak', 'dak nong', 'lam dong',
    ],
    Nam: [
      'dong nam bo', 'dong bang song cuu long', 'nam bo', 'tay nam bo', 'mien tay',
      'mekong delta', 'southeast vietnam', 'ho chi minh', 'sai gon', 'binh phuoc',
      'tay ninh', 'binh duong', 'dong nai', 'ba ria', 'vung tau', 'long an',
      'tien giang', 'ben tre', 'tra vinh', 'vinh long', 'dong thap', 'an giang',
      'kien giang', 'can tho', 'hau giang', 'soc trang', 'bac lieu', 'ca mau',
    ],
  }[region];
  const regions = [recipe.region, ...(recipe.regions ?? []), ...(recipe.provinces ?? [])]
    .map(normalizeSearchText)
    .filter(Boolean);
  return regions.some((value) => exactRegions.includes(value)) ||
    regionalCues.some((cue) => regions.some((value) => value === cue || value.includes(cue)));
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
    if (facet === 'vegetable') filters.push((item) => isCategory(item, 'Món rau', 'Vegetable dishes'));
    if (facet === 'chicken') filters.push(isChickenRecipe);
    if (facet === 'breakfast') filters.push((item) => isCategory(item, 'Món ăn sáng', 'Breakfast dishes'));
    if (facet === 'dessert') filters.push(isDessertRecipe);
    if (facet === 'snack') filters.push(isSnackRecipe);
    if (facet === 'easy') {
      filters.push((item) => ['dễ', 'easy'].includes(normalizeSearchText(item.difficulty)));
    }
    if (facet === 'quick') filters.push((item) => recipeMinutes(item) <= 30);
  }

  const regionMatch = remainingQuery.match(/\b(?:mon\s+)?mien\s+(bac|trung|nam)\b|\b(northern|north|central|southern|south)(?:\s+vietnam)?\b/);
  if (regionMatch) {
    const value = regionMatch[1] ?? regionMatch[2];
    const region = value === 'bac' || value === 'northern' || value === 'north'
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
      .filter((term) => !['mon', 'nau', 'cook', 'ready', 'under', 'within', 'up', 'to', 'no', 'more', 'than', 'duoi', 'trong', 'toi', 'da', 'khong', 'qua', 'in'].includes(term))
      .join(' ');
  }

  const matchesText = !remainingQuery || matchesSearch(remainingQuery, recipeFields(recipe));
  return matchesText && filters.every((matchesFacet) => matchesFacet(recipe));
}

export function matchesRecipeRegion(recipe: Recipe, region: string) {
  return region === 'Ba miền'
    ? normalizeSearchText(recipe.region) === normalizeSearchText(region) ||
        recipe.regions?.some((value) => normalizeSearchText(value) === normalizeSearchText(region)) === true
    : ['Bắc', 'Trung', 'Nam'].includes(region)
      ? isRegion(recipe, region as 'Bắc' | 'Trung' | 'Nam')
      : false;
}

export function recipeSearchRank(recipe: Recipe, query: string) {
  const keyword = normalizeSearchText(query);
  if (!keyword) return 0;
  const names = [recipe.name, ...(recipe.aliases ?? []), ...(englishRecipes[recipe.slug]?.names ?? [])]
    .map(normalizeSearchText)
    .filter(Boolean);
  if (names.includes(keyword)) return 120;
  if (names.some((name) => name.startsWith(keyword))) return 100;
  if (names.some((name) => name.includes(keyword))) return 80;
  if (names.some((name) => matchesSearch(query, [name]))) return 70;

  const fields = recipeFields(recipe).map(normalizeSearchText).filter(Boolean);
  if (fields.some((field) => field === keyword)) return 60;
  if (fields.some((field) => field.includes(keyword))) return 50;
  if (fields.some((field) => matchesSearch(query, [field]))) return 40;
  return matchesRecipeSearch(recipe, query) ? 20 : 0;
}
