import { describe, expect, it } from 'vitest';

import {
  calculateMealStats,
  createMealSlots,
  getCandidates,
  getNextWheelRotation,
  pickRandomDish,
  restoreMealSlots,
} from '@/data/randomMeals';

describe('random meal helpers', () => {
  it('creates a balanced four-dish tray with dessert', () => {
    expect(createMealSlots(4).map((slot) => slot.role)).toEqual([
      'main',
      'soup',
      'vegetable',
      'dessert',
    ]);
  });

  it('picks a dish matching the requested role', () => {
    const dish = pickRandomDish('main', 'balanced', [], () => 0);
    expect(dish?.role).toBe('main');
  });

  it('does not offer the same recipe again in another meal role', () => {
    const candidates = getCandidates('side', 'balanced', ['trung-chien-rau-cu']);
    expect(candidates.every((dish) => dish.sourceKey !== 'trung-chien-rau-cu')).toBe(true);
  });

  it('restores a saved tray and recalculates its nutrition summary', () => {
    const slots = restoreMealSlots([
      'main:ca-chep-kho-rieng',
      'soup:canh-chua-ca',
      'dessert:seasonal-fruit',
    ]);
    const stats = calculateMealStats(slots);
    expect(slots).toHaveLength(3);
    expect(stats.calories).toBe(520);
    expect(stats.protein).toBe(42);
  });

  it.each([3, 4, 5, 6])('lands every segment of a %i-dish wheel under the top pointer', (count) => {
    let rotation = 0;
    for (let round = 0; round < 2; round += 1) {
      for (let index = 0; index < count; index += 1) {
        const next = getNextWheelRotation(rotation, index, count);
        expect(next - rotation).toBeGreaterThanOrEqual(1080);
        const centerAngle = ((index + 0.5) * 360) / count;
        expect((next + centerAngle) % 360).toBeCloseTo(0);
        rotation = next;
      }
    }
  });
});
