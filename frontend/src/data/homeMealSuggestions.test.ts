import { describe, expect, it } from 'vitest';

import {
  createHomeMealSuggestions,
  getHomeMealSuggestionKey,
  selectHomeMealSuggestions,
} from '@/data/homeMealSuggestions';
import { getMealRole, hasVegetarianMealLabel } from '@/data/mealComposition';
import { recipes, type Recipe } from '@/data/recipes';
import { dishClimateOf, type Season } from '@/data/seasonalPicks';

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

  it('keeps the meal composition and favours in-season dishes when a season is given', () => {
    const base = recipes[0]!;
    const make = (slug: string, name: string, category: Recipe['category']): Recipe => ({
      ...base,
      slug,
      name,
      category,
      region: 'Ba miền',
      tags: [],
    });
    const many = (count: number, prefix: string, name: string, category: Recipe['category']) =>
      Array.from({ length: count }, (_, index) =>
        make(`${prefix}-${index}`, `${name} ${index}`, category),
      );
    // Món mặn và rau trung tính; chỉ món canh khác nhau: canh hầm (ấm) và canh chua (mát).
    const catalog = [
      ...many(40, 'thit', 'Thịt rang cháy cạnh', 'Món mặn'),
      ...many(40, 'canh-ham', 'Canh hầm xương', 'Món canh'),
      ...many(40, 'canh-chua', 'Canh chua cá', 'Món canh'),
      ...many(40, 'rau', 'Rau cải xào', 'Món rau'),
    ];
    const bySlug = new Map(catalog.map((item) => [item.slug, item]));
    const coolingSoupShare = (season?: Season) => {
      let cooling = 0;
      let total = 0;
      for (let run = 0; run < 40; run += 1) {
        const seed = `season-${run}`;
        const candidates = createHomeMealSuggestions(catalog, seed, season);
        for (const meal of selectHomeMealSuggestions(candidates, seed, [], 8)) {
          const items = meal.recipeSlugs.map((slug) => bySlug.get(slug)!);
          expect(items.map(getMealRole)).toEqual(['main', 'soup', 'vegetable']);
          if (dishClimateOf(items[1]!) === 'cooling') cooling += 1;
          total += 1;
        }
      }
      return cooling / total;
    };

    const baseline = coolingSoupShare();
    const cold = coolingSoupShare('cold');
    const hot = coolingSoupShare('hot');
    expect(baseline).toBeGreaterThan(0.35);
    expect(baseline).toBeLessThan(0.65);
    // Trời lạnh: canh chua hiếm hơn hẳn nhưng không biến mất; trời nóng thì ngược lại.
    expect(cold).toBeLessThan(0.2);
    expect(cold).toBeGreaterThan(0);
    expect(hot).toBeGreaterThan(0.8);
    expect(coolingSoupShare('mild')).toBeGreaterThan(0.3);
    expect(coolingSoupShare('mild')).toBeLessThan(0.7);
    expect(createHomeMealSuggestions(catalog, 'x', 'cold')[0]?.seasonWeight).toBeGreaterThan(0);
    expect(createHomeMealSuggestions(catalog, 'x')[0]?.seasonWeight).toBeUndefined();
  });
});
