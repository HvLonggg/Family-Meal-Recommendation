export function normalizeSearchText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .toLocaleLowerCase('vi-VN')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

// Match every keyword to actual words. Short terms such as “cá” must not match “canh”.
export function matchesSearch(query: string, fields: string[]) {
  const terms = normalizeSearchText(query).split(' ').filter(Boolean);
  if (terms.length === 0) return query.trim().length === 0;
  const words = normalizeSearchText(fields.join(' ')).split(' ');
  return terms.every((term) => words.includes(term));
}
