import { recipeMinutes, type Recipe } from '@/data/recipes';
import { recipeSearchRank } from '@/data/recipeSearch';
import {
  getCatalogCategory,
  isSoupDish,
  isVegetableDish,
  isVegetarianRecipe,
} from '@/data/recipeTaxonomy';
import { normalizeSearchText } from '@/lib/search';

export { getCatalogCategory } from '@/data/recipeTaxonomy';
export type CatalogSort = 'quick' | 'easy' | 'few-ingredients' | 'name' | 'relevant';
export type CatalogFacetOption = { id: string; label: string };

type IngredientFacet = CatalogFacetOption & { pattern: RegExp; animal?: boolean };
const ingredientFacets: IngredientFacet[] = [
  {
    id: 'pork',
    label: 'Thịt lợn',
    animal: true,
    pattern:
      /\b(heo|lon|ba chi|suon non|suon heo|suon lon|gio song|gio lua|chan gio|thit bam|thit xay|pork|bacon)\b/,
  },
  { id: 'chicken', label: 'Gà', animal: true, pattern: /\b(ga|chicken)\b/ },
  { id: 'duck', label: 'Vịt', animal: true, pattern: /\b(vit|duck)\b/ },
  { id: 'muscovy', label: 'Ngan', animal: true, pattern: /\b(ngan|muscovy)\b/ },
  { id: 'goose', label: 'Ngỗng', animal: true, pattern: /\b(ngong|goose)\b/ },
  { id: 'beef', label: 'Thịt bò', animal: true, pattern: /\b(bo|beef|veal)\b/ },
  {
    id: 'fish',
    label: 'Cá',
    animal: true,
    pattern: /\b(ca|fish|salmon|carp|tilapia|catfish|mackerel|anchov\w*)\b/,
  },
  { id: 'shrimp', label: 'Tôm', animal: true, pattern: /\b(tom|tep|shrimp|prawn)\b/ },
  {
    id: 'seafood',
    label: 'Hải sản',
    animal: true,
    pattern:
      /\b(tom|tep|muc|cua|ghe|ngheu|ngao|so|hen|hau|bach tuoc|shrimp|prawn|squid|crab|clam|mussel|oyster|octopus|scallop)\b/,
  },
  { id: 'egg', label: 'Trứng', pattern: /\b(trung|eggs?)\b/ },
  { id: 'tofu', label: 'Đậu phụ', pattern: /\b(dau phu|dau hu|tau hu|tofu|bean curd)\b/ },
  { id: 'mushroom', label: 'Nấm', pattern: /\b(nam|mushroom|shiitake)\b/ },
  {
    id: 'leafy',
    label: 'Rau xanh',
    pattern:
      /\b(rau|cai|mong toi|bo khai|choai|spinach|greens|cabbage|broccoli|bok choy|lettuce)\b/,
  },
  {
    id: 'gourd',
    label: 'Bầu, bí, mướp',
    pattern: /\b(bau|bi|muop|kho qua|gourd|squash|pumpkin|luffa|bitter melon)\b/,
  },
  {
    id: 'roots',
    label: 'Củ, quả',
    pattern:
      /\b(cu|khoai|ca rot|ca tim|ca chua|su su|mang|carrot|potato|eggplant|tomato|chayote|bamboo|lotus root|radish)\b/,
  },
  {
    id: 'beans',
    label: 'Các loại đậu',
    pattern:
      /\b(dau xanh|dau den|dau do|dau que|dau dua|dau bap|dau ha lan|dau nanh|beans?|peas|okra|lentil)\b/,
  },
  { id: 'rice', label: 'Gạo, nếp', pattern: /\b(gao|nep|com|rice)\b/ },
  {
    id: 'noodles',
    label: 'Bún, mì, miến',
    pattern: /\b(bun|mi|mien|hu tieu|banh pho|noodles?|vermicelli)\b/,
  },
  { id: 'banana', label: 'Chuối', pattern: /\b(chuoi|banana)\b/ },
  { id: 'mango', label: 'Xoài', pattern: /\b(xoai|mango)\b/ },
  { id: 'watermelon', label: 'Dưa hấu', pattern: /\b(dua hau|watermelon)\b/ },
  { id: 'pineapple', label: 'Dứa', pattern: /\b(dua|thom|khom|pineapple)\b/ },
  {
    id: 'citrus',
    label: 'Cam, quýt, bưởi',
    pattern: /\b(cam|quyt|buoi|orange|mandarin|pomelo|grapefruit)\b/,
  },
  { id: 'papaya', label: 'Đu đủ', pattern: /\b(du du|papaya)\b/ },
  { id: 'dragonfruit', label: 'Thanh long', pattern: /\b(thanh long|dragon fruit)\b/ },
  { id: 'guava', label: 'Ổi', pattern: /\b(oi|guava)\b/ },
  { id: 'coconut', label: 'Dừa', pattern: /\b(dua|coconut)\b/ },
];

const animalIds = [
  'pork',
  'chicken',
  'duck',
  'muscovy',
  'goose',
  'beef',
  'fish',
  'shrimp',
  'seafood',
];
const plantIds = ['tofu', 'mushroom', 'leafy', 'gourd', 'roots', 'beans'];
const fruitIds = [
  'banana',
  'mango',
  'watermelon',
  'pineapple',
  'citrus',
  'papaya',
  'dragonfruit',
  'guava',
  'coconut',
];

function mainIngredients(recipe: Recipe) {
  return recipe.ingredients
    .flatMap((group) =>
      /^(gia vi|seasoning|sauce|nuoc va chat long)/.test(normalizeSearchText(group.group))
        ? []
        : group.items.map((item) => item.name),
    )
    .filter(
      (name) =>
        !/^(nuoc mam|nuoc tuong|dau hao|hat nem|bot nem|nuoc dung|fish sauce|oyster sauce|soy sauce|chicken stock|beef stock|vegetable stock)\b/.test(
          normalizeSearchText(name),
        ),
    );
}

function hasIngredient(recipe: Recipe, facet: IngredientFacet) {
  if (facet.animal && isVegetarianRecipe(recipe)) return false;
  return mainIngredients(recipe).some((raw) => {
    const name = normalizeSearchText(raw);
    if (facet.animal && /\b(chay|vegetarian|vegan|mock|plant based)\b/.test(name)) return false;
    if (facet.animal && /\b(trung|eggs?)\b/.test(name)) return false;
    if (facet.id === 'pork')
      return /(?:^|\s)(heo|lợn|ba chỉ|sườn non|sườn heo|sườn lợn|giò sống|giò lụa|chân giò|thịt băm|thịt xay|pork|bacon)(?:\s|$)/iu.test(
        raw,
      );
    if (facet.id === 'beef') return /(?:^|\s)(bò|beef|veal)(?:\s|$)/iu.test(raw);
    if (facet.id === 'fish')
      return /(?:^|\s)(cá|fish|salmon|carp|tilapia|catfish|mackerel|anchovies|anchovy)(?:\s|$)/iu.test(
        raw,
      );
    if (facet.id === 'seafood')
      return (
        /\b(tom|tep|muc|cua|ghe|ngheu|ngao|hen|hau|bach tuoc|shrimp|prawn|squid|crab|clam|mussel|oyster|octopus|scallop)\b/.test(
          name,
        ) || /(?:^|\s)sò(?:\s|$)/iu.test(raw)
      );
    if (facet.id === 'gourd')
      return /(?:^|\s)(bầu|bí|mướp|khổ qua|gourd|squash|pumpkin|luffa|bitter melon)(?:\s|$)/iu.test(
        raw,
      );
    if (facet.id === 'pineapple') return /^(dứa|thơm|khóm|pineapple)(?:\s|$)/iu.test(raw);
    if (facet.id === 'coconut') return /(?:^|\s)(dừa|coconut)(?:\s|$)/iu.test(raw);
    return facet.pattern.test(name);
  });
}

export function matchesCatalogCategory(recipe: Recipe, category: string) {
  if (category === 'Tất cả') return true;
  if (category === 'Món chay') return isVegetarianRecipe(recipe);
  if (category === 'Món rau') return !isSoupDish(recipe) && isVegetableDish(recipe);
  if (category === 'Món canh') return isSoupDish(recipe);
  return getCatalogCategory(recipe) === category;
}

export function getIngredientFacetOptions(
  category: string,
  catalog: Recipe[],
): CatalogFacetOption[] {
  const ids =
    category === 'Món chay'
      ? [...plantIds, 'rice', 'noodles']
      : category === 'Món rau'
        ? [...plantIds, 'egg', 'pork', 'beef', 'shrimp']
        : category === 'Món tráng miệng'
          ? [...fruitIds, 'beans', 'rice']
          : category === 'Món mặn'
            ? [...animalIds, 'egg', 'tofu']
            : category === 'Món nước' || category === 'Món ăn sáng'
              ? ['rice', 'noodles', ...animalIds, 'egg', 'tofu', 'mushroom']
              : [...animalIds, 'egg', ...plantIds, 'rice', 'noodles'];
  return ids.flatMap((id) => {
    const option = ingredientFacets.find((facet) => facet.id === id)!;
    return catalog.some(
      (recipe) => matchesCatalogCategory(recipe, category) && hasIngredient(recipe, option),
    )
      ? [{ id: option.id, label: option.label }]
      : [];
  });
}

const methodFacets = [
  { id: 'braise', label: 'Kho, rim', pattern: /(?:^|\s)(kho|rim|braised?|braising)(?:\s|$)/u },
  {
    id: 'fry',
    label: 'Chiên, rán',
    pattern: /(?:^|\s)(chiên|rán|fried|frying|deep-fried)(?:\s|$)/u,
  },
  {
    id: 'stir-fry',
    label: 'Xào',
    pattern: /(?:^|\s)(xào|stir-fried|stir-fry|stir fry|sautéed)(?:\s|$)/u,
  },
  { id: 'boil', label: 'Luộc', pattern: /(?:^|\s)(luộc|boiled|boiling)(?:\s|$)/u },
  { id: 'steam', label: 'Hấp', pattern: /(?:^|\s)(hấp|steamed|steaming)(?:\s|$)/u },
  { id: 'grill', label: 'Nướng', pattern: /(?:^|\s)(nướng|grilled|roasted|baked)(?:\s|$)/u },
  {
    id: 'simmer',
    label: 'Nấu, hầm',
    pattern: /(?:^|\s)(canh|súp|nấu|hầm|ninh|cháo|stew|stewed|soup|simmered)(?:\s|$)/u,
  },
  { id: 'mix', label: 'Trộn, gỏi', pattern: /(?:^|\s)(trộn|gỏi|nộm|salad|tossed)(?:\s|$)/u },
];

function cookingMethodIds(recipe: Recipe) {
  if (isSoupDish(recipe)) return ['simmer'];
  const names = [recipe.name, ...(recipe.aliases ?? [])].map((name) =>
    name.normalize('NFC').toLocaleLowerCase('vi'),
  );
  const fromName = methodFacets.filter((facet) => names.some((name) => facet.pattern.test(name)));
  if (fromName.length) return fromName.map(({ id }) => id);
  const labels = [...(recipe.cookingMethods ?? []), ...recipe.tags].map((tag) =>
    tag.normalize('NFC').toLocaleLowerCase('vi'),
  );
  return methodFacets
    .filter((facet) => labels.some((label) => facet.pattern.test(label)))
    .map(({ id }) => id);
}

export function matchesIngredientFacets(recipe: Recipe, ids: readonly string[]) {
  return (
    ids.length === 0 ||
    ingredientFacets.some((facet) => ids.includes(facet.id) && hasIngredient(recipe, facet))
  );
}

export function matchesCookingMethods(recipe: Recipe, ids: readonly string[]) {
  return ids.length === 0 || cookingMethodIds(recipe).some((id) => ids.includes(id));
}

export function getCookingMethodOptions(category: string, catalog: Recipe[]): CatalogFacetOption[] {
  const present = new Set(
    catalog.filter((recipe) => matchesCatalogCategory(recipe, category)).flatMap(cookingMethodIds),
  );
  return methodFacets.filter(({ id }) => present.has(id)).map(({ id, label }) => ({ id, label }));
}

export function sortCatalogRecipes(
  recipes: Recipe[],
  sort: CatalogSort,
  query: string,
  locale = 'vi-VN',
) {
  const collator = new Intl.Collator(locale, { sensitivity: 'base', numeric: true });
  const difficulty = (recipe: Recipe) =>
    ({ Dễ: 0, Vừa: 1, 'Trung bình': 1, Khó: 2 })[recipe.difficulty] ?? 3;
  const ingredientCount = (recipe: Recipe) =>
    new Set(
      recipe.ingredients.flatMap((group) =>
        group.items.map((item) => normalizeSearchText(item.name)),
      ),
    ).size;
  // Tính điểm liên quan một lần cho mỗi món, không tính lại trong hàm so sánh.
  const relevance = new Map<Recipe, number>();
  if (sort === 'relevant' && query.trim()) {
    for (const recipe of recipes) relevance.set(recipe, recipeSearchRank(recipe, query));
  }
  return [...recipes].sort((a, b) => {
    const rank =
      sort === 'quick'
        ? recipeMinutes(a) - recipeMinutes(b)
        : sort === 'easy'
          ? difficulty(a) - difficulty(b) || recipeMinutes(a) - recipeMinutes(b)
          : sort === 'few-ingredients'
            ? ingredientCount(a) - ingredientCount(b) || recipeMinutes(a) - recipeMinutes(b)
            : sort === 'relevant'
              ? (relevance.get(b) ?? 0) - (relevance.get(a) ?? 0)
              : 0;
    return rank || collator.compare(a.name, b.name) || a.slug.localeCompare(b.slug);
  });
}
