import { describe, expect, it } from 'vitest';

import {
  addDaysIso,
  formatDayMonth,
  formatLunarRange,
  isVegetarianRecipe,
  isoWeekdayOf,
  nextVegetarianDays,
  nextLunarFastingDay,
  resolveVegetarianDay,
  upsertVegetarianMark,
  vegetarianOverrides,
  vegetarianRulesFrom,
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

  it('applies fixed weekday and month-day rules within the selected months', () => {
    const rules = { lunarDays: false, monthDays: [1, 15], weekdays: [0], months: [] as number[] };
    // 2026-11-30 là Thứ Hai, 2026-11-15 là Chủ Nhật, 2026-11-17 là Thứ Ba.
    expect(resolveVegetarianDay('2026-11-30', new Map(), rules)).toEqual({
      vegetarian: true,
      source: 'rule',
    });
    expect(resolveVegetarianDay('2026-11-15', new Map(), rules).source).toBe('rule');
    expect(resolveVegetarianDay('2026-11-17', new Map(), rules)).toEqual({
      vegetarian: false,
      source: 'none',
    });
    const julyOnly = { ...rules, months: [7] };
    expect(resolveVegetarianDay('2026-11-30', new Map(), julyOnly).vegetarian).toBe(false);
    expect(resolveVegetarianDay('2026-07-15', new Map(), julyOnly).vegetarian).toBe(true);
    expect(resolveVegetarianDay('2026-07-06', new Map(), julyOnly).vegetarian).toBe(true);
    expect(isoWeekdayOf('2026-11-29')).toBe(6);
  });

  it('lets a manual mark override the fixed rule and keeps lunar days off by default', () => {
    const rules = vegetarianRulesFrom({ vegetarian_weekdays: [0] });
    expect(rules.lunarDays).toBe(false);
    const overrides = vegetarianOverrides([{ day: '2026-11-30', is_vegetarian: false }]);
    expect(resolveVegetarianDay('2026-11-30', overrides, rules)).toEqual({
      vegetarian: false,
      source: 'manual',
    });
    // 2026-09-25 là rằm: không tự đánh dấu khi người dùng chưa bật.
    expect(resolveVegetarianDay('2026-09-25', new Map(), vegetarianRulesFrom({}))).toEqual({
      vegetarian: false,
      source: 'none',
    });
    expect(
      resolveVegetarianDay(
        '2026-09-25',
        new Map(),
        vegetarianRulesFrom({ vegetarian_lunar_days: true }),
      ).source,
    ).toBe('lunar');
    expect(nextVegetarianDays('2026-11-28', rules, 2)).toEqual(['2026-11-30', '2026-12-07']);
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

describe('fasting days follow the active calendar', () => {
  const base = { lunarDays: true, monthDays: [], weekdays: [], months: [] };

  it('marks solar 1st and 15th on the solar calendar', () => {
    const rules = { ...base, calendar: 'solar' as const };
    expect(resolveVegetarianDay('2026-12-01', new Map(), rules).vegetarian).toBe(true);
    expect(resolveVegetarianDay('2026-12-15', new Map(), rules).vegetarian).toBe(true);
    expect(resolveVegetarianDay('2026-12-02', new Map(), rules).vegetarian).toBe(false);
  });

  it('marks nothing automatically when the option is off', () => {
    const rules = { ...base, lunarDays: false, calendar: 'solar' as const };
    expect(resolveVegetarianDay('2026-12-01', new Map(), rules).vegetarian).toBe(false);
    expect(resolveVegetarianDay('2026-12-15', new Map(), rules).vegetarian).toBe(false);
  });
});
