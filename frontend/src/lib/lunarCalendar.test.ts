import { describe, expect, it } from 'vitest';

import {
  isLunarFastingDay,
  lunarDayCanChi,
  lunarFromIsoDate,
  lunarMonthCanChi,
  lunarYearName,
  numericLunarLabel,
  shortLunarLabel,
  solarToLunar,
  vietnamToday,
} from '@/lib/lunarCalendar';

const pick = ({ day, month, year, leap }: ReturnType<typeof solarToLunar>) => ({
  day,
  month,
  year,
  leap,
});

describe('Vietnamese lunar calendar', () => {
  it.each([
    ['2023-01-22', { day: 1, month: 1, year: 2023, leap: false }],
    ['2024-02-10', { day: 1, month: 1, year: 2024, leap: false }],
    ['2025-01-29', { day: 1, month: 1, year: 2025, leap: false }],
    ['2026-02-17', { day: 1, month: 1, year: 2026, leap: false }],
    ['2026-09-25', { day: 15, month: 8, year: 2026, leap: false }],
  ])('converts %s to the expected lunar date', (iso, expected) => {
    expect(pick(lunarFromIsoDate(iso))).toEqual(expected);
  });

  it('handles the leap sixth month of 2025', () => {
    expect(pick(solarToLunar(2025, 6, 25))).toEqual({ day: 1, month: 6, year: 2025, leap: false });
    expect(pick(solarToLunar(2025, 7, 25))).toEqual({ day: 1, month: 6, year: 2025, leap: true });
    expect(numericLunarLabel(solarToLunar(2025, 7, 25))).toBe('1/6*');
  });

  it('keeps the previous lunar year until Tết', () => {
    const tetEve = lunarFromIsoDate('2026-02-16');
    expect(tetEve.month).toBe(12);
    expect(tetEve.year).toBe(2025);
    expect(lunarYearName(tetEve.year)).toBe('Ất Tỵ');
  });

  it('names years, months and days with can chi', () => {
    expect(lunarYearName(2026)).toBe('Bính Ngọ');
    expect(lunarYearName(2024)).toBe('Giáp Thìn');
    expect(lunarMonthCanChi({ month: 1, year: 2024 })).toBe('Bính Dần');
    expect(lunarDayCanChi(lunarFromIsoDate('2000-01-01'))).toBe('Mậu Ngọ');
  });

  it('flags the 1st and 15th lunar days and builds short labels', () => {
    const firstDay = lunarFromIsoDate('2026-02-17');
    const fullMoon = lunarFromIsoDate('2026-09-25');
    expect(isLunarFastingDay(firstDay)).toBe(true);
    expect(isLunarFastingDay(fullMoon)).toBe(true);
    expect(isLunarFastingDay(lunarFromIsoDate('2026-09-26'))).toBe(false);
    expect(shortLunarLabel(firstDay)).toBe('1/1');
    expect(shortLunarLabel(fullMoon)).toBe('15');
  });

  it('computes today in Vietnam time regardless of the device time zone', () => {
    expect(vietnamToday(new Date('2026-10-19T18:30:00Z'))).toBe('2026-10-20');
    expect(vietnamToday(new Date('2026-10-19T16:59:00Z'))).toBe('2026-10-19');
  });
});
