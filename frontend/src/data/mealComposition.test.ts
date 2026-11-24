import { describe, expect, it } from 'vitest';

import { canServeAsMainDish, describeMealComposition, getMealRole } from '@/data/mealComposition';
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
