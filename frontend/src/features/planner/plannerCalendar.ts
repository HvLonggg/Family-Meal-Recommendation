import type { Recipe } from '@/data/recipes';
import type { VegetarianDayMark } from '@/data/plannerApi';
import type { UserPreferences } from '@/features/auth/types';
import type { Translate } from '@/features/i18n/translate';
import {
  isLunarFastingDay,
  lunarFromIsoDate,
  lunarYearName,
  numericLunarLabel,
  type LunarDate,
} from '@/lib/lunarCalendar';

export type VegetarianSource = 'manual' | 'rule' | 'lunar' | 'none';

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

/**
 * Lịch ăn chay cố định trong Cài đặt.
 * `weekdays` theo ISO: 0 = Thứ Hai … 6 = Chủ Nhật (khác `Date.getDay()` của JS).
 * `months` rỗng = áp dụng mọi tháng; ngày/tháng đều theo dương lịch.
 */
export interface VegetarianRules {
  /** Tự đánh dấu ngày 1 và 15 theo lịch đang dùng (dương: ngày 1/15; âm: mùng 1/rằm). */
  lunarDays: boolean;
  /** Lịch đang dùng; mặc định âm lịch cho tương thích dữ liệu cũ. */
  calendar?: 'solar' | 'lunar';
  monthDays: number[];
  weekdays: number[];
  months: number[];
}

type VegetarianPreferenceFields = Partial<
  Pick<
    UserPreferences,
    | 'vegetarian_lunar_days'
    | 'vegetarian_month_days'
    | 'vegetarian_weekdays'
    | 'vegetarian_months'
    | 'calendar_mode'
  >
>;

/** Đọc quy tắc từ thiết lập; trường thiếu (tài khoản cũ) coi như tắt. */
export function vegetarianRulesFrom(preferences: VegetarianPreferenceFields): VegetarianRules {
  return {
    lunarDays: preferences.vegetarian_lunar_days ?? false,
    monthDays: preferences.vegetarian_month_days ?? [],
    weekdays: preferences.vegetarian_weekdays ?? [],
    months: preferences.vegetarian_months ?? [],
    calendar: preferences.calendar_mode === 'solar' ? 'solar' : 'lunar',
  };
}

/** Ngày 1 hoặc 15 theo lịch đang dùng. */
function isFastingDayIn(value: string, calendar: 'solar' | 'lunar') {
  if (calendar === 'solar') {
    const day = Number(value.slice(8, 10));
    return day === 1 || day === 15;
  }
  return isLunarFastingDay(lunarFromIsoDate(value));
}

/** Thứ trong tuần theo ISO (0 = Thứ Hai) của một ngày YYYY-MM-DD. */
export function isoWeekdayOf(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return (new Date(Date.UTC(year!, month! - 1, day)).getUTCDay() + 6) % 7;
}

/** Ngày khớp lịch cố định (ngày trong tháng hoặc thứ trong tuần, trong các tháng đã chọn). */
export function matchesVegetarianRule(value: string, rules: VegetarianRules) {
  if (!rules.monthDays.length && !rules.weekdays.length) return false;
  const [, month, day] = value.split('-').map(Number);
  if (rules.months.length && !rules.months.includes(month!)) return false;
  return rules.monthDays.includes(day!) || rules.weekdays.includes(isoWeekdayOf(value));
}

/** Các ngày sắp tới (sau `from`) khớp lịch cố định hoặc mùng 1/rằm, tìm trong khoảng một năm. */
export function nextVegetarianDays(from: string, rules: VegetarianRules, count = 3) {
  const found: string[] = [];
  for (let offset = 1; offset <= 366 && found.length < count; offset += 1) {
    const value = addDaysIso(from, offset);
    if (resolveVegetarianDay(value, new Map(), rules).vegetarian) found.push(value);
  }
  return found;
}

/**
 * Thứ tự ưu tiên: đánh dấu thủ công từng ngày → lịch cố định → mùng 1/rằm (nếu bật).
 * Tham số thứ ba nhận boolean để tương thích cách gọi cũ (chỉ quy tắc âm lịch).
 */
export function resolveVegetarianDay(
  value: string,
  overrides: Map<string, boolean>,
  rules: VegetarianRules | boolean,
): VegetarianState {
  const resolved: VegetarianRules =
    typeof rules === 'boolean'
      ? { lunarDays: rules, monthDays: [], weekdays: [], months: [] }
      : rules;
  const override = overrides.get(value);
  if (override !== undefined) return { vegetarian: override, source: 'manual' };
  if (matchesVegetarianRule(value, resolved)) return { vegetarian: true, source: 'rule' };
  if (resolved.lunarDays && isFastingDayIn(value, resolved.calendar ?? 'lunar')) {
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

/** Ngày đầy đủ dạng số (vi: 14/11/2026). */
export function formatFullDate(date: Date, locale: string) {
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Ngày giờ dạng "14/11/2026 21:38". */
export function formatDateTime(date: Date, locale: string) {
  const time = new Intl.DateTimeFormat(locale, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  return `${formatFullDate(date, locale)} ${time}`;
}

/** Thứ kèm ngày ngắn, đọc được cho cả người và trình đọc màn hình (vi: "Thứ Bảy, 14/11"). */
export function formatWeekdayDate(date: Date, locale: string, withYear = false) {
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  const capitalized = weekday.charAt(0).toLocaleUpperCase(locale) + weekday.slice(1);
  const day = withYear ? formatFullDate(date, locale) : formatDayMonth(date, locale);
  return `${capitalized}, ${day}`;
}
