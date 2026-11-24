import { describe, expect, it } from 'vitest';

import {
  createHomeMealSuggestions,
  getHomeMealSuggestionKey,
  selectHomeMealSuggestions,
} from '@/data/homeMealSuggestions';
import { getMealRole, hasVegetarianMealLabel } from '@/data/mealComposition';
import { recipes } from '@/data/recipes';

describe('home meal suggestions', () => {
  it('creates distinct meals with a main, a soup and vegetables from the catalog', () => {
    const suggestions = createHomeMealSuggestions(recipes, 'stable-test-seed');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(new Set(suggestions.map(getHomeMealSuggestionKey)).size).toBe(suggestions.length);
    expect(suggestions.every((meal) => meal.recipeSlugs.length === 3)).toBe(true);
    expect(
      suggestions.every((meal) => new Set(meal.recipeSlugs).size === meal.recipeSlugs.length),
    ).toBe(true);
    for (const meal of suggestions) {
      const items = meal.recipeSlugs.map((slug) => recipes.find((item) => item.slug === slug)!);
      expect(items.every(Boolean)).toBe(true);
      expect(items.map(getMealRole)).toEqual(['main', 'soup', 'vegetable']);
      expect(meal.title).toBe(`Mâm cơm cùng ${items[0]!.name}`);
      expect(meal.anchorName).toBe(items[0]!.name);
      const anchor = recipes.find((item) => `goi-y-${item.slug}` === meal.id)!;
      expect(meal.recipeSlugs).toContain(anchor.slug);
      if (hasVegetarianMealLabel(anchor)) expect(items.every(hasVegetarianMealLabel)).toBe(true);
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
    const visitOrders = Array.from({ length: 10 }, (_, index) =>
      createHomeMealSuggestions(recipes, `visit-${index}`).map(getHomeMealSuggestionKey).join(';'),
    );
    expect(new Set(visitOrders).size).toBeGreaterThan(1);
    expect(nextVisit.length).toBeGreaterThan(0);
    expect(new Set(nextVisit.map(getHomeMealSuggestionKey)).size).toBe(nextVisit.length);
  });

  it('prioritizes unseen platters and does not duplicate a combination in the same visit', () => {
    const candidates = createHomeMealSuggestions(recipes, 'selection-test');
    const recent = candidates.slice(0, 1).map(getHomeMealSuggestionKey);
    const selected = selectHomeMealSuggestions(candidates, 'next-visit', recent, 1);
    expect(selected).toHaveLength(1);
    expect(recent).not.toContain(getHomeMealSuggestionKey(selected[0]!));
    const fallback = selectHomeMealSuggestions(
      candidates,
      'limited-catalog',
      candidates.map(getHomeMealSuggestionKey),
      candidates.length + 5,
    );
    expect(fallback).toHaveLength(candidates.length);
    expect(new Set(fallback.map(getHomeMealSuggestionKey)).size).toBe(fallback.length);
  });

  it('does not make an incomplete platter when the catalog has no soup or vegetables', () => {
    expect(
      createHomeMealSuggestions(recipes.filter((recipe) => getMealRole(recipe) === 'main')),
    ).toEqual([]);
    expect(createHomeMealSuggestions([])).toEqual([]);
  });
});
