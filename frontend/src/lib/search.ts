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

function oneEditApart(left: string, right: string) {
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
  // Avoid fuzzy matching short Vietnamese words such as “cá”, “gà”, and “rau”.
  return term.length >= 4 && words.some((word) => oneEditApart(term, word));
}

// Require every query term. Tolerate a single typo in longer terms, while short words stay exact.
export function matchesSearch(query: string, fields: string[]) {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return query.trim().length === 0;
  const words = normalizeSearchText(fields.join(' ')).split(' ');
  return terms.every((term, index) => matchesTerm(term, words, index === terms.length - 1));
}
