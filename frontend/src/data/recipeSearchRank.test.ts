import { describe, expect, it } from 'vitest';

import { defaultCatalogSort, sortCatalogRecipes } from '@/data/recipeCatalogFilters';
import { getRecipe, type Recipe } from '@/data/recipes';
import { matchesRecipeSearch, recipeSearchRank } from '@/data/recipeSearch';

const base = getRecipe('ca-chep-kho-rieng')!;
let sequence = 0;

function dish(
  name: string,
  {
    ingredients = ['Muối'],
    minutes = 30,
    ...overrides
  }: Omit<Partial<Recipe>, 'ingredients'> & { ingredients?: string[]; minutes?: number } = {},
): Recipe {
  sequence += 1;
  return {
    ...base,
    slug: `fixture-${sequence}`,
    name,
    excerpt: '',
    category: 'Món mặn',
    region: 'Bắc',
    regions: [],
    provinces: [],
    aliases: [],
    tags: [],
    prepMinutes: 0,
    cookMinutes: minutes,
    ingredients: [
      {
        group: 'Nguyên liệu chính',
        items: ingredients.map((ingredient) => ({ name: ingredient, amount: 100, unit: 'g' })),
      },
    ],
    ...overrides,
  };
}

// Món không liên quan nấu nhanh hơn để chứng minh thứ tự đến từ độ khớp, không từ thời gian.
const catalog = [
  dish('Bánh tráng xúc hến xào Hội An', { minutes: 10, excerpt: 'Món quen ở phố cổ Hội An.' }),
  dish('Bún mắm nêm Đà Nẵng', { minutes: 12, excerpt: 'Ăn như phở, chan nước mắm nêm.' }),
  dish('Bánh canh Nam Phổ', { minutes: 14 }),
  dish('Phở cuốn Ngũ Xã Hà Nội', {
    minutes: 40,
    aliases: ['Phở cuốn thịt bò'],
    ingredients: ['Bánh phở lá', 'Thịt bò'],
  }),
  dish('Phở bò Hà Nội', { minutes: 240, ingredients: ['Bánh phở', 'Thịt bò', 'Hồi'] }),
  dish('Bánh mì chảo', { minutes: 15, ingredients: ['Bánh mì', 'Thịt bò', 'Phở mai'] }),
  dish('Súp lơ luộc', {
    minutes: 8,
    category: 'Món canh',
    excerpt: 'Ăn kèm canh chua cho bữa cơm nhẹ.',
    ingredients: ['Súp lơ'],
  }),
  dish('Canh chua cá', {
    minutes: 30,
    category: 'Món canh',
    ingredients: ['Cá lóc', 'Me chua', 'Thơm'],
  }),
  dish('Canh cá đuối nấu xương rồng', {
    minutes: 20,
    category: 'Món canh',
    aliases: ['Canh chua cá đuối'],
    ingredients: ['Cá đuối'],
  }),
  dish('Canh cà chua trứng', { minutes: 9, category: 'Món canh', ingredients: ['Cà chua'] }),
  dish('Bún xào nghệ Huế', { minutes: 11, region: 'Trung', ingredients: ['Bún', 'Thịt bò'] }),
  dish('Bún bò Huế', { minutes: 190, region: 'Trung', ingredients: ['Bún', 'Bắp bò'] }),
];

function search(query: string) {
  return sortCatalogRecipes(
    catalog.filter((recipe) => matchesRecipeSearch(recipe, query)),
    defaultCatalogSort(query),
    query,
  ).map((recipe) => recipe.name);
}

describe('recipe search relevance', () => {
  it('sorts by relevance by default only when there is a keyword', () => {
    expect(defaultCatalogSort('phở')).toBe('relevant');
    expect(defaultCatalogSort('  ')).toBe('quick');
  });

  it.each(['phở', 'pho'])('puts dishes named phở first for “%s”', (query) => {
    const results = search(query);
    expect(results.slice(0, 2)).toEqual(['Phở bò Hà Nội', 'Phở cuốn Ngũ Xã Hà Nội']);
    expect(results.indexOf('Bánh canh Nam Phổ')).toBeGreaterThan(1);
    expect(results.indexOf('Bánh tráng xúc hến xào Hội An')).toBeGreaterThan(
      results.indexOf('Bánh canh Nam Phổ'),
    );
  });

  it('prefers the exact dish, then aliases, then ingredients for “phở bò”', () => {
    expect(search('phở bò').slice(0, 3)).toEqual([
      'Phở bò Hà Nội',
      'Phở cuốn Ngũ Xã Hà Nội',
      'Bánh mì chảo',
    ]);
  });

  it('ranks names containing the phrase above description-only matches for “canh chua”', () => {
    const results = search('canh chua');
    expect(results[0]).toBe('Canh chua cá');
    expect(results.indexOf('Canh cá đuối nấu xương rồng')).toBeGreaterThan(0);
    expect(results.indexOf('Súp lơ luộc')).toBeGreaterThan(results.indexOf('Canh cà chua trứng'));
  });

  it('ranks the exact unaccented dish name first for “bun bo hue”', () => {
    const results = search('bun bo hue');
    expect(results[0]).toBe('Bún bò Huế');
    expect(results.indexOf('Bún xào nghệ Huế')).toBeGreaterThan(0);
  });

  it('prefers diacritic-exact names and keeps one-typo matches as a weak fallback', () => {
    const exact = catalog.find((recipe) => recipe.name === 'Phở bò Hà Nội')!;
    const otherTone = catalog.find((recipe) => recipe.name === 'Bánh canh Nam Phổ')!;
    expect(recipeSearchRank(exact, 'phở')).toBeGreaterThan(recipeSearchRank(otherTone, 'phở'));
    const typo = recipeSearchRank(exact, 'phở hà nộii');
    expect(typo).toBeGreaterThan(0);
    expect(typo).toBeLessThan(recipeSearchRank(otherTone, 'phổ'));
  });
});

describe('seafood topic filter', () => {
  it('ignores look-alike words such as cà rốt, nấm sò, mắm cua and “đặc sản Hải Phòng”', () => {
    const lookalikes = [
      dish('Cải thảo xào nấm sò chay', { ingredients: ['Cải thảo', 'Nấm sò'] }),
      dish('Trứng chiên rau củ', { ingredients: ['Trứng gà', 'Cà rốt', 'Cà chua'] }),
      dish('Rau lủi luộc chấm mắm cua', { ingredients: ['Rau lủi', 'Mắm cua'] }),
      dish('Bánh mì que', { tags: ['đặc sản Hải Phòng'], ingredients: ['Bánh mì', 'Pa tê'] }),
    ];
    for (const recipe of lookalikes) {
      expect(matchesRecipeSearch(recipe, 'Món hải sản')).toBe(false);
    }
    expect(
      matchesRecipeSearch(dish('Canh rau ngót nấu tôm', { ingredients: ['Tôm'] }), 'hải sản'),
    ).toBe(true);
  });
});
