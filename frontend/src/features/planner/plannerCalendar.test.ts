import { describe, expect, it } from 'vitest';

import {
  addDaysIso,
  formatDayMonth,
  formatLunarRange,
  isVegetarianRecipe,
  nextLunarFastingDay,
  resolveVegetarianDay,
  upsertVegetarianMark,
  vegetarianOverrides,
} from '@/features/planner/plannerCalendar';

describe('planner calendar helpers', () => {
  it('adds days across month and year boundaries without time zone drift', () => {
    expect(addDaysIso('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDaysIso('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDaysIso('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('lets manual marks override the automatic 1st/15th lunar rule', () => {
    // 2026-09-25 là rằm tháng Tám, 2026-09-23 là ngày thường.
    const overrides = vegetarianOverrides(
      [{ day: '2026-09-25', is_vegetarian: false }],
      [{ day: '2026-09-23', is_vegetarian: true }],
    );
    expect(resolveVegetarianDay('2026-09-25', new Map(), true)).toEqual({
      vegetarian: true,
      source: 'lunar',
    });
    expect(resolveVegetarianDay('2026-09-25', new Map(), false).vegetarian).toBe(false);
    expect(resolveVegetarianDay('2026-09-25', overrides, true)).toEqual({
      vegetarian: false,
      source: 'manual',
    });
    expect(resolveVegetarianDay('2026-09-23', overrides, false)).toEqual({
      vegetarian: true,
      source: 'manual',
    });
  });

  it('upserts marks in date order', () => {
    const marks = upsertVegetarianMark(
      [{ day: '2026-09-25', is_vegetarian: true }],
      '2026-09-23',
      true,
    );
    expect(upsertVegetarianMark(marks, '2026-09-25', false)).toEqual([
      { day: '2026-09-23', is_vegetarian: true },
      { day: '2026-09-25', is_vegetarian: false },
    ]);
  });

  it('finds the next 1st or 15th lunar day after today', () => {
    expect(nextLunarFastingDay('2026-09-23')).toMatchObject({ value: '2026-09-25', daysAway: 2 });
    const afterFullMoon = nextLunarFastingDay('2026-09-25');
    expect(afterFullMoon?.lunar.day).toBe(1);
    expect(afterFullMoon?.lunar.month).toBe(9);
  });

  it('formats short solar and lunar ranges', () => {
    expect(formatDayMonth(new Date('2026-09-05T12:00:00'), 'vi-VN')).toBe('05/09');
    expect(formatDayMonth(new Date('2026-09-05T12:00:00'), 'en-US')).toBe('09/05');
    expect(formatLunarRange('2026-09-21', '2026-09-27')).toBe('11/8 – 17/8 · Bính Ngọ');
  });

  it('recognises vegetarian recipes by category or tag', () => {
    expect(isVegetarianRecipe({ category: 'Món chay', tags: [] })).toBe(true);
    expect(isVegetarianRecipe({ category: 'Món rau', tags: ['xào', 'Món chay'] })).toBe(true);
    expect(isVegetarianRecipe({ category: 'Món mặn', tags: ['rang'] })).toBe(false);
  });
});
