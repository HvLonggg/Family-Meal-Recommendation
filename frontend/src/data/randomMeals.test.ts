import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  calculateMealStats,
  createMealSlots,
  formatSavedMealTime,
  getCandidates,
  getNextWheelRotation,
  getRandomDishCatalog,
  pickRandomDish,
  restoreMealSlots,
} from '@/data/randomMeals';
import { adaptRecipe, type ApiRecipe } from '@/data/recipeApi';
import { getRecipeCatalog, replaceRecipeCatalog } from '@/data/recipes';

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

  it('formats the saved time as HH:mm dd/MM/yyyy', () => {
    expect(formatSavedMealTime(new Date(2026, 10, 4, 9, 5).toISOString())).toBe('09:05 04/11/2026');
    expect(formatSavedMealTime('not-a-date')).toBe('');
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

describe('random meal roles on the full catalog', () => {
  const snapshotPath = resolve(process.cwd(), 'public/data/recipe-catalog.json');

  it.runIf(existsSync(snapshotPath))(
    'only offers savoury rice dishes as the main dish and keeps one role per slot',
    () => {
      const snapshot = JSON.parse(readFileSync(snapshotPath, 'utf8')) as { data: ApiRecipe[] };
      const ids = new Map(
        snapshot.data.flatMap((item) =>
          item.catalog_id ? [[item.catalog_id, item.slug] as const] : [],
        ),
      );
      replaceRecipeCatalog(snapshot.data.map((item) => adaptRecipe(item, ids)));

      const catalog = getRandomDishCatalog();
      const mains = catalog.filter((dish) => dish.role === 'main');
      expect(mains.length).toBeGreaterThan(100);
      // Trước đây gần 60% kho món rơi vào ô món chính, gồm cả canh, bún, phở, chè, bánh.
      expect(mains.length).toBeLessThan(getRecipeCatalog().length * 0.35);
      const offRole = /^(canh|sup|che|banh|bun|pho|chao|xoi|lau|com|mien|hu-tieu)(-|$)/;
      expect(
        mains.filter((dish) => offRole.test(dish.sourceKey)).map((dish) => dish.sourceKey),
      ).toEqual([]);
      const mainKeys = new Set(mains.map((dish) => dish.sourceKey));
      const soupKeys = new Set(
        catalog.filter((dish) => dish.role === 'soup').map((d) => d.sourceKey),
      );
      expect([...mainKeys].filter((key) => soupKeys.has(key))).toEqual([]);

      for (let round = 0; round < 30; round += 1) {
        const used: string[] = [];
        let seed = round + 1;
        const random = () => {
          seed = (seed * 9301 + 49297) % 233280;
          return seed / 233280;
        };
        const tray = createMealSlots(6).map((slot) => {
          const dish = pickRandomDish(slot.role, 'balanced', used, random);
          if (dish) used.push(dish.sourceKey);
          return dish;
        });
        expect(tray.every(Boolean)).toBe(true);
        expect(new Set(used).size).toBe(used.length);
        expect(tray.filter((dish) => soupKeys.has(dish!.sourceKey))).toHaveLength(1);
      }
    },
  );
});
