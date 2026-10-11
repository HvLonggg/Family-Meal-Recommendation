import { afterEach, describe, expect, it } from 'vitest';

import { getRecipe, recipes, recipeText, setRecipeDictionary } from '@/data/recipes';
import dictionary from '@/features/i18n/recipeContent.en.json';

const english = dictionary as Record<string, string>;

describe('recipe content localization', () => {
  afterEach(() => setRecipeDictionary(null));

  it('translates names, descriptions, ingredients and tips for every bundled recipe', () => {
    const missing = recipes
      .flatMap((recipe) => [
        recipe.name,
        recipe.excerpt,
        ...recipe.ingredients.flatMap((group) => [
          group.group,
          ...group.items.flatMap((item) => [item.name, item.unit, item.note ?? '']),
        ]),
        ...(recipe.tips ?? [recipe.tip]),
      ])
      .filter((text) => text && !(text.trim() in english));
    expect(missing).toEqual([]);
  });

  it('swaps the catalog to English and back without losing Vietnamese search aliases', () => {
    const slug = recipes[0]!.slug;
    const vietnameseName = getRecipe(slug)!.name;

    setRecipeDictionary(english);
    const translated = getRecipe(slug)!;
    expect(translated.name).toBe(english[vietnameseName]);
    expect(translated.aliases).toContain(vietnameseName);
    expect(translated.preparation).toEqual(recipes.find((item) => item.slug === slug)!.preparation);
    expect(recipeText('Nước mắm')).toBe('Fish sauce');

    setRecipeDictionary(null);
    expect(getRecipe(slug)!.name).toBe(vietnameseName);
    expect(recipeText('Nước mắm')).toBe('Nước mắm');
  });

  it('keeps Vietnamese text when a translation is missing', () => {
    setRecipeDictionary(english);
    expect(recipeText('Món chưa có bản dịch')).toBe('Món chưa có bản dịch');
  });
});
