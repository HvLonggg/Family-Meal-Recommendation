// Nhớ kết quả chuẩn hóa: tìm kiếm gọi hàm này hàng chục nghìn lần cho cùng một chuỗi.
const normalizedCache = new Map<string, string>();
const NORMALIZED_CACHE_LIMIT = 50_000;

export function normalizeSearchText(value: string) {
  const cached = normalizedCache.get(value);
  if (cached !== undefined) return cached;
  const normalized = computeNormalizedSearchText(value);
  if (normalizedCache.size >= NORMALIZED_CACHE_LIMIT) normalizedCache.clear();
  normalizedCache.set(value, normalized);
  return normalized;
}

function computeNormalizedSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Độ dài tối thiểu (không dấu) để chấp nhận gõ sai một ký tự. */
export const FUZZY_MIN_LENGTH = 5;

export function oneEditApart(left: string, right: string) {
  if (Math.abs(left.length - right.length) > 1) return false;

  let leftIndex = 0;
  let rightIndex = 0;
  let edits = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      leftIndex += 1;
      rightIndex += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (left.length > right.length) leftIndex += 1;
    else if (right.length > left.length) rightIndex += 1;
    else {
      leftIndex += 1;
      rightIndex += 1;
    }
  }
  if (leftIndex < left.length || rightIndex < right.length) edits += 1;
  return edits <= 1;
}

function matchesTerm(term: string, words: string[], allowPrefix: boolean) {
  if (words.includes(term)) return true;
  if (allowPrefix && term.length >= 4 && words.some((word) => word.startsWith(term))) return true;
  if ((term === 'sao' && words.includes('xao')) || (term === 'xao' && words.includes('sao')))
    return true;
  // Từ ngắn tiếng Việt (“cá”, “gà”, “rau”, “kho”, “canh”) luôn phải khớp nguyên từ.
  return term.length >= FUZZY_MIN_LENGTH && words.some((word) => oneEditApart(term, word));
}

// Require every query term. Tolerate a single typo in terms of ≥5 letters; short words stay exact.
export function matchesSearch(query: string, fields: string[]) {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return query.trim().length === 0;
  const words = normalizeSearchText(fields.join(' ')).split(' ');
  return terms.every((term, index) => matchesTerm(term, words, index === terms.length - 1));
}

const TONE_MARKS = /[\u0300\u0301\u0303\u0309\u0323]/g;

/**
 * Khóa so khớp có dấu, không phụ thuộc vị trí đặt dấu thanh (“hoà” = “hòa”, “thuỷ” = “thủy”):
 * giữ chữ có mũ/móc (ă, â, ê, ô, ơ, ư, đ) rồi nối dấu thanh ở cuối.
 */
export function accentKey(word: string) {
  const decomposed = word.normalize('NFD');
  const tone = decomposed.match(TONE_MARKS)?.[0] ?? '';
  return decomposed.replace(TONE_MARKS, '').normalize('NFC') + tone;
}

/** Một từ đã chuẩn hóa: `norm` bỏ dấu, `key` giữ dấu (xem `accentKey`), `accented` chữ thường có dấu. */
export type SearchToken = { norm: string; key: string; accented: string; hasDiacritics: boolean };

const tokenCache = new Map<string, SearchToken[]>();

/** Tách chuỗi thành từ, mỗi từ có dạng bỏ dấu và có dấu thẳng hàng với nhau. Có bộ nhớ đệm. */
export function searchTokens(value: string): SearchToken[] {
  const cached = tokenCache.get(value);
  if (cached) return cached;
  const tokens: SearchToken[] = [];
  for (const accented of value
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .split(/[^\p{L}\p{N}]+/u)) {
    if (!accented) continue;
    const norm = normalizeSearchText(accented);
    if (!norm) continue;
    // Một ký hiệu lạ có thể tách thêm khoảng trắng sau chuẩn hóa: giữ từng phần để thẳng hàng.
    for (const part of norm.split(' ')) {
      const key = norm.includes(' ') ? part : accentKey(accented);
      tokens.push({ norm: part, key, accented, hasDiacritics: key !== part });
    }
  }
  if (tokenCache.size >= NORMALIZED_CACHE_LIMIT) tokenCache.clear();
  tokenCache.set(value, tokens);
  return tokens;
}
