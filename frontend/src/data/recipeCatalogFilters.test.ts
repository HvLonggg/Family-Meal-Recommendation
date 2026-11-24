import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adaptRecipe, type ApiRecipe } from '@/data/recipeApi';
import { getRecipe, recipeMinutes, type Recipe } from '@/data/recipes';
import {
  getCatalogCategory,
  getCookingMethodOptions,
  getIngredientFacetOptions,
  matchesCatalogCategory,
  matchesCookingMethods,
  matchesIngredientFacets,
  sortCatalogRecipes,
} from '@/data/recipeCatalogFilters';

const base = getRecipe('ca-chep-kho-rieng')!;
function dish(name: string, ingredientNames: string[], overrides: Partial<Recipe> = {}): Recipe {
  return {
    ...base,
    name,
    aliases: [],
    tags: [],
    ingredients: [
      {
        group: 'Nguyên liệu chính',
        items: ingredientNames.map((name) => ({ name, amount: 200, unit: 'g' })),
      },
    ],
    ...overrides,
  };
}
const snapshot = JSON.parse(readFileSync('public/data/recipe-catalog.json', 'utf8')) as {
  data: ApiRecipe[];
};
const catalog = snapshot.data.map((recipe) => adaptRecipe(recipe, new Map()));

describe('catalog categories and combined filters', () => {
  it.each([
    'muop-dang-xao-trung',
    'bau-xao-trung',
    'dau-que-xao-thit-heo',
    'ngon-dau-den-luoc-cham-nuoc-mam-toi',
    'ngon-su-su-luoc-cham-mam-toi-ot-tam-dao',
    'hoa-thien-ly-xao-toi',
    'mong-toi-xao-thit-bam',
  ])('puts vegetable-led %s in vegetables, not savoury mains', (slug) => {
    const source = catalog.find((item) => item.slug === slug)!;
    expect(source).toBeDefined();
    const recipe = { ...source, category: 'Món mặn' as const };
    expect(getCatalogCategory(recipe)).toBe('Món rau');
    expect(matchesCatalogCategory(recipe, 'Món mặn')).toBe(false);
    expect(matchesCatalogCategory(recipe, 'Món rau')).toBe(true);
  });
  it('corrects a soup and retains a beef-led stir-fry', () => {
    expect(
      getCatalogCategory(catalog.find((r) => r.slug === 'canh-rau-san-chua-nau-suon-phu-tho')!),
    ).toBe('Món canh');
    expect(getCatalogCategory(catalog.find((r) => r.slug === 'thit-bo-xao-rau-muong')!)).toBe(
      'Món mặn',
    );
  });
  it.each(['goi-ca-mai-vung-tau', 'goi-ca-trich-phu-quoc', 'nom-sua-do-hai-phong'])(
    'does not classify protein-led %s as a vegetable side',
    (slug) => {
      const recipe = catalog.find((item) => item.slug === slug)!;
      expect(getCatalogCategory(recipe)).toBe('Món mặn');
      expect(matchesCatalogCategory(recipe, 'Món rau')).toBe(false);
    },
  );
  it.each([
    'Món mặn',
    'Món rau',
    'Món canh',
    'Món chay',
    'Món ăn sáng',
    'Món nước',
    'Món tráng miệng',
    'Món ăn kèm',
    'Món ăn vặt',
  ])('sorts only the selected %s category', (category) => {
    const subset = catalog.filter((recipe) => matchesCatalogCategory(recipe, category));
    const sorted = sortCatalogRecipes(subset, 'quick', '');
    expect(sorted).toHaveLength(subset.length);
    expect(sorted.every((recipe) => matchesCatalogCategory(recipe, category))).toBe(true);
    expect(sorted.map(recipeMinutes)).toEqual(subset.map(recipeMinutes).sort((a, b) => a - b));
  });
  it('uses OR within ingredients and AND between ingredient and cooking filters', () => {
    const pork = dish('Thịt lợn kho', ['Thịt lợn']);
    const chicken = dish('Gà luộc', ['Thịt gà']);
    const fish = dish('Cá kho', ['Cá chép']);
    expect(
      [pork, chicken, fish].filter((r) => matchesIngredientFacets(r, ['pork', 'chicken'])),
    ).toEqual([pork, chicken]);
    expect(
      [pork, chicken, fish].filter(
        (r) =>
          matchesIngredientFacets(r, ['pork', 'chicken']) && matchesCookingMethods(r, ['braise']),
      ),
    ).toEqual([pork]);
    expect(matchesCookingMethods(chicken, ['braise', 'boil'])).toBe(true);
  });
  it('does not confuse condiments, eggs, tomatoes, butter or pork skin with meat facets', () => {
    const ingredients = dish('Rau xào', [
      'Cà chua',
      'Cà tím',
      'Nước mắm',
      'Trứng gà',
      'Bơ',
      'Bì lợn',
    ]);
    expect(matchesIngredientFacets(ingredients, ['fish', 'chicken', 'beef', 'gourd'])).toBe(false);
    expect(matchesIngredientFacets(ingredients, ['egg', 'pork'])).toBe(true);
    expect(
      matchesIngredientFacets(dish('Gà chay', ['Gà chay từ đậu nành'], { category: 'Món chay' }), [
        'chicken',
      ]),
    ).toBe(false);
  });
  it('keeps primary cooking methods distinct from ingredient names and preparation steps', () => {
    expect(matchesCookingMethods(dish('Tôm khô', ['Tôm khô']), ['braise'])).toBe(false);
    expect(matchesCookingMethods(dish('Xáo gà', ['Gà']), ['stir-fry'])).toBe(false);
    const soup = catalog.find((r) => r.slug === 'canh-rau-san-chua-nau-suon-phu-tho')!;
    expect(matchesCookingMethods(soup, ['stir-fry'])).toBe(false);
    expect(matchesCookingMethods(soup, ['simmer'])).toBe(true);
  });
  it('works with translated names and ingredients while preserving Vietnamese identity', () => {
    const recipe = dish('Stir-fried bitter melon with eggs', ['Bitter melon', 'Eggs'], {
      slug: 'muop-dang-xao-trung',
      aliases: ['Mướp đắng xào trứng'],
    });
    expect(getCatalogCategory(recipe)).toBe('Món rau');
    expect(matchesIngredientFacets(recipe, ['gourd'])).toBe(true);
    expect(matchesCookingMethods(recipe, ['stir-fry'])).toBe(true);
  });
  it('offers only ingredients and methods present in the tab', () => {
    const greens = dish('Rau muống luộc', ['Rau muống'], {
      slug: 'rau-muong-luoc',
      category: 'Món rau',
    });
    expect(getIngredientFacetOptions('Món rau', [greens])).toEqual([
      { id: 'leafy', label: 'Rau xanh' },
    ]);
    expect(getCookingMethodOptions('Món rau', [greens])).toEqual([{ id: 'boil', label: 'Luộc' }]);
  });
  it('includes passive time, difficulty and ingredient count without mutating input', () => {
    const easy = dish('Cá hấp', ['Cá'], {
      slug: 'ca-hap',
      difficulty: 'Dễ',
      prepMinutes: 5,
      cookMinutes: 5,
      passiveMinutes: 60,
    });
    const hard = dish('Gà nướng', ['Gà', 'Mật ong'], {
      slug: 'ga-nuong',
      difficulty: 'Khó',
      prepMinutes: 10,
      cookMinutes: 20,
    });
    const input = [easy, hard];
    expect(sortCatalogRecipes(input, 'quick', '')[0]).toBe(hard);
    expect(sortCatalogRecipes(input, 'easy', '')[0]).toBe(easy);
    expect(sortCatalogRecipes(input, 'few-ingredients', '')[0]).toBe(easy);
    expect(input).toEqual([easy, hard]);
  });
});
