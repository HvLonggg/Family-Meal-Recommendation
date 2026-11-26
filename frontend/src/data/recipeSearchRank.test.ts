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
  dish('Canh cải thịt bằm', {
    minutes: 7,
    category: 'Món canh',
    tags: ['canh chua ngọt'],
    excerpt: 'Canh chua nhẹ, ăn cùng cá kho.',
    ingredients: ['Cải xanh', 'Thịt bằm', 'Cà chua'],
  }),
  dish('Canh cá khoai', { minutes: 6, category: 'Món canh', ingredients: ['Cá khoai'] }),
  dish('Bún xào nghệ Huế', { minutes: 11, region: 'Trung', ingredients: ['Bún', 'Thịt bò'] }),
  dish('Bún bò Huế', { minutes: 190, region: 'Trung', ingredients: ['Bún', 'Bắp bò'] }),
  dish('Bò lúc lắc', { minutes: 5, ingredients: ['Thịt bò', 'Bún tươi'] }),
  dish('Bún chả', { minutes: 6, ingredients: ['Bún', 'Thịt heo'] }),
  dish('Bún riêu của mẹ', { minutes: 6, ingredients: ['Bún', 'Cà chua'] }),
  dish('Bún riêu cua', { minutes: 60, ingredients: ['Bún', 'Cua đồng'] }),
  dish('Cá kho tộ', { minutes: 5, ingredients: ['Cá basa', 'Gừng', 'Thịt gà'] }),
  dish('Gà kho gừng', { minutes: 45, ingredients: ['Thịt gà', 'Gừng'] }),
  dish('Gà kho nghệ', { minutes: 4, ingredients: ['Thịt gà', 'Nghệ', 'Gừng'] }),
  dish('Cơm gà Hội An', { minutes: 50, ingredients: ['Cơm', 'Thịt gà'] }),
  dish('Bún thang', { minutes: 3, ingredients: ['Bún', 'Thịt gà', 'Trứng'] }),
  dish('Cà tím nướng', { minutes: 2, ingredients: ['Cà tím'] }),
  dish('Hủ tiếu Nam Vang', { minutes: 1, ingredients: ['Hủ tiếu', 'Tôm'] }),
];

function search(query: string) {
  return sortCatalogRecipes(
    catalog.filter((recipe) => matchesRecipeSearch(recipe, query, catalog)),
    defaultCatalogSort(query),
    query,
  ).map((recipe) => recipe.name);
}

describe('recipe search relevance', () => {
  it('sorts by relevance by default only when there is a keyword', () => {
    expect(defaultCatalogSort('phở')).toBe('relevant');
    expect(defaultCatalogSort('  ')).toBe('quick');
  });

  it('puts dishes named phở first and keeps other tones and descriptions out of “phở”', () => {
    const results = search('phở');
    expect(results.slice(0, 2)).toEqual(['Phở bò Hà Nội', 'Phở cuốn Ngũ Xã Hà Nội']);
    // “Phở mai” là nguyên liệu: một từ đơn vẫn tìm theo nguyên liệu nhưng xếp sau tên món.
    expect(results.slice(2)).toEqual(['Bánh mì chảo']);
  });

  it('lets unaccented “pho” match every tone but ranks dish names first', () => {
    const results = search('pho');
    expect(results.slice(0, 2)).toEqual(['Phở bò Hà Nội', 'Phở cuốn Ngũ Xã Hà Nội']);
    expect(results).toContain('Bánh canh Nam Phổ');
    expect(results).not.toContain('Bánh tráng xúc hến xào Hội An');
    expect(results).not.toContain('Bún mắm nêm Đà Nẵng');
  });

  it('returns only dishes named with both words for “phở bò”', () => {
    expect(search('phở bò')).toEqual(['Phở bò Hà Nội', 'Phở cuốn Ngũ Xã Hà Nội']);
  });

  it('keeps “canh chua” to soups whose name or alias holds both words', () => {
    const results = search('canh chua');
    expect(results[0]).toBe('Canh chua cá');
    expect(results).toContain('Canh cá đuối nấu xương rồng');
    expect(results).toContain('Canh cà chua trứng');
    expect(results).not.toContain('Súp lơ luộc');
  });

  it('does not return unrelated soups or tomato soups for “canh chua cá”', () => {
    expect(search('canh chua cá')).toEqual(['Canh chua cá', 'Canh cá đuối nấu xương rồng']);
  });

  it('allows both cá and cà for unaccented “canh chua ca”, exact name first', () => {
    const results = search('canh chua ca');
    expect(results[0]).toBe('Canh chua cá');
    expect(results).toContain('Canh cà chua trứng');
    expect(results).not.toContain('Canh cải thịt bằm');
  });

  it('requires every word of “gà kho gừng” in the name', () => {
    expect(search('gà kho gừng')).toEqual(['Gà kho gừng']);
  });

  it('keeps “bún bò” away from Bò lúc lắc and Bún chả', () => {
    const results = search('bún bò');
    expect(results[0]).toBe('Bún bò Huế');
    expect(results).not.toContain('Bò lúc lắc');
    expect(results).not.toContain('Bún chả');
    // Món bún có thịt bò: từ “bò” là nguyên liệu chính, xếp sau tên khớp đủ.
    expect(results.slice(1)).toEqual(['Bún xào nghệ Huế']);
  });

  it('ranks the exact unaccented dish name first for “bun bo hue”', () => {
    const results = search('bun bo hue');
    expect(results[0]).toBe('Bún bò Huế');
    expect(results).not.toContain('Bún chả');
  });

  it('matches “cá kho” as whole words, never “khoai”', () => {
    expect(search('cá kho')).toEqual(['Cá kho tộ']);
  });

  it('keeps cà, cá and cua, của apart when the query has diacritics', () => {
    expect(search('cà')).toEqual([
      'Cà tím nướng',
      'Canh cà chua trứng',
      'Bún riêu của mẹ',
      'Canh cải thịt bằm',
    ]);
    expect(search('cà')).not.toContain('Canh chua cá');
    expect(search('bún riêu cua')).toEqual(['Bún riêu cua']);
    expect(search('ca')).toEqual(expect.arrayContaining(['Canh chua cá', 'Cà tím nướng']));
  });

  it('keeps a single generic word broad: name start > name contains > ingredient', () => {
    const results = search('gà');
    expect(results.slice(0, 2)).toEqual(['Gà kho gừng', 'Gà kho nghệ']);
    expect(results.indexOf('Cơm gà Hội An')).toBe(2);
    expect(results.indexOf('Bún thang')).toBeGreaterThan(2);
    expect(results.indexOf('Cá kho tộ')).toBeGreaterThan(2);
  });

  it('only uses typo and prefix fallbacks when nothing matches exactly', () => {
    expect(search('phơ bo')[0]).toBe('Phở bò Hà Nội');
    expect(search('bun bo hu')[0]).toBe('Bún bò Huế');
    expect(search('bun bo hu')).not.toContain('Bún chả');
    expect(search('canh ch')[0]).toBe('Canh chua cá');
    expect(search('canh chuaa')[0]).toBe('Canh chua cá');
    // “kho” có món khớp nguyên từ nên không mở rộng sang tiền tố “khoai”.
    expect(search('canh kho')).toEqual([]);
    // Từ ngắn không bao giờ khớp gần đúng.
    expect(search('canh chu')).toEqual(expect.arrayContaining(['Canh chua cá']));
    expect(search('gaa kho')).toEqual([]);
  });

  it('prefers diacritic-exact names and keeps one-typo matches as a weak fallback', () => {
    const exact = catalog.find((recipe) => recipe.name === 'Phở bò Hà Nội')!;
    const otherTone = catalog.find((recipe) => recipe.name === 'Bánh canh Nam Phổ')!;
    expect(recipeSearchRank(exact, 'phở')).toBeGreaterThan(recipeSearchRank(otherTone, 'pho'));
    // Sai dấu chỉ còn là khớp dự phòng, thấp hơn mọi khớp chính xác (kể cả nguyên liệu).
    expect(recipeSearchRank(otherTone, 'phở')).toBeLessThan(150);
    const soup = catalog.find((recipe) => recipe.name === 'Canh chua cá')!;
    const typo = recipeSearchRank(soup, 'canh chuaa');
    expect(typo).toBeGreaterThan(0);
    expect(typo).toBeLessThan(recipeSearchRank(otherTone, 'phổ'));
  });

  it('stays fast on a catalog of about 800 dishes', () => {
    const large = Array.from({ length: 30 }, () => catalog).flat();
    for (const recipe of large) matchesRecipeSearch(recipe, 'khởi động', large);
    const started = performance.now();
    for (const query of [
      'c',
      'ca',
      'can',
      'canh',
      'canh c',
      'canh ch',
      'canh chua',
      'canh chua cá',
    ]) {
      large.filter((recipe) => matchesRecipeSearch(recipe, query, large));
    }
    // Ngưỡng rộng cho máy CI chậm; trình duyệt thực tế nhanh hơn nhiều.
    expect((performance.now() - started) / 8).toBeLessThan(60);
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
