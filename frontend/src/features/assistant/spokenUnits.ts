/** Chu?n h?a s?, ??n v? v? k? hi?u th?nh l?i n?i; ch? ??i ??n v? ??ng ngay sau s?. */
export type SpokenLang = 'vi' | 'en';

/** 'vi-VN', 'en-US', 'en'… → 'vi' | 'en' (mặc định tiếng Việt). */
export function toSpokenLang(lang: string | undefined): SpokenLang {
  return lang?.slice(0, 2).toLowerCase() === 'en' ? 'en' : 'vi';
}

type UnitWords = { one: string; many: string };

const UNITS: Record<SpokenLang, Record<string, UnitWords | string>> = {
  vi: {
    kg: 'ki lô gam',
    mg: 'mi li gam',
    ml: 'mi li lít',
    gram: 'gam',
    gr: 'gam',
    g: 'gam',
    l: 'lít',
    cm: 'xen ti mét',
    mm: 'mi li mét',
    tbsp: 'muỗng canh',
    tsp: 'muỗng cà phê',
    mcf: 'muỗng cà phê',
    'm.cf': 'muỗng cà phê',
    mcp: 'muỗng cà phê',
    mc: 'muỗng canh',
    'm.c': 'muỗng canh',
  },
  en: {
    kg: { one: 'kilogram', many: 'kilograms' },
    mg: { one: 'milligram', many: 'milligrams' },
    ml: { one: 'milliliter', many: 'milliliters' },
    gr: { one: 'gram', many: 'grams' },
    g: { one: 'gram', many: 'grams' },
    l: { one: 'liter', many: 'liters' },
    cm: { one: 'centimeter', many: 'centimeters' },
    mm: { one: 'millimeter', many: 'millimeters' },
    tbsp: { one: 'tablespoon', many: 'tablespoons' },
    tsp: { one: 'teaspoon', many: 'teaspoons' },
    oz: { one: 'ounce', many: 'ounces' },
    lb: { one: 'pound', many: 'pounds' },
    lbs: { one: 'pound', many: 'pounds' },
    h: { one: 'hour', many: 'hours' },
    hr: { one: 'hour', many: 'hours' },
    hrs: { one: 'hour', many: 'hours' },
    min: { one: 'minute', many: 'minutes' },
    mins: { one: 'minute', many: 'minutes' },
  },
};

/** Regex đơn vị: khóa dài đứng trước để "kg" không bị bắt thành "k" + "g". */
const UNIT_PATTERN = Object.fromEntries(
  (Object.keys(UNITS) as SpokenLang[]).map((lang) => {
    const keys = Object.keys(UNITS[lang])
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace('.', '\\.'));
    return [
      lang,
      new RegExp(`(\\d+(?:[.,]\\d+)?(?:\\/\\d+)?)\\s*(${keys.join('|')})(?!\\p{L})`, 'giu'),
    ];
  }),
) as Record<SpokenLang, RegExp>;

const WORDS = {
  vi: {
    to: 'đến',
    about: 'khoảng',
    times: 'nhân',
    plus: 'cộng',
    percent: 'phần trăm',
    celsius: 'độ C',
    fahrenheit: 'độ F',
    degrees: 'độ',
  },
  en: {
    to: 'to',
    about: 'about',
    times: 'times',
    plus: 'plus',
    percent: 'percent',
    celsius: 'degrees Celsius',
    fahrenheit: 'degrees Fahrenheit',
    degrees: 'degrees',
  },
} satisfies Record<SpokenLang, Record<string, string>>;

const VI_DIGITS = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười'];
const EN_DIGITS = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const EN_PARTS = [
  '',
  '',
  'half',
  'third',
  'quarter',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
];

/** Chỉ đọc phân số "thật" (tử < mẫu, mẫu ≤ 10); "22/10", "24/7" giữ nguyên. */
function isFraction(numerator: number, denominator: number) {
  return numerator >= 1 && denominator >= 2 && denominator <= 10 && numerator < denominator;
}

function fractionWords(numerator: number, denominator: number, lang: SpokenLang) {
  if (lang === 'vi') {
    return `${VI_DIGITS[numerator]} phần ${denominator === 4 ? 'tư' : VI_DIGITS[denominator]}`;
  }
  const part = EN_PARTS[denominator]!;
  if (numerator === 1) return `one ${part}`;
  return `${EN_DIGITS[numerator]} ${part === 'half' ? 'halves' : `${part}s`}`;
}

// Đoạn phải giữ nguyên: URL, email, ngày tháng, giờ "10:30", số điện thoại.
const PROTECTED = new RegExp(
  [
    String.raw`https?:\/\/\S+`,
    String.raw`www\.\S+`,
    String.raw`[\w.+-]+@[\w-]+\.[\w.-]+`,
    String.raw`(?<!\d)\d{4}[-/.]\d{1,2}[-/.]\d{1,2}(?!\d)`,
    String.raw`(?<!\d)\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}(?!\d)`,
    String.raw`(?<=(?:ngày|hôm|mùng|mồng)\s+)\d{1,2}[-/.]\d{1,2}(?!\d)`,
    String.raw`(?<!\d)\d{1,2}:\d{2}(?::\d{2})?(?!\d)`,
    String.raw`(?<![\d\p{L}])(?:\+\d{1,3}[\s.-]?|0)\d{2,3}[\s.-]?\d{3}[\s.-]?\d{3,4}(?!\d)`,
  ].join('|'),
  'giu',
);
// Ký tự vùng riêng (Private Use) làm chỗ giữ tạm: không phải chữ, không phải số.
const PLACEHOLDER_BASE = 0xe000;
const PLACEHOLDER = /[-]/g;

export function spokenUnits(text: string, lang: SpokenLang = 'vi'): string {
  if (!text) return text;
  const words = WORDS[lang];
  const kept: string[] = [];
  let result = text.replace(PROTECTED, (match) => {
    kept.push(match);
    return String.fromCharCode(PLACEHOLDER_BASE + kept.length - 1);
  });

  // Nhiệt độ và phần trăm.
  result = result
    .replace(/(\d)\s*[°º˚]\s*C(?!\p{L})/gu, `$1 ${words.celsius}`)
    .replace(/(\d)\s*[°º˚]\s*F(?!\p{L})/gu, `$1 ${words.fahrenheit}`)
    .replace(/(\d)\s*[°º˚]/gu, `$1 ${words.degrees}`)
    .replace(/(\d)\s*%/g, `$1 ${words.percent}`);
  if (lang === 'vi') result = result.replace(/(\d)\s*độ\s*C(?!\p{L})/gu, '$1 độ C');

  // Khoảng "8-10", "8–10", "2 - 3", "8~10" → "8 đến 10"; rồi "~5" → "khoảng 5".
  result = result
    .replace(/(\d)\s*[-–—~]\s*(?=\d)/g, `$1 ${words.to} `)
    .replace(/[~≈]\s*(?=\d)/g, `${words.about} `)
    .replace(/(\d)\s*\+\s*(?=\d)/g, `$1 ${words.plus} `)
    .replace(/(\d)\s*[x×]\s*(?=\d)/g, `$1 ${words.times} `)
    .replace(/(?<![\p{L}\d])[x×]\s?(?=\d)/gu, `${words.times} `);

  // "thìa cf", "muỗng cafe" → "thìa cà phê".
  if (lang === 'vi') {
    result = result.replace(/(muỗng|thìa)\s*(?:cf|c\.f|cafe|café)(?!\p{L})/giu, '$1 cà phê');
  }

  // Đơn vị đứng sau số. Tiếng Anh: số ít khi lượng là 1 hoặc phân số đơn (< 1).
  result = result.replace(
    UNIT_PATTERN[lang],
    (match, amount: string, unit: string, offset: number, whole: string) => {
      const spoken = UNITS[lang][unit.toLowerCase()];
      if (!spoken) return match;
      if (typeof spoken === 'string') return `${amount} ${spoken}`;
      const mixed = /\d[ \t]+$/.test(whole.slice(0, offset));
      const single = amount === '1' || (amount.includes('/') && !mixed);
      return `${amount} ${single ? spoken.one : spoken.many}`;
    },
  );

  if (lang === 'vi') {
    // "2h" → "2 giờ", "1h30" → "1 giờ 30"; "15p", "15ph" → "15 phút".
    result = result
      .replace(/(\d)\s*h(?!\p{L})(?=(\d)?)/gu, (_m, digit: string, next?: string) =>
        next ? `${digit} giờ ` : `${digit} giờ`,
      )
      .replace(/(\d)\s*(?:ph|p)(?!\p{L})/gu, '$1 phút');
  }

  // Hỗn số "1 1/2" → "1 rưỡi" / "1 and a half".
  result = result.replace(
    /(?<![\d/.,])(\d+)[ \t]+(\d+)\/(\d+)(?![\d/])/g,
    (match, whole: string, top: string, bottom: string) => {
      const numerator = Number(top);
      const denominator = Number(bottom);
      if (!isFraction(numerator, denominator)) return match;
      if (lang === 'vi') {
        return numerator * 2 === denominator
          ? `${whole} rưỡi`
          : `${whole} và ${fractionWords(numerator, denominator, lang)}`;
      }
      const part = fractionWords(numerator, denominator, lang);
      return `${whole} and ${numerator === 1 ? part.replace(/^one /, 'a ') : part}`;
    },
  );

  // Phân số đơn: "1/2 muỗng" → "nửa muỗng", "3/4" → "ba phần tư".
  result = result.replace(
    /(?<![\d/.,])(\d+)\/(\d+)(?![\d/])(?=(\s*\p{L})?)/gu,
    (match, top: string, bottom: string, wordAfter?: string) => {
      const numerator = Number(top);
      const denominator = Number(bottom);
      if (!isFraction(numerator, denominator)) return match;
      if (lang === 'vi' && numerator === 1 && denominator === 2 && wordAfter) return 'nửa';
      return fractionWords(numerator, denominator, lang);
    },
  );

  if (lang === 'vi') {
    // "1.000.000" (ngăn cách hàng nghìn) → "1000000"; "1,5" / "1.5" → "1 phẩy 5".
    result = result
      .replace(/(?<![\d.,])[1-9]\d{0,2}(?:([.,])\d{3})(?:\1\d{3})*(?![.,]?\d)/g, (match) =>
        match.replace(/[.,]/g, ''),
      )
      .replace(/(\d)[.,](?=\d)/g, '$1 phẩy ');
  }

  return result
    .replace(PLACEHOLDER, (char) => kept[char.charCodeAt(0) - PLACEHOLDER_BASE] ?? char)
    .replace(/ {2,}/g, ' ');
}
