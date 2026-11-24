import { describe, expect, it } from 'vitest';

import type { Recipe } from '@/data/recipes';
import { seasonOf, selectSeasonalRecipes } from '@/data/seasonalPicks';

const recipe = (slug: string, name: string) => ({ slug, name }) as Recipe;
const catalog = [
  recipe('lau-ga', 'Lẩu gà lá é'),
  recipe('chao-ca', 'Cháo cá chép'),
  recipe('thit-kho', 'Thịt kho trứng'),
  recipe('goi-cuon', 'Gỏi cuốn tôm thịt'),
  recipe('canh-chua', 'Canh chua cá lóc'),
  recipe('rau-xao', 'Rau muống xào tỏi'),
];

describe('seasonal picks', () => {
  it('maps months in Vietnam time to cold and hot seasons', () => {
    expect(seasonOf(new Date('2026-12-10T05:00:00Z'))).toBe('cold');
    expect(seasonOf(new Date('2026-02-27T20:00:00Z'))).toBe('cold');
    expect(seasonOf(new Date('2026-06-15T05:00:00Z'))).toBe('hot');
  });

  it('puts warming dishes first in cold weather and skips unrelated ones', () => {
    const picks = selectSeasonalRecipes(catalog, 'cold', new Date('2026-12-10'), 10);
    expect(
      picks
        .slice(0, 2)
        .map((item) => item.slug)
        .sort(),
    ).toEqual(['chao-ca', 'lau-ga']);
    expect(picks.map((item) => item.slug)).toContain('thit-kho');
    expect(picks.map((item) => item.slug)).not.toContain('rau-xao');
  });

  it('suggests refreshing dishes in hot weather and is stable within a day', () => {
    const date = new Date('2026-06-15T03:00:00Z');
    const picks = selectSeasonalRecipes(catalog, 'hot', date, 10).map((item) => item.slug);
    expect(picks).toEqual(expect.arrayContaining(['goi-cuon', 'canh-chua']));
    expect(picks).not.toContain('lau-ga');
    expect(selectSeasonalRecipes(catalog, 'hot', date, 10).map((item) => item.slug)).toEqual(picks);
  });
});
