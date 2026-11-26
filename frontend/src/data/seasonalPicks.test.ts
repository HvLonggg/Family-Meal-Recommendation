import { describe, expect, it } from 'vitest';

import type { Recipe } from '@/data/recipes';
import {
  dishClimateOf,
  SEASON_WEIGHTS,
  seasonalWeight,
  seasonOf,
  weightedSeededShuffle,
} from '@/data/seasonalPicks';

const recipe = (slug: string, name: string) => ({ slug, name }) as Recipe;

describe('seasonOf', () => {
  it('maps months in Vietnam time to cold, hot and mild seasons', () => {
    expect(seasonOf(new Date('2026-12-10T05:00:00Z'))).toBe('cold');
    // 20:00 UTC ngày 28/2 đã là 03:00 ngày 1/3 giờ Việt Nam.
    expect(seasonOf(new Date('2026-02-27T20:00:00Z'))).toBe('cold');
    expect(seasonOf(new Date('2026-02-28T20:00:00Z'))).toBe('mild');
    expect(seasonOf(new Date('2026-06-15T05:00:00Z'))).toBe('hot');
    expect(seasonOf(new Date('2026-09-20T05:00:00Z'))).toBe('mild');
    expect(seasonOf(new Date('2026-10-31T18:00:00Z'))).toBe('cold');
  });
});

describe('dishClimateOf', () => {
  it('classifies warming, cooling and neutral dishes by name', () => {
    expect(dishClimateOf(recipe('a', 'Lẩu gà lá é'))).toBe('warming');
    expect(dishClimateOf(recipe('b', 'Cá kho tộ'))).toBe('warming');
    expect(dishClimateOf(recipe('c', 'Canh bí đỏ nấu tôm'))).toBe('warming');
    expect(dishClimateOf(recipe('d', 'Lẩu canh chua cá'))).toBe('warming');
    expect(dishClimateOf(recipe('e', 'Gỏi cuốn tôm thịt'))).toBe('cooling');
    expect(dishClimateOf(recipe('f', 'Canh chua cá lóc'))).toBe('cooling');
    expect(dishClimateOf(recipe('g', 'Chè đậu xanh'))).toBe('cooling');
    expect(dishClimateOf(recipe('h', 'Chè trôi nước'))).toBe('warming');
    expect(dishClimateOf(recipe('i', 'Rau muống xào tỏi'))).toBe('neutral');
    // "gói" (gói lá) không phải "gỏi"; "khoai" không chứa từ "kho".
    expect(dishClimateOf(recipe('j', 'Thịt bằm gói lá nướng'))).toBe('neutral');
    expect(dishClimateOf(recipe('k', 'Khoai lang chiên'))).toBe('neutral');
  });
});

describe('seasonalWeight', () => {
  const lau = recipe('lau', 'Lẩu thái hải sản');
  const goi = recipe('goi', 'Gỏi ngó sen');
  const xao = recipe('xao', 'Rau muống xào tỏi');

  it('favours warming dishes in cold months and keeps cooling ones rare but possible', () => {
    expect(seasonalWeight(lau, 'cold')).toBe(SEASON_WEIGHTS.match);
    expect(seasonalWeight(goi, 'cold')).toBe(SEASON_WEIGHTS.opposite);
    expect(seasonalWeight(goi, 'cold')).toBeGreaterThan(0);
    expect(seasonalWeight(xao, 'cold')).toBe(SEASON_WEIGHTS.neutral);
  });

  it('reverses the preference in hot months and is neutral in spring/autumn', () => {
    expect(seasonalWeight(goi, 'hot')).toBe(SEASON_WEIGHTS.match);
    expect(seasonalWeight(lau, 'hot')).toBe(SEASON_WEIGHTS.opposite);
    for (const item of [lau, goi, xao]) expect(seasonalWeight(item, 'mild')).toBe(1);
  });
});

describe('weightedSeededShuffle', () => {
  const pool = [
    ...Array.from({ length: 10 }, (_, index) => recipe(`lau-${index}`, `Lẩu số ${index}`)),
    ...Array.from({ length: 10 }, (_, index) => recipe(`goi-${index}`, `Gỏi số ${index}`)),
  ];
  const bySlug = (item: Recipe) => item.slug;

  it('is deterministic for the same seed and keeps every item', () => {
    const first = weightedSeededShuffle(pool, 'seed-a', bySlug, (item) =>
      seasonalWeight(item, 'cold'),
    );
    const again = weightedSeededShuffle(pool, 'seed-a', bySlug, (item) =>
      seasonalWeight(item, 'cold'),
    );
    expect(again.map(bySlug)).toEqual(first.map(bySlug));
    expect([...first.map(bySlug)].sort()).toEqual([...pool.map(bySlug)].sort());
  });

  it('puts in-season dishes near the top most of the time, off-season ones rarely', () => {
    const topShare = (season: 'cold' | 'hot', prefix: string) => {
      let hits = 0;
      let total = 0;
      for (let run = 0; run < 200; run += 1) {
        const top = weightedSeededShuffle(pool, `visit-${run}`, bySlug, (item) =>
          seasonalWeight(item, season),
        ).slice(0, 5);
        hits += top.filter((item) => item.slug.startsWith(prefix)).length;
        total += top.length;
      }
      return hits / total;
    };

    const coldOffSeason = topShare('cold', 'goi');
    expect(topShare('cold', 'lau')).toBeGreaterThan(0.85);
    expect(coldOffSeason).toBeGreaterThan(0);
    expect(coldOffSeason).toBeLessThan(0.15);
    expect(topShare('hot', 'goi')).toBeGreaterThan(0.85);
  });

  it('behaves like a plain shuffle when all weights are equal', () => {
    let lauFirst = 0;
    for (let run = 0; run < 200; run += 1) {
      const [head] = weightedSeededShuffle(pool, `mild-${run}`, bySlug, () => 1);
      if (head?.slug.startsWith('lau')) lauFirst += 1;
    }
    expect(lauFirst).toBeGreaterThan(60);
    expect(lauFirst).toBeLessThan(140);
  });
});
