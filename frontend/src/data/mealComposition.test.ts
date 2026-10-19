import { describe, expect, it } from 'vitest';

import { describeMealComposition } from '@/data/mealComposition';
import { recipes } from '@/data/recipes';
import { translate } from '@/features/i18n/translate';

const recipeByCategory = (category: string) => {
  const recipe = recipes.find((item) => item.category === category);
  if (!recipe) throw new Error(`Missing recipe category: ${category}`);
  return recipe;
};

describe('meal composition copy', () => {
  it('describes a balanced family meal in polished, useful language', () => {
    const meal = [
      recipeByCategory('Món mặn'),
      recipeByCategory('Món canh'),
      recipeByCategory('Món rau'),
    ];
    const description = describeMealComposition(meal);

    for (const recipe of meal) expect(description).toContain(recipe.name);
    expect(description).toContain('nâng đỡ hương vị');
    expect(description).toContain('tròn vị');
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
    expect(description).toContain('balanced, comforting family meal');
    expect(description).not.toContain('thanh dịu');
  });
});
