/** Dị ứng phổ biến gợi ý sẵn dạng chip. Lưu vẫn là chuỗi tự do để trợ lý đọc được như trước. */
export const COMMON_ALLERGENS = [
  'tôm',
  'cua',
  'hải sản có vỏ',
  'cá',
  'đậu phộng',
  'các loại hạt',
  'sữa',
  'trứng',
  'đậu nành',
  'mè/vừng',
  'gluten/lúa mì',
] as const;

/** Giới hạn của trường `allergies` phía backend. */
export const ALLERGIES_MAX_LENGTH = 200;

function normalize(value: string) {
  return value.normalize('NFC').trim().replace(/\s+/g, ' ');
}

export function allergyKey(value: string) {
  return normalize(value).toLocaleLowerCase('vi-VN');
}

/** Tách chuỗi đã lưu ("tôm, cua và sữa") thành danh sách chip, bỏ trùng. */
export function parseAllergies(text: string): string[] {
  const seen = new Set<string>();
  const items: string[] = [];
  for (const piece of text.split(/[,;\n]|\s+và\s+/iu)) {
    const item = normalize(piece);
    const key = allergyKey(item);
    if (!item || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
  }
  return items;
}

export function joinAllergies(items: string[]) {
  return parseAllergies(items.join(', ')).join(', ');
}
