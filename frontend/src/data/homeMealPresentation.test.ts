import { describe, expect, it } from 'vitest';
import { describeHomeMeal, resolveHomeMealRecipes } from '@/data/homeMealPresentation';
import { getMealRecipes, mealSets } from '@/data/recipes';
import { translate } from '@/features/i18n/translate';

const dishes = getMealRecipes(mealSets[0]!.recipeSlugs);
describe('concise home meal presentation', () => {
  it('uses every displayed dish name once and omits long generic filler', () => {
    const result = describeHomeMeal(dishes, (key, vars) => translate('vi', key, vars), 'vi-VN');
    for (const dish of dishes) expect(result.split(dish.name)).toHaveLength(2);
    expect(result.length).toBeLessThan(dishes.map((dish) => dish.name).join(', ').length + 50);
  });
  it('uses the supplied language and produces stable copy for a meal', () => {
    const items = [
      { slug: 'fish', name: 'Braised fish' },
      { slug: 'greens', name: 'Boiled greens' },
    ];
    const t = (key: string, vars?: Record<string, string | number>) => translate('en', key, vars);
    const description = describeHomeMeal(items, t, 'en-US');
    expect(description).toContain('Braised fish and Boiled greens');
    expect(description).not.toMatch(/mâm|cơm|Kết hợp/);
    expect(describeHomeMeal(items, t, 'en-US')).toBe(description);
  });
  it('resolves only available distinct dishes in the exact tray order', () => {
    expect(
      resolveHomeMealRecipes(
        [dishes[1]!.slug, 'missing', dishes[0]!.slug, dishes[1]!.slug],
        dishes,
      ),
    ).toEqual([dishes[1], dishes[0]]);
    expect(describeHomeMeal([], (key) => key, 'vi-VN')).toBe('');
  });
});
