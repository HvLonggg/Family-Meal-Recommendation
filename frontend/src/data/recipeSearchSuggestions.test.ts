import { describe, expect, it } from 'vitest';

import {
  pickRecipeSearchSuggestions,
  RECIPE_SEARCH_SUGGESTIONS,
} from '@/data/recipeSearchSuggestions';
import { recipes } from '@/data/recipes';
import { matchesRecipeSearch } from '@/data/recipeSearch';

describe('home search suggestions', () => {
  it('rotates semantic topics that return real recipe matches', () => {
    const suggestions = pickRecipeSearchSuggestions(
      recipes,
      RECIPE_SEARCH_SUGGESTIONS.length,
      () => 0,
    );

    const topicsWithMatches = RECIPE_SEARCH_SUGGESTIONS.filter((query) =>
      recipes.some((recipe) => matchesRecipeSearch(recipe, query)),
    );
    expect(suggestions).toHaveLength(topicsWithMatches.length);
    expect(new Set(suggestions).size).toBe(topicsWithMatches.length);
    for (const query of suggestions) {
      expect(recipes.some((recipe) => matchesRecipeSearch(recipe, query))).toBe(true);
    }
    expect(suggestions).toEqual(topicsWithMatches);
  });

  it('shows only topics that have matching recipes in the catalog', () => {
    const carpOnly = recipes.filter((recipe) => recipe.slug === 'ca-chep-kho-rieng');
    const suggestions = pickRecipeSearchSuggestions(carpOnly, 4, () => 0);

    expect(suggestions).toContain('Món hải sản');
    expect(suggestions).not.toContain('Món thanh đạm');
    expect(suggestions).not.toContain('Món chay');
    expect(suggestions).not.toContain('Nấu trong 30 phút');
  });

  it('offers a broader rotating set and defaults to five useful suggestions', () => {
    const suggestions = pickRecipeSearchSuggestions(recipes, undefined, () => 0);

    expect(RECIPE_SEARCH_SUGGESTIONS.length).toBeGreaterThan(10);
    expect(suggestions).toHaveLength(5);
    expect(suggestions).toContain('Món canh');
    for (const query of suggestions) {
      expect(recipes.some((recipe) => matchesRecipeSearch(recipe, query))).toBe(true);
    }
    expect(pickRecipeSearchSuggestions(recipes, RECIPE_SEARCH_SUGGESTIONS.length)).toContain(
      'Món miền Bắc',
    );
  });
});
