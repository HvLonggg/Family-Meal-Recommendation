import { describe, expect, it } from 'vitest';

import { estimateRecipeNutrition, formatDuration } from '@/data/nutritionEstimate';
import type { Recipe } from '@/data/recipes';

const recipe = (items: { name: string; amount: number | null; unit: string }[], servings = 4) =>
  ({ servings, ingredients: [{ group: 'Nguyên liệu', items }] }) as unknown as Recipe;

describe('estimateRecipeNutrition', () => {
  it('estimates one serving from ingredient amounts', () => {
    const result = estimateRecipeNutrition(
      recipe([
        { name: 'Thịt ba chỉ', amount: 400, unit: 'g' },
        { name: 'Trứng vịt', amount: 4, unit: 'quả' },
        { name: 'Cà chua', amount: 200, unit: 'g' },
        { name: 'Nước nấu', amount: 1000, unit: 'ml' },
        { name: 'Muối', amount: 5, unit: 'g' },
      ]),
    );
    // 400 g ba chỉ + 260 g trứng vịt + 200 g cà chua, chia 4 người.
    expect(result).toEqual({ calories: 390, protein: 25, vegetableGrams: 50 });
  });

  it('does not mistake tomatoes for fish and returns null when nothing is recognised', () => {
    const tomato = estimateRecipeNutrition(
      recipe([{ name: 'Cà chua', amount: 400, unit: 'g' }], 1),
    );
    expect(tomato?.protein).toBe(2);
    expect(estimateRecipeNutrition(recipe([{ name: 'Muối', amount: 5, unit: 'g' }]))).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats minutes as hours and minutes', () => {
    expect(formatDuration(45)).toBe('45 phút');
    expect(formatDuration(135)).toBe('2h15p');
    expect(formatDuration(185)).toBe('3h05p');
    expect(formatDuration(120)).toBe('2h');
    expect(formatDuration(135, 'en')).toBe('2h 15m');
  });
});
