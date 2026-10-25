import { describe, expect, it } from 'vitest';

import { getNutritionMatches } from '@/data/nutritionRecommendations';
import { recipeMinutes, recipes } from '@/data/recipes';
import { matchesRecipeCategory } from '@/data/recipeSearch';

describe('nutrition meal recommendations', () => {
  it('interleaves relevant dish groups for balanced meal planning', () => {
    const catalog = [
      { ...recipes[0]!, category: 'Món mặn' as const },
      { ...recipes[1]!, category: 'Món canh' as const },
      { ...recipes[2]!, category: 'Món rau' as const },
      { ...recipes[3]!, category: 'Món chay' as const },
    ];
    const matches = getNutritionMatches(catalog, 'balanced');

    expect(matches.length).toBeGreaterThan(0);
    expect(new Set(matches.map((recipe) => recipe.slug)).size).toBe(matches.length);
    expect(matches.slice(0, 4).map((recipe) => recipe.category)).toEqual([
      'Món mặn',
      'Món canh',
      'Món rau',
      'Món chay',
    ]);
  });

  it('filters lighter options using recipe attributes and handles English categories', () => {
    const light = getNutritionMatches(recipes, 'light');
    expect(light.length).toBeGreaterThan(0);
    expect(matchesRecipeCategory({ category: 'Soup' }, ['Món canh', 'Soup'])).toBe(true);
  });

  it('filters family-friendly and quick recipes by matching attributes', () => {
    const mild = {
      ...recipes.find((recipe) => recipe.difficulty === 'Dễ')!,
      ingredients: [{ group: 'Nguyên liệu', items: [{ name: 'Rau cải', amount: 200, unit: 'g' }] }],
    };
    const family = getNutritionMatches([mild], 'family');
    const quick = getNutritionMatches(recipes, 'quick');
    const spicy = {
      ...mild,
      ingredients: [{ group: 'Gia vị', items: [{ name: 'Ớt', amount: 1, unit: 'quả' }] }],
    };
    const chiliPowder = {
      ...mild,
      ingredients: [{ group: 'Gia vị', items: [{ name: 'Ớt bột', amount: 1, unit: 'g' }] }],
    };
    const bellPepper = {
      ...mild,
      ingredients: [
        { group: 'Nguyên liệu', items: [{ name: 'Ớt chuông', amount: 1, unit: 'quả' }] },
      ],
    };

    expect(family.length).toBeGreaterThan(0);
    expect(family.every((recipe) => recipe.difficulty === 'Dễ')).toBe(true);
    expect(getNutritionMatches([spicy], 'family')).toEqual([]);
    expect(getNutritionMatches([chiliPowder], 'family')).toEqual([]);
    expect(getNutritionMatches([bellPepper], 'family')).toHaveLength(1);
    expect(quick.length).toBeGreaterThan(0);
    expect(quick.every((recipe) => recipeMinutes(recipe) <= 30)).toBe(true);
  });

  it('uses editorial family and spice fields when the catalog provides them', () => {
    const base = recipes.find((recipe) => recipe.difficulty === 'Dễ')!;
    const reviewedRecipe = {
      ...base,
      difficulty: 'Khó' as const,
      familyFriendly: true,
      spicyLevel: 1,
    };
    const spicyRecipe = { ...reviewedRecipe, spicyLevel: 2 };
    const notFamilyFriendly = { ...reviewedRecipe, familyFriendly: false };

    expect(getNutritionMatches([reviewedRecipe], 'family')).toEqual([reviewedRecipe]);
    expect(getNutritionMatches([spicyRecipe], 'family')).toEqual([]);
    expect(getNutritionMatches([notFamilyFriendly], 'family')).toEqual([]);
  });

  it('includes gentle vegetarian soups and vegetables while excluding fried dishes', () => {
    const base = recipes[0]!;
    const lightVegetarian = {
      ...base,
      category: 'Món chay' as const,
      tags: ['Món chay'],
      ingredients: [{ group: 'Nguyên liệu', items: [{ name: 'Đậu phụ', amount: 200, unit: 'g' }] }],
    };
    const friedVegetarian = { ...lightVegetarian, name: 'Đậu phụ chiên giòn' };

    expect(getNutritionMatches([lightVegetarian], 'light')).toEqual([lightVegetarian]);
    expect(getNutritionMatches([friedVegetarian], 'light')).toEqual([]);
  });
});
