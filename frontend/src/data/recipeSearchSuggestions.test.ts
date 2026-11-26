import { describe, expect, it } from 'vitest';

import {
  matchesRecipeSuggestion,
  pickRecipeSearchSuggestions,
  RECIPE_SEARCH_SUGGESTIONS,
  recipeSuggestionHref,
  type RecipeSearchSuggestion,
} from '@/data/recipeSearchSuggestions';
import { getRecipe, recipes } from '@/data/recipes';

const labels = (suggestions: RecipeSearchSuggestion[]) => suggestions.map(({ label }) => label);
const byLabel = (label: string) => RECIPE_SEARCH_SUGGESTIONS.find((item) => item.label === label)!;

describe('home search suggestions', () => {
  it('rotates topics that return real recipe matches', () => {
    const suggestions = pickRecipeSearchSuggestions(
      recipes,
      RECIPE_SEARCH_SUGGESTIONS.length,
      () => 0,
    );

    const topicsWithMatches = RECIPE_SEARCH_SUGGESTIONS.filter((suggestion) =>
      recipes.some((recipe) => matchesRecipeSuggestion(recipe, suggestion)),
    );
    expect(suggestions).toEqual(topicsWithMatches);
    expect(new Set(labels(suggestions)).size).toBe(topicsWithMatches.length);
  });

  it('shows only topics that have matching recipes in the catalog', () => {
    const carpOnly = recipes.filter((recipe) => recipe.slug === 'ca-chep-kho-rieng');
    const suggestions = labels(pickRecipeSearchSuggestions(carpOnly, 4, () => 0));

    expect(suggestions).toContain('Món hải sản');
    expect(suggestions).not.toContain('Món thanh đạm');
    expect(suggestions).not.toContain('Món chay');
    expect(suggestions).not.toContain('Nấu trong 30 phút');
  });

  it('offers a broader rotating set and defaults to five useful suggestions', () => {
    const suggestions = pickRecipeSearchSuggestions(recipes, undefined, () => 0);

    expect(RECIPE_SEARCH_SUGGESTIONS.length).toBeGreaterThan(10);
    expect(suggestions).toHaveLength(5);
    expect(labels(suggestions)).toContain('Món canh');
    expect(
      labels(pickRecipeSearchSuggestions(recipes, RECIPE_SEARCH_SUGGESTIONS.length)),
    ).toContain('Món miền Bắc');
  });

  it('opens catalog filters instead of a free-text search for dish groups', () => {
    expect(recipeSuggestionHref(byLabel('Món hải sản'))).toBe(
      '/recipes?ingredients=fish%2Cshrimp%2Cseafood',
    );
    expect(recipeSuggestionHref(byLabel('Món canh'))).toBe('/recipes?category=M%C3%B3n+canh');
    expect(recipeSuggestionHref(byLabel('Món miền Bắc'))).toBe('/recipes?region=B%E1%BA%AFc');
    expect(RECIPE_SEARCH_SUGGESTIONS.map(({ label }) => label)).not.toContain('Món rau củ');

    const seafood = byLabel('Món hải sản');
    expect(matchesRecipeSuggestion(getRecipe('ca-chep-kho-rieng')!, seafood)).toBe(true);
    expect(matchesRecipeSuggestion(getRecipe('rau-muong-xao-toi')!, seafood)).toBe(false);
  });
});
