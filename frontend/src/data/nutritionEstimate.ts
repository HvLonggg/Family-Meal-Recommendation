import type { Recipe } from '@/data/recipes';

/** ??c t?nh dinh d??ng theo kh?u ph?n t? b?ng th?c ph?m Vi?t Nam; k?t qu? g?n ??ng. */
type Food = { kcal: number; protein: number; produce?: boolean; perPiece?: number };

const P = true;
// Thứ tự quan trọng: từ khóa cụ thể đặt trước từ khóa chung.
const FOODS: [string, Food][] = [
  ['nuoc cot dua', { kcal: 230, protein: 2.3 }],
  ['nuoc dua', { kcal: 20, protein: 0.4 }],
  ['nuoc mam', { kcal: 35, protein: 5 }],
  ['nuoc tuong', { kcal: 50, protein: 7 }],
  ['nuoc', { kcal: 0, protein: 0 }],
  ['dau an', { kcal: 900, protein: 0 }],
  ['dau hao', { kcal: 120, protein: 2 }],
  ['mo heo', { kcal: 896, protein: 0 }],
  ['trung cut', { kcal: 154, protein: 13, perPiece: 10 }],
  ['trung vit', { kcal: 184, protein: 13, perPiece: 65 }],
  ['trung', { kcal: 166, protein: 14.8, perPiece: 50 }],
  ['thit ba chi', { kcal: 260, protein: 16.5 }],
  ['thit heo xay', { kcal: 260, protein: 16.5 }],
  ['thit heo nac', { kcal: 139, protein: 19 }],
  ['thit nac', { kcal: 139, protein: 19 }],
  ['suon', { kcal: 187, protein: 17.9 }],
  ['chan gio', { kcal: 230, protein: 15.7 }],
  ['gio lua', { kcal: 136, protein: 21.5 }],
  ['cha lua', { kcal: 136, protein: 21.5 }],
  ['thit heo', { kcal: 190, protein: 18 }],
  ['thit bo', { kcal: 118, protein: 21 }],
  ['bo', { kcal: 118, protein: 21 }],
  ['thit vit', { kcal: 267, protein: 17.8 }],
  ['vit', { kcal: 267, protein: 17.8 }],
  ['ga', { kcal: 199, protein: 20.3 }],
  ['tom kho', { kcal: 347, protein: 75 }],
  ['tom', { kcal: 82, protein: 18 }],
  ['muc', { kcal: 73, protein: 16 }],
  ['cua', { kcal: 103, protein: 12 }],
  ['ghe', { kcal: 103, protein: 12 }],
  ['hen', { kcal: 50, protein: 7 }],
  ['ngao', { kcal: 50, protein: 7 }],
  ['ngheu', { kcal: 50, protein: 7 }],
  ['oc', { kcal: 80, protein: 12 }],
  ['luon', { kcal: 94, protein: 18.4 }],
  ['dau phu', { kcal: 95, protein: 10.9 }],
  ['dau hu', { kcal: 95, protein: 10.9 }],
  ['dau xanh', { kcal: 328, protein: 23.4 }],
  ['dau do', { kcal: 335, protein: 23 }],
  ['dau que', { kcal: 73, protein: 5, produce: P }],
  ['dau bap', { kcal: 33, protein: 2, produce: P }],
  ['lac', { kcal: 573, protein: 27.5 }],
  ['dau phong', { kcal: 573, protein: 27.5 }],
  ['vung', { kcal: 568, protein: 20 }],
  ['gao nep', { kcal: 346, protein: 8.6 }],
  ['gao', { kcal: 344, protein: 7.9 }],
  ['com', { kcal: 130, protein: 2.7 }],
  ['bun', { kcal: 110, protein: 1.7 }],
  ['banh pho', { kcal: 141, protein: 3.2 }],
  ['mien', { kcal: 332, protein: 0.6 }],
  ['mi', { kcal: 349, protein: 11 }],
  ['banh mi', { kcal: 249, protein: 7.9, perPiece: 80 }],
  ['bot nang', { kcal: 354, protein: 0 }],
  ['bot', { kcal: 346, protein: 10 }],
  ['duong', { kcal: 397, protein: 0 }],
  ['mat ong', { kcal: 327, protein: 0.4 }],
  ['sua', { kcal: 61, protein: 3.2 }],
  ['khoai lang', { kcal: 119, protein: 0.8, produce: P }],
  ['khoai tay', { kcal: 92, protein: 2, produce: P }],
  ['khoai mon', { kcal: 109, protein: 1.5, produce: P }],
  ['ngo', { kcal: 196, protein: 4.1, produce: P }],
  ['moc nhi', { kcal: 304, protein: 10.6 }],
  ['nam huong kho', { kcal: 274, protein: 36 }],
  ['nam', { kcal: 31, protein: 3.6, produce: P }],
  ['ca chua', { kcal: 20, protein: 0.6, produce: P, perPiece: 100 }],
  ['ca rot', { kcal: 39, protein: 1.5, produce: P }],
  ['ca tim', { kcal: 22, protein: 1, produce: P }],
  ['cu cai', { kcal: 21, protein: 1.5, produce: P }],
  ['hanh tay', { kcal: 41, protein: 1.7, produce: P }],
  ['dua chuot', { kcal: 15, protein: 0.8, produce: P }],
  ['dua cai', { kcal: 18, protein: 1.5, produce: P }],
  ['gia', { kcal: 43, protein: 5.5, produce: P }],
  ['bi', { kcal: 24, protein: 0.6, produce: P }],
  ['bau', { kcal: 14, protein: 0.6, produce: P }],
  ['muop', { kcal: 16, protein: 0.9, produce: P }],
  ['su su', { kcal: 18, protein: 0.8, produce: P }],
  ['bap cai', { kcal: 29, protein: 1.8, produce: P }],
  ['sup lo', { kcal: 30, protein: 2.5, produce: P }],
  ['dua', { kcal: 29, protein: 0.8, produce: P }],
  ['xoai', { kcal: 69, protein: 0.6, produce: P }],
  ['chuoi', { kcal: 97, protein: 1.5, produce: P }],
  ['thanh long', { kcal: 60, protein: 1.2, produce: P }],
  ['du du', { kcal: 35, protein: 1, produce: P }],
  ['hat sen', { kcal: 350, protein: 18 }],
  ['ca', { kcal: 105, protein: 18 }],
  // Rau gia vị dùng ít: tính năng lượng nhưng không tính vào rau & quả.
  ['hanh', { kcal: 30, protein: 1.3 }],
  ['toi', { kcal: 121, protein: 6 }],
  ['gung', { kcal: 25, protein: 0.4 }],
  ['sa', { kcal: 25, protein: 1.8 }],
  ['ot', { kcal: 30, protein: 1.3 }],
  ['rau ram', { kcal: 30, protein: 2 }],
  ['rau thom', { kcal: 30, protein: 2 }],
  ['chanh', { kcal: 25, protein: 0.5 }],
  ['rau', { kcal: 25, protein: 2.2, produce: P }],
  ['cai', { kcal: 20, protein: 1.7, produce: P }],
];

const normalize = (value: string) =>
  ` ${value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()} `;

function findFood(name: string): Food | null {
  const text = normalize(name);
  for (const [keyword, food] of FOODS) {
    if (text.includes(` ${keyword} `)) return food;
  }
  return null;
}

function toGrams(amount: number, unit: string, food: Food): number | null {
  const value = unit.trim().toLowerCase();
  if (value === 'g' || value === 'ml') return amount;
  if (value === 'kg' || value === 'l' || value === 'lít') return amount * 1000;
  if (food.perPiece) return amount * food.perPiece;
  return null;
}

export type NutritionEstimate = { calories: number; protein: number; vegetableGrams: number };

/** Ước tính cho 1 người; trả về null nếu không nhận ra nguyên liệu chính nào. */
export function estimateRecipeNutrition(recipe: Recipe): NutritionEstimate | null {
  let calories = 0;
  let protein = 0;
  let produce = 0;
  let matched = 0;
  for (const group of recipe.ingredients) {
    for (const item of group.items) {
      if (item.amount === null || item.amount <= 0) continue;
      const food = findFood(item.name);
      if (!food) continue;
      let grams = toGrams(item.amount, item.unit, food);
      if (grams === null) continue;
      // Cân cả xương/vỏ thì chỉ khoảng một nửa là phần ăn được.
      if (/ (nguyen con|ca con|co xuong|nguyen vo|ca vo|lam sach) /.test(normalize(item.name)))
        grams *= 0.55;
      // Dầu chiên ngập chỉ ngấm một phần vào món.
      if (food.kcal >= 890 && grams > 60) grams *= 0.3;
      calories += (food.kcal * grams) / 100;
      protein += (food.protein * grams) / 100;
      if (food.produce) produce += grams;
      if (food.kcal > 0) matched += 1;
    }
  }
  if (!matched) return null;
  const servings = Math.max(1, recipe.servings || 1);
  return {
    calories: Math.round(calories / servings),
    protein: Math.round(protein / servings),
    vegetableGrams: Math.round(produce / servings),
  };
}

/** 45 → "45 phút"; 135 → "2h15p"; 120 → "2h". */
export function formatDuration(minutes: number, language: 'vi' | 'en' = 'vi') {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (language === 'en') {
    if (!hours) return `${rest} min`;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  if (!hours) return `${rest} phút`;
  return rest ? `${hours}h${String(rest).padStart(2, '0')}p` : `${hours}h`;
}
