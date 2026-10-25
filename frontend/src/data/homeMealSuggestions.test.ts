import { describe, expect, it } from 'vitest';

import { createHomeMealSuggestions } from '@/data/homeMealSuggestions';
import { recipes } from '@/data/recipes';

describe('home meal suggestions', () => {
  it('creates balanced suggestions that keep every catalog recipe discoverable', () => {
    const suggestions = createHomeMealSuggestions(recipes, 'stable-test-seed');
    const includedSlugs = new Set(suggestions.flatMap((meal) => meal.recipeSlugs));

    expect(suggestions).toHaveLength(recipes.length);
    expect(includedSlugs).toEqual(new Set(recipes.map((recipe) => recipe.slug)));
    expect(suggestions.every((meal) => meal.recipeSlugs.length >= 3)).toBe(true);
    expect(
      suggestions.every((meal) => new Set(meal.recipeSlugs).size === meal.recipeSlugs.length),
    ).toBe(true);
    for (const meal of suggestions) {
      expect(meal.description).not.toContain('Gợi ý kết hợp');
      for (const slug of meal.recipeSlugs) {
        const recipe = recipes.find((item) => item.slug === slug)!;
        expect(meal.description).toContain(recipe.name);
      }
    }
  });

  it('keeps a stable order for one page visit and varies the featured order on a new visit', () => {
    const firstVisit = createHomeMealSuggestions(recipes, 'visit-one');
    const sameVisit = createHomeMealSuggestions(recipes, 'visit-one');
    const nextVisit = createHomeMealSuggestions(recipes, 'visit-two');

    expect(firstVisit.map((meal) => meal.id)).toEqual(sameVisit.map((meal) => meal.id));
    expect(nextVisit.map((meal) => meal.id)).not.toEqual(firstVisit.map((meal) => meal.id));
    expect(nextVisit).toHaveLength(firstVisit.length);
  });
});
