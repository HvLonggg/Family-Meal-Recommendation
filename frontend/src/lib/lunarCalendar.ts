/**
 * Âm lịch Việt Nam theo thuật toán thiên văn của Hồ Ngọc Đức, tính ở múi giờ GMT+7.
 * Âm lịch Việt Nam có thể lệch một ngày/tháng so với âm lịch Trung Quốc (GMT+8),
 * nên không dùng Intl 'chinese' calendar.
 */

export const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_UTC_OFFSET = 7;

export interface LunarDate {
  day: number;
  month: number;
  year: number;
  leap: boolean;
  /** Số ngày Julius của ngày dương lịch tương ứng, dùng để tính can chi của ngày. */
  jd: number;
}

const CAN = ['Giáp', 'Ất', 'Bính', 'Đinh', 'Mậu', 'Kỷ', 'Canh', 'Tân', 'Nhâm', 'Quý'];
const CHI = ['Tý', 'Sửu', 'Dần', 'Mão', 'Thìn', 'Tỵ', 'Ngọ', 'Mùi', 'Thân', 'Dậu', 'Tuất', 'Hợi'];

function jdFromDate(day: number, month: number, year: number) {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jd =
    day +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  if (jd < 2299161) {
    return day + Math.floor((153 * m + 2) / 5) + 365 * y + Math.floor(y / 4) - 32083;
  }
  return jd;
}

function newMoon(k: number) {
  const T = k / 1236.85;
  const T2 = T * T;
  const T3 = T2 * T;
  const dr = Math.PI / 180;
  let jd1 = 2415020.75933 + 29.53058868 * k + 0.0001178 * T2 - 0.000000155 * T3;
  jd1 += 0.00033 * Math.sin((166.56 + 132.87 * T - 0.009173 * T2) * dr);
  const M = 359.2242 + 29.10535608 * k - 0.0000333 * T2 - 0.00000347 * T3;
  const Mpr = 306.0253 + 385.81691806 * k + 0.0107306 * T2 + 0.00001236 * T3;
  const F = 21.2964 + 390.67050646 * k - 0.0016528 * T2 - 0.00000239 * T3;
  let C1 = (0.1734 - 0.000393 * T) * Math.sin(M * dr) + 0.0021 * Math.sin(2 * dr * M);
  C1 = C1 - 0.4068 * Math.sin(Mpr * dr) + 0.0161 * Math.sin(dr * 2 * Mpr);
  C1 -= 0.0004 * Math.sin(dr * 3 * Mpr);
  C1 = C1 + 0.0104 * Math.sin(dr * 2 * F) - 0.0051 * Math.sin(dr * (M + Mpr));
  C1 = C1 - 0.0074 * Math.sin(dr * (M - Mpr)) + 0.0004 * Math.sin(dr * (2 * F + M));
  C1 = C1 - 0.0004 * Math.sin(dr * (2 * F - M)) - 0.0006 * Math.sin(dr * (2 * F + Mpr));
  C1 = C1 + 0.001 * Math.sin(dr * (2 * F - Mpr)) + 0.0005 * Math.sin(dr * (2 * Mpr + M));
  const deltaT =
    T < -11
      ? 0.001 + 0.000839 * T + 0.0002261 * T2 - 0.00000845 * T3 - 0.000000081 * T * T3
      : -0.000278 + 0.000265 * T + 0.000262 * T2;
  return jd1 + C1 - deltaT;
}

function sunLongitude(jdn: number) {
  const T = (jdn - 2451545.0) / 36525;
  const T2 = T * T;
  const dr = Math.PI / 180;
  const M = 357.5291 + 35999.0503 * T - 0.0001559 * T2 - 0.00000048 * T * T2;
  const L0 = 280.46645 + 36000.76983 * T + 0.0003032 * T2;
  let DL = (1.9146 - 0.004817 * T - 0.000014 * T2) * Math.sin(dr * M);
  DL += (0.019993 - 0.000101 * T) * Math.sin(dr * 2 * M) + 0.00029 * Math.sin(dr * 3 * M);
  const L = (L0 + DL) * dr;
  return L - Math.PI * 2 * Math.floor(L / (Math.PI * 2));
}

function sunLongitudeSector(dayNumber: number) {
  return Math.floor((sunLongitude(dayNumber - 0.5 - VIETNAM_UTC_OFFSET / 24) / Math.PI) * 6);
}

function newMoonDay(k: number) {
  return Math.floor(newMoon(k) + 0.5 + VIETNAM_UTC_OFFSET / 24);
}

function lunarMonth11(year: number) {
  const off = jdFromDate(31, 12, year) - 2415021;
  const k = Math.floor(off / 29.530588853);
  const nm = newMoonDay(k);
  return sunLongitudeSector(nm) >= 9 ? newMoonDay(k - 1) : nm;
}

function leapMonthOffset(a11: number) {
  const k = Math.floor((a11 - 2415021.076998695) / 29.530588853 + 0.5);
  let last: number;
  let i = 1;
  let arc = sunLongitudeSector(newMoonDay(k + i));
  do {
    last = arc;
    i += 1;
    arc = sunLongitudeSector(newMoonDay(k + i));
  } while (arc !== last && i < 14);
  return i - 1;
}

/** Đổi ngày dương lịch (năm, tháng 1–12, ngày) sang âm lịch Việt Nam. */
export function solarToLunar(year: number, month: number, day: number): LunarDate {
  const dayNumber = jdFromDate(day, month, year);
  const k = Math.floor((dayNumber - 2415021.076998695) / 29.530588853);
  let monthStart = newMoonDay(k + 1);
  if (monthStart > dayNumber) monthStart = newMoonDay(k);
  let a11 = lunarMonth11(year);
  let b11 = a11;
  let lunarYear: number;
  if (a11 >= monthStart) {
    lunarYear = year;
    a11 = lunarMonth11(year - 1);
  } else {
    lunarYear = year + 1;
    b11 = lunarMonth11(year + 1);
  }
  const lunarDay = dayNumber - monthStart + 1;
  const diff = Math.floor((monthStart - a11) / 29);
  let leap = false;
  let lunarMonth = diff + 11;
  if (b11 - a11 > 365) {
    const leapDiff = leapMonthOffset(a11);
    if (diff >= leapDiff) {
      lunarMonth = diff + 10;
      leap = diff === leapDiff;
    }
  }
  if (lunarMonth > 12) lunarMonth -= 12;
  if (lunarMonth >= 11 && diff < 4) lunarYear -= 1;
  return { day: lunarDay, month: lunarMonth, year: lunarYear, leap, jd: dayNumber };
}

/** Đổi ngày `YYYY-MM-DD` sang âm lịch. */
export function lunarFromIsoDate(value: string) {
  const [year, month, day] = value.split('-').map(Number);
  return solarToLunar(year!, month!, day!);
}

export function lunarYearName(year: number) {
  return `${CAN[(year + 6) % 10]} ${CHI[(year + 8) % 12]}`;
}

export function lunarMonthCanChi(lunar: Pick<LunarDate, 'month' | 'year'>) {
  return `${CAN[(lunar.year * 12 + lunar.month + 3) % 10]} ${CHI[(lunar.month + 1) % 12]}`;
}

export function lunarDayCanChi(lunar: Pick<LunarDate, 'jd'>) {
  return `${CAN[(lunar.jd + 9) % 10]} ${CHI[(lunar.jd + 1) % 12]}`;
}

/** Mùng 1 và ngày rằm: hai ngày nhiều gia đình Việt ăn chay. */
export function isLunarFastingDay(lunar: Pick<LunarDate, 'day'>) {
  return lunar.day === 1 || lunar.day === 15;
}

/** Nhãn ngắn trong ô lịch: “1/9” ở đầu tháng, còn lại chỉ ngày. */
export function shortLunarLabel(lunar: LunarDate) {
  return lunar.day === 1
    ? `${lunar.day}/${lunar.month}${lunar.leap ? '*' : ''}`
    : String(lunar.day);
}

export function numericLunarLabel(lunar: Pick<LunarDate, 'day' | 'month' | 'leap'>) {
  return `${lunar.day}/${lunar.month}${lunar.leap ? '*' : ''}`;
}

/** Lấy ngày hiện tại theo giờ Việt Nam. */
export function vietnamToday(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}
