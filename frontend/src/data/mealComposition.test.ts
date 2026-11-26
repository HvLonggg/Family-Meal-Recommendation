import { describe, expect, it } from 'vitest';

import {
  canServeAsMainDish,
  describeMealComposition,
  getMealRole,
  selectFreshMealSets,
} from '@/data/mealComposition';
import { createHomeMealSuggestions } from '@/data/homeMealSuggestions';
import { recipes, type Recipe } from '@/data/recipes';
import { translate } from '@/features/i18n/translate';

const recipeByCategory = (category: string) => {
  const recipe = recipes.find((item) => item.category === category);
  if (!recipe) throw new Error(`Missing recipe category: ${category}`);
  return recipe;
};

const dish = (
  slug: string,
  category: Recipe['category'],
  extra: { ingredientCategory?: string; tags?: readonly string[] } = {},
) => ({
  slug,
  name: slug,
  category,
  tags: [...(extra.tags ?? [])],
  ingredientCategory: extra.ingredientCategory,
});

describe('meal roles', () => {
  it('keeps the main role for savoury dishes eaten with rice', () => {
    expect(getMealRole(dish('suon-xao-chua-ngot', 'Món mặn'))).toBe('main');
    expect(getMealRole(dish('ca-chep-kho-rieng', 'Món mặn', { ingredientCategory: 'Cá' }))).toBe(
      'main',
    );
    expect(getMealRole(dish('dau-hu-kho-nam-rom-chay', 'Món chay'))).toBe('main');
    expect(getMealRole(dish('mi-can-kho-tieu-xanh-chay', 'Món chay'))).toBe('main');
  });

  it.each([
    ['canh-la-lang-xu-quynh', 'Món mặn', {}],
    ['banh-beo-chay-hue', 'Món chay', {}],
    ['men-men-nguoi-mong-ha-giang-cu', 'Món chay', {}],
    ['che-bot-loc-boc-heo-quay-hue', 'Món mặn', { ingredientCategory: 'Món tráng miệng' }],
    ['pho-bo-ha-noi', 'Món nước', {}],
    ['bun-bo-nam-bo', 'Món mặn', { ingredientCategory: 'Món trộn' }],
    ['com-ga-hoi-an', 'Món mặn', {}],
    ['lau-gia-la-e-phu-yen', 'Món mặn', {}],
    ['nem-cua-be-hai-phong', 'Món mặn', { ingredientCategory: 'Món ăn kèm' }],
    ['bun-do-buon-ma-thuot', 'Món mặn', { ingredientCategory: 'Món nước' }],
    ['ca-kho-an-sang', 'Món mặn', { tags: ['bữa sáng'] }],
    ['banh-khoai-tep', 'Món ăn vặt', {}],
  ] as const)('does not treat %s as the main dish of a family meal', (slug, category, extra) => {
    const item = dish(slug, category, extra);
    expect(canServeAsMainDish(item)).toBe(false);
    expect(getMealRole(item)).not.toBe('main');
  });

  it('places a soup filed under savoury dishes in the soup slot', () => {
    expect(
      getMealRole(
        dish('thit-trau-nau-la-lom-hoa-binh', 'Món mặn', { ingredientCategory: 'Món canh' }),
      ),
    ).toBe('soup');
  });
});

describe('meal composition copy', () => {
  it('describes a balanced family meal in polished, useful language', () => {
    const meal = [
      recipeByCategory('Món mặn'),
      recipeByCategory('Món canh'),
      recipeByCategory('Món rau'),
    ];
    const description = describeMealComposition(meal);

    for (const recipe of meal) expect(description).toContain(recipe.name);
    expect(description).not.toContain('nâng đỡ hương vị');
    expect(description.split('. ').length).toBe(1);
  });

  it('mentions extra dishes instead of leaving them out of the meal summary', () => {
    const meal = [
      recipeByCategory('Món mặn'),
      recipeByCategory('Món canh'),
      recipeByCategory('Món rau'),
    ];
    const included = new Set(meal.map((recipe) => recipe.slug));
    const extra = recipes.find((recipe) => !included.has(recipe.slug));
    if (!extra) throw new Error('Expected an extra recipe for the meal summary');
    meal.push(extra);
    const description = describeMealComposition(meal);

    for (const recipe of meal) expect(description).toContain(recipe.name);
    expect(description).toContain('thêm phong phú');
  });

  it('translates the editorial summary when the interface is in English', () => {
    const meal = [
      recipeByCategory('Món mặn'),
      recipeByCategory('Món canh'),
      recipeByCategory('Món rau'),
    ];
    const description = describeMealComposition(meal, (text, vars) => translate('en', text, vars));

    for (const recipe of meal) expect(description).toContain(recipe.name);
    expect(description).toContain('pairs with the gentle flavours of');
    expect(description).not.toContain('balanced, comforting family meal');
    expect(description).not.toContain('thanh dịu');
  });
});

describe('đổi mâm (selectFreshMealSets)', () => {
  const meal = (id: string, recipeSlugs: string[]) => ({ id, recipeSlugs });

  it('returns the first meals unchanged on the first visit', () => {
    const meals = [meal('a', ['1', '2']), meal('b', ['3', '4']), meal('c', ['5', '6'])];
    expect(selectFreshMealSets(meals, new Set(), 2).map((item) => item.id)).toEqual(['a', 'b']);
  });

  it('prefers meals that share no dishes with the previous set', () => {
    const meals = [
      meal('repeat', ['1', '9']),
      meal('fresh-1', ['3', '4']),
      meal('partly', ['5', '2']),
      meal('fresh-2', ['6', '7']),
    ];
    const fresh = selectFreshMealSets(meals, new Set(['1', '2']), 3).map((item) => item.id);
    expect(fresh).toEqual(['fresh-1', 'fresh-2', 'partly']);
  });

  it('still fills the requested count when the catalog is small', () => {
    const meals = [meal('a', ['1']), meal('b', ['2'])];
    expect(selectFreshMealSets(meals, new Set(['1', '2']), 2)).toHaveLength(2);
  });

  it('produces a different set of trays from the real catalog after đổi mâm', () => {
    // Nhân bản kho mẫu để có đủ món như kho thật (mỗi bản giữ nguyên vai trò món).
    const catalog = Array.from({ length: 6 }, (_, copy) =>
      recipes.map((recipe) => ({ ...recipe, slug: `${recipe.slug}-${copy}` })),
    ).flat();
    const first = createHomeMealSuggestions(catalog, 'visit-one').slice(0, 6);
    const shown = new Set(first.flatMap((item) => item.recipeSlugs));
    const next = selectFreshMealSets(createHomeMealSuggestions(catalog, 'visit-two'), shown, 6);

    expect(first.length).toBeGreaterThan(0);
    expect(next).toHaveLength(first.length);
    const firstIds = new Set(first.map((item) => item.id));
    expect(next.some((item) => !firstIds.has(item.id))).toBe(true);
    expect(next.filter((item) => firstIds.has(item.id))).toHaveLength(0);
    // Mỗi mâm mới vẫn giữ đủ món chính, canh và rau.
    for (const item of next) {
      const roles = item.recipeSlugs.map((slug) =>
        getMealRole(catalog.find((recipe) => recipe.slug === slug)!),
      );
      expect(roles).toEqual(expect.arrayContaining(['main', 'soup', 'vegetable']));
    }
  });
});
