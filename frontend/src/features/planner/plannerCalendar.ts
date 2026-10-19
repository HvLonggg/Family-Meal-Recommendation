import type { Recipe } from '@/data/recipes';
import type { VegetarianDayMark } from '@/data/plannerApi';
import type { Translate } from '@/features/i18n/translate';
import {
  isLunarFastingDay,
  lunarFromIsoDate,
  lunarYearName,
  numericLunarLabel,
  type LunarDate,
} from '@/lib/lunarCalendar';

export type VegetarianSource = 'manual' | 'lunar' | 'none';

export interface VegetarianState {
  vegetarian: boolean;
  source: VegetarianSource;
}

/** Cộng ngày theo UTC để tránh lệch múi giờ. */
export function addDaysIso(value: string, days: number) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(Date.UTC(year!, month! - 1, day! + days)).toISOString().slice(0, 10);
}

export function isVegetarianRecipe(recipe: Pick<Recipe, 'category' | 'tags'>) {
  return recipe.category === 'Món chay' || recipe.tags.includes('Món chay');
}

export function vegetarianOverrides(...lists: (VegetarianDayMark[] | undefined)[]) {
  const overrides = new Map<string, boolean>();
  for (const list of lists)
    for (const mark of list ?? []) overrides.set(mark.day, mark.is_vegetarian);
  return overrides;
}

/** Lựa chọn thủ công của người dùng luôn thắng quy tắc tự động mùng 1 và rằm. */
export function resolveVegetarianDay(
  value: string,
  overrides: Map<string, boolean>,
  autoLunarDays: boolean,
): VegetarianState {
  const override = overrides.get(value);
  if (override !== undefined) return { vegetarian: override, source: 'manual' };
  if (autoLunarDays && isLunarFastingDay(lunarFromIsoDate(value))) {
    return { vegetarian: true, source: 'lunar' };
  }
  return { vegetarian: false, source: 'none' };
}

export function upsertVegetarianMark(marks: VegetarianDayMark[], day: string, value: boolean) {
  const next = marks.filter((mark) => mark.day !== day);
  next.push({ day, is_vegetarian: value });
  return next.sort((left, right) => left.day.localeCompare(right.day));
}

/** Mùng 1 hoặc rằm gần nhất từ ngày mai trở đi (trong vòng một tháng âm). */
export function nextLunarFastingDay(from: string) {
  for (let offset = 1; offset <= 31; offset += 1) {
    const value = addDaysIso(from, offset);
    const lunar = lunarFromIsoDate(value);
    if (isLunarFastingDay(lunar)) return { value, lunar, daysAway: offset };
  }
  return null;
}

export function fastingDayName(lunar: Pick<LunarDate, 'day'>, t: Translate) {
  if (lunar.day === 1) return t('Mùng 1');
  if (lunar.day === 15) return t('Rằm');
  return null;
}

export function lunarMonthLabel(lunar: Pick<LunarDate, 'month' | 'leap'>, t: Translate) {
  return lunar.leap ? t('{month} nhuận', { month: lunar.month }) : String(lunar.month);
}

export function formatLunarLong(lunar: LunarDate, t: Translate) {
  return t('Ngày {day} tháng {month} năm {year}', {
    day: lunar.day,
    month: lunarMonthLabel(lunar, t),
    year: lunarYearName(lunar.year),
  });
}

export function formatLunarRange(from: string, to: string) {
  const start = lunarFromIsoDate(from);
  const end = lunarFromIsoDate(to);
  return `${numericLunarLabel(start)} – ${numericLunarLabel(end)} · ${lunarYearName(end.year)}`;
}

/** Ngày/tháng ngắn có dấu “/” theo thứ tự của ngôn ngữ (vi: 25/09, en: 09/25). */
export function formatDayMonth(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' })
    .formatToParts(date)
    .filter((part) => part.type === 'day' || part.type === 'month')
    .map((part) => part.value)
    .join('/');
}
