/** Băm FNV-1a 32 bit: nhanh, ổn định, đủ phân tán để xáo thứ tự hiển thị. */
function hash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  return value >>> 0;
}

/**
 * Xáo trộn theo seed: cùng seed luôn cho cùng thứ tự (không nhảy khi component render lại),
 * đổi seed thì ra thứ tự mới. Thứ tự dựa trên khóa của phần tử nên không đổi khi nội dung
 * được dịch sang ngôn ngữ khác.
 */
export function seededShuffle<Item>(items: Item[], seed: string, getKey: (item: Item) => string) {
  return items
    .map((item) => ({ item, rank: hash(`${seed}:${getKey(item)}`) }))
    .sort((a, b) => a.rank - b.rank)
    .map(({ item }) => item);
}

/** Seed mới cho mỗi lần tải trang, nên mỗi lần vào ứng dụng thấy một thứ tự món khác. */
export const pageLoadSeed = Math.random().toString(36).slice(2);
