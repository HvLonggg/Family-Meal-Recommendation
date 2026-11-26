import type { Recipe } from '@/data/recipes';

export type Season = 'cold' | 'hot' | 'mild';
export type DishClimate = 'warming' | 'cooling' | 'neutral';

/**
 * Mùa theo giờ Việt Nam: gió mùa từ tháng 11 đến tháng 2, nắng nóng từ tháng 5 đến tháng 8;
 * xuân và thu (tháng 3–4, 9–10) xem là trung tính.
 */
export function seasonOf(date: Date): Season {
  const month = Number(
    new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(
      date,
    ),
  );
  if (month >= 11 || month <= 2) return 'cold';
  if (month >= 5 && month <= 8) return 'hot';
  return 'mild';
}

// So khớp trên tên có dấu để phân biệt "gỏi" với "gói", "chè" với "chế"… Biên từ theo chữ Unicode.
const words = (list: string) => new RegExp(`(?<!\\p{L})(${list})(?!\\p{L})`, 'u');
// Thứ tự kiểm tra: ấm rõ rệt → mát → ấm nhẹ (canh thường, món nấu, rim).
const STRONG_WARMING = words(
  'lẩu|cháo|súp|hầm|tiềm|phở|kho|om|gừng|bún bò|bún riêu|bún mọc|bún măng|hủ tiếu|hủ tíu|bánh canh|mì quảng|miến gà|miến lươn|chè trôi nước|chè gừng',
);
const COOLING = words(
  'gỏi|nộm|chè|salad|sinh tố|thạch|nước ép|rau má|tào phớ|kem|sữa chua|trộn|canh chua|bí đao|mướp|rau đay|mồng tơi|dưa leo|dưa chuột|gỏi cuốn|cuốn',
);
const MILD_WARMING = words('canh|nấu|rim|riêu');

export function dishClimateOf(recipe: Pick<Recipe, 'name'>): DishClimate {
  const name = recipe.name.normalize('NFC').toLocaleLowerCase('vi');
  if (STRONG_WARMING.test(name)) return 'warming';
  if (COOLING.test(name)) return 'cooling';
  if (MILD_WARMING.test(name)) return 'warming';
  return 'neutral';
}

/** Món hợp mùa được ưu tiên rõ; món trái mùa vẫn có thể xuất hiện nhưng hiếm (không bằng 0). */
export const SEASON_WEIGHTS = { match: 3, neutral: 1, opposite: 0.2 } as const;

const PREFERRED: Record<Exclude<Season, 'mild'>, DishClimate> = {
  cold: 'warming',
  hot: 'cooling',
};

export function seasonalWeight(recipe: Pick<Recipe, 'name'>, season: Season): number {
  if (season === 'mild') return SEASON_WEIGHTS.neutral;
  const climate = dishClimateOf(recipe);
  if (climate === 'neutral') return SEASON_WEIGHTS.neutral;
  return climate === PREFERRED[season] ? SEASON_WEIGHTS.match : SEASON_WEIGHTS.opposite;
}

/** Băm FNV-1a 32 bit thành số trong (0, 1) để kết quả lặp lại được theo seed. */
function unitHash(text: string) {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193);
  }
  // Trộn thêm để các khóa gần nhau không cho giá trị gần nhau.
  value ^= value >>> 16;
  value = Math.imul(value, 0x85ebca6b);
  value ^= value >>> 13;
  return ((value >>> 0) + 0.5) / 4_294_967_296;
}

/**
 * Xáo có trọng số (Efraimidis–Spirakis): phần tử trọng số cao thường đứng trước,
 * nhưng thứ tự vẫn ngẫu nhiên theo seed. Trọng số ≤ 0 xếp cuối.
 */
export function weightedSeededShuffle<Item>(
  items: Item[],
  seed: string,
  getKey: (item: Item) => string,
  weightOf: (item: Item) => number,
) {
  return items
    .map((item) => {
      const weight = weightOf(item);
      const rank = weight > 0 ? Math.log(unitHash(`${seed}:${getKey(item)}`)) / weight : -Infinity;
      return { item, rank };
    })
    .sort((a, b) => b.rank - a.rank)
    .map(({ item }) => item);
}
