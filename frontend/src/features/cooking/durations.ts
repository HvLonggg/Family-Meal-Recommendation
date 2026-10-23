/** Đọc thời lượng trong bước nấu ("ninh 30 phút") và trong câu nói ("nhắc tôi sau nửa tiếng"). */

const UNIT_SECONDS: Record<string, number> = {
  giây: 1,
  giay: 1,
  s: 1,
  sec: 1,
  secs: 1,
  second: 1,
  seconds: 1,
  phút: 60,
  phut: 60,
  p: 60,
  min: 60,
  mins: 60,
  minute: 60,
  minutes: 60,
  giờ: 3600,
  gio: 3600,
  tiếng: 3600,
  tieng: 3600,
  h: 3600,
  hr: 3600,
  hrs: 3600,
  hour: 3600,
  hours: 3600,
};

const UNIT = Object.keys(UNIT_SECONDS)
  .sort((a, b) => b.length - a.length)
  .join('|');
const HOUR_UNIT = 'tiếng|tieng|giờ|gio|hours|hour|hrs|hr|h';

const VI_DIGITS: Record<string, number> = {
  không: 0,
  một: 1,
  mốt: 1,
  hai: 2,
  ba: 3,
  bốn: 4,
  tư: 4,
  năm: 5,
  lăm: 5,
  sáu: 6,
  bảy: 7,
  bẩy: 7,
  tám: 8,
  chín: 9,
};

// Gõ không dấu: "muoi lam phut", "hai muoi phut".
const ASCII_DIGITS: Record<string, number> = {
  mot: 1,
  hai: 2,
  ba: 3,
  bon: 4,
  tu: 4,
  nam: 5,
  lam: 5,
  sau: 6,
  bay: 7,
  tam: 8,
  chin: 9,
};

const EN_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  fifteen: 15,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fortyfive: 45,
  fifty: 50,
  sixty: 60,
  ninety: 90,
};

/** Bỏ dấu tiếng Việt ("Hầm xương" → "ham xuong") để so khớp câu gõ không dấu. */
export function foldVietnamese(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export const isAsciiText = (text: string) => !/[^\p{ASCII}]/u.test(text);

/** Đổi số đọc bằng chữ ("hai mươi lăm", "mười", "twenty five") thành chữ số. */
export function wordsToDigits(text: string) {
  const tokens = text.split(/\s+/);
  const ascii = isAsciiText(text);
  const digits = ascii ? ASCII_DIGITS : VI_DIGITS;
  const TEN = ascii ? 'muoi' : 'mười';
  const TENS = ascii ? ['muoi', 'chuc'] : ['mươi', 'chục'];
  const out: string[] = [];
  let index = 0;
  while (index < tokens.length) {
    const token = tokens[index]!;
    const next = tokens[index + 1];
    const after = tokens[index + 2];
    // Không dấu: "sau muoi phut" là "sau mười phút", "bay gio" là "bây giờ".
    const ambiguous =
      ascii &&
      ((token === 'sau' && next === 'muoi') ||
        (token === 'bay' && next === 'gio' && tokens[index - 1] !== 'luc'));
    if (token === TEN) {
      const unit = next !== undefined ? digits[next] : undefined;
      if (unit !== undefined && unit > 0) {
        out.push(String(10 + unit));
        index += 2;
      } else {
        out.push('10');
        index += 1;
      }
      continue;
    }
    const digit = ambiguous ? undefined : digits[token];
    if (digit !== undefined && digit > 0 && next !== undefined && TENS.includes(next)) {
      const unit = after !== undefined ? digits[after] : undefined;
      if (unit !== undefined && unit > 0) {
        out.push(String(digit * 10 + unit));
        index += 3;
      } else {
        out.push(String(digit * 10));
        index += 2;
      }
      continue;
    }
    // "năm" vừa là số 5 vừa là "năm" (year): chỉ đổi khi đứng ngay trước đơn vị thời gian.
    if (digit !== undefined && digit > 0 && next !== undefined && next in UNIT_SECONDS) {
      out.push(String(digit));
      index += 1;
      continue;
    }
    const english = EN_NUMBERS[token];
    if (english !== undefined && english >= 20 && english % 10 === 0 && next && EN_NUMBERS[next]) {
      const unit = EN_NUMBERS[next];
      if (unit < 10) {
        out.push(String(english + unit));
        index += 2;
        continue;
      }
    }
    // "half an hour" giữ nguyên để đọc là nửa tiếng.
    if (english !== undefined && next !== undefined && next in UNIT_SECONDS) {
      out.push(tokens[index - 1] === 'half' ? token : String(english));
      index += 1;
      continue;
    }
    out.push(token);
    index += 1;
  }
  return out.join(' ');
}

function normalize(text: string) {
  return text
    .normalize('NFC')
    .toLowerCase()
    .replace(/(\d{1,2}):(\d{2})/g, '$1h$2')
    .replace(/(\d),(\d)/g, '$1.$2')
    .replace(/[^\p{L}\p{N}.\s–-]/gu, ' ')
    .replace(/(\d)h(\d)/g, '$1h $2')
    .replace(/\s+/g, ' ')
    .trim();
}

const AMOUNT = String.raw`(\d+(?:\.\d+)?)`;
const RANGE = new RegExp(
  String.raw`${AMOUNT}(?:\s*(?:[-–]|đến|tới|to)\s*${AMOUNT})?\s*(${UNIT})(?![\p{L}])(\s*(?:rưỡi|ruoi))?`,
  'gu',
);
const HALF_HOUR = /(^|\s)(nửa tiếng|nửa giờ|nua tieng|nua gio|half an hour|half hour)(\s|$)/u;
// "1 tiếng 15" (không nói "phút"): số sau giờ là phút.
const HOUR_MINUTES = new RegExp(
  String.raw`(\d+)\s*(${HOUR_UNIT})\s+(\d{1,2})(?![\p{L}\p{N}])(?!\s*(?:\d|(?:${UNIT})(?![\p{L}])))`,
  'gu',
);

type Found = { seconds: number; start: number; end: number };

function findDurations(text: string): Found[] {
  const found: Found[] = [];
  for (const match of text.matchAll(RANGE)) {
    const [, first, , unit, half] = match;
    const size = UNIT_SECONDS[unit!]!;
    // Khoảng "15–20 phút": hẹn theo mốc sớm để kịp kiểm tra độ chín.
    let seconds = Number(first) * size;
    if (half) seconds += size / 2;
    found.push({ seconds, start: match.index ?? 0, end: (match.index ?? 0) + match[0].length });
  }
  // Gộp "1 giờ 30 phút" thành một thời lượng.
  const merged: Found[] = [];
  for (const item of found) {
    const previous = merged.at(-1);
    if (previous && item.start - previous.end <= 2 && previous.seconds > item.seconds) {
      previous.seconds += item.seconds;
      previous.end = item.end;
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

// --- Giờ tuyệt đối: "báo mình lúc 7 giờ tối", "lúc 19h30", "at 7 pm" ---------------------------
const PERIOD = 'sáng|trưa|chiều|tối|đêm|khuya|sang|trua|chieu|dem|khuya|am|pm';
const CLOCK = new RegExp(
  String.raw`(?:(?<![\p{L}\p{N}])(lúc|luc|vào lúc|vao luc|at|by|vào|vao|đến|tới|den)\s+)?(?<![\p{L}\p{N}])(\d{1,2})` +
    String.raw`(?:\s*(giờ|gio|h|g|o clock|oclock)(?:\s*(?:(\d{1,2})(?:\s*(?:phút|phut|p))?|(rưỡi|ruoi)|(?:kém|kem)\s+(\d{1,2})(?:\s*(?:phút|phut))?))?)?` +
    String.raw`(?:\s+(?:buổi\s+|buoi\s+)?(${PERIOD}|toi))?(?![\p{L}\p{N}])`,
  'gu',
);
const FOLLOWED_BY_UNIT = new RegExp(String.raw`^\s*(?:${UNIT})(?![\p{L}])`, 'u');
const STRONG_CLOCK = new Set(['lúc', 'luc', 'vào lúc', 'vao luc', 'at']);

type ClockMatch = {
  hour: number;
  minute: number;
  period?: string;
  start: number;
  end: number;
};

function findClock(text: string): ClockMatch | null {
  for (const match of text.matchAll(CLOCK)) {
    const [, prefix, hourText, unit, minuteText, half, before, period] = match;
    // "tối" không dấu trùng "tôi": chỉ coi là buổi khi đi sau "giờ".
    if (period === 'toi' && !unit) continue;
    const strong = prefix !== undefined && STRONG_CLOCK.has(prefix);
    if (!(strong || (period && (unit || prefix)) || (prefix && unit))) continue;
    const start = match.index ?? 0;
    const end = start + match[0].length;
    // "lúc 10 phút nữa": số đi với phút/giây là thời lượng, không phải giờ.
    if (!unit && FOLLOWED_BY_UNIT.test(text.slice(end))) continue;
    let hour = Number(hourText);
    let minute = Number(minuteText ?? 0);
    if (half) minute = 30;
    if (before) {
      hour -= 1;
      minute = 60 - Number(before);
    }
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) continue;
    return { hour, minute, period, start, end };
  }
  return null;
}

function clockHours(hour: number, period?: string) {
  switch (period) {
    case 'sáng':
    case 'sang':
    case 'am':
      return [hour === 12 ? 0 : hour];
    case 'chiều':
    case 'chieu':
    case 'tối':
    case 'toi':
    case 'pm':
      return [hour < 12 ? hour + 12 : hour];
    case 'trưa':
    case 'trua':
      return [hour >= 11 ? hour : hour + 12];
    case 'đêm':
    case 'dem':
    case 'khuya':
      return [hour >= 7 && hour < 12 ? hour + 12 : hour === 12 ? 0 : hour];
    default:
      // Không nói buổi: chọn lần gần nhất sắp tới ("7 giờ" lúc 8 giờ sáng → 7 giờ tối).
      return hour > 12 ? [hour] : hour === 12 ? [12, 0] : [hour, hour + 12];
  }
}

export type ClockTarget = {
  /** Số giây từ bây giờ (theo giờ máy người dùng) tới mốc giờ, tối đa 24 giờ. */
  seconds: number;
  hour: number;
  minute: number;
  /** Giờ đó hôm nay đã qua nên hẹn sang ngày mai. */
  tomorrow: boolean;
};

/** Mốc giờ người dùng nói ("lúc 7 giờ tối") quy ra số giây còn lại; đã qua thì tính ngày mai. */
export function parseClockTime(text: string, now: Date = new Date()): ClockTarget | null {
  const found = findClock(wordsToDigits(normalize(text)));
  if (!found) return null;
  let best: ClockTarget | null = null;
  for (const hour of clockHours(found.hour, found.period)) {
    if (hour > 23) continue;
    const target = new Date(now);
    target.setHours(hour, found.minute, 0, 0);
    let tomorrow = false;
    if (target.getTime() - now.getTime() < 5000) {
      target.setDate(target.getDate() + 1);
      tomorrow = true;
    }
    const seconds = Math.round((target.getTime() - now.getTime()) / 1000);
    if (!best || seconds < best.seconds) best = { seconds, hour, minute: found.minute, tomorrow };
  }
  return best && best.seconds <= 86_400 ? best : null;
}

/** Câu đã chuẩn hóa, bỏ mốc giờ tuyệt đối và đổi "1 tiếng 15" thành "1 tiếng 15 phút". */
function durationText(text: string) {
  let value = wordsToDigits(normalize(text));
  const clock = findClock(value);
  if (clock) value = `${value.slice(0, clock.start)} ${value.slice(clock.end)}`;
  return value.replace(HOUR_MINUTES, '$1 $2 $3 phút');
}

/** Từng thời lượng người dùng nói ("10 phút luộc trứng và 25 phút hầm xương" → [600, 1500]). */
export function spokenAmounts(text: string): number[] {
  const base = durationText(text);
  if (HALF_HOUR.test(base)) {
    const rest = findDurations(base.replace(HALF_HOUR, ' '));
    return [1800 + rest.reduce((sum, item) => sum + item.seconds, 0)];
  }
  return findDurations(base)
    .map((item) => Math.round(item.seconds))
    .filter((seconds) => seconds > 0);
}

/** Thời lượng người dùng nói ra, ví dụ "nhắc tôi sau 1 tiếng rưỡi" → 5400 giây. */
export function parseSpokenDuration(text: string): number | null {
  const total = spokenAmounts(text).reduce((sum, seconds) => sum + seconds, 0);
  return total > 0 ? total : null;
}

/** Bỏ thời lượng và mốc giờ khỏi câu (để lấy phần còn lại làm nhãn chuông). */
export function stripDurations(text: string) {
  return durationText(text).replace(HALF_HOUR, ' ').replace(RANGE, ' ').replace(/\s+/g, ' ').trim();
}

/** Gợi ý hẹn giờ cho một bước: lấy thời lượng chờ dài nhất được nhắc trong bước. */
export function detectStepTimer(text: string): number | null {
  const found = findDurations(normalize(text));
  const longest = Math.max(0, ...found.map((item) => item.seconds));
  return longest >= 60 ? Math.round(longest) : null;
}

export function formatClock(totalSeconds: number) {
  const seconds = Math.max(0, Math.ceil(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, '0');
  return hours ? `${hours}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

/** Giờ trong ngày dạng "19:30". */
export const clockText = (hour: number, minute: number) =>
  `${hour}:${String(minute).padStart(2, '0')}`;

/** Thời lượng đọc thành lời cho giọng nói. */
export function spokenDuration(totalSeconds: number, language: 'vi' | 'en') {
  const seconds = Math.round(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const parts =
    language === 'vi'
      ? [hours && `${hours} giờ`, minutes && `${minutes} phút`, rest && `${rest} giây`]
      : [
          hours && `${hours} ${hours === 1 ? 'hour' : 'hours'}`,
          minutes && `${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`,
          rest && `${rest} ${rest === 1 ? 'second' : 'seconds'}`,
        ];
  return parts.filter(Boolean).join(' ') || (language === 'vi' ? '0 giây' : '0 seconds');
}

/** Thời gian còn lại đọc gọn: từ 2 phút trở lên làm tròn tới phút ("còn 12 phút"). */
export function roughDuration(totalSeconds: number, language: 'vi' | 'en') {
  const seconds = Math.max(0, Math.round(totalSeconds));
  return spokenDuration(seconds >= 120 ? Math.round(seconds / 60) * 60 : seconds, language);
}
