import type { Recipe } from '@/data/recipes';
import { normalizeSearchText } from '@/lib/search';
import { seededShuffle } from '@/lib/seededShuffle';

export type Season = 'cold' | 'hot';

// Gió mùa về từ tháng 11 đến tháng 2: ưu tiên món nóng, nhiều nước; còn lại gợi ý món thanh mát.
export function seasonOf(date: Date): Season {
  const month = Number(
    new Intl.DateTimeFormat('en-US', { month: 'numeric', timeZone: 'Asia/Ho_Chi_Minh' }).format(
      date,
    ),
  );
  return month >= 11 || month <= 2 ? 'cold' : 'hot';
}

// Từ khóa đã bỏ dấu; nhóm "strong" được ưu tiên trước, nhóm "extra" bù cho đủ số món.
const RULES: Record<Season, { strong: RegExp; extra: RegExp }> = {
  cold: {
    strong: /\b(lau|chao|sup|ham|tiem|pho|bun bo|hu tieu|banh canh|mi quang|gung|om|nau)\b/,
    extra: /\b(kho|nuong|rim|rang)\b/,
  },
  hot: {
    strong: /\b(canh chua|goi|nom|che|rau ma|sinh to|thach|salad|nuoc ep)\b/,
    extra: /\b(cuon|tron|luoc|hap|canh)\b/,
  },
};

const DAY_MS = 86_400_000;

/** Món hợp thời tiết, đổi mỗi ngày nhưng ổn định trong ngày. */
export function selectSeasonalRecipes(
  recipes: Recipe[],
  season: Season,
  date: Date,
  limit: number,
) {
  const rule = RULES[season];
  const seed = `${season}:${Math.floor(date.getTime() / DAY_MS)}`;
  const strong: Recipe[] = [];
  const extra: Recipe[] = [];
  for (const recipe of recipes) {
    const name = normalizeSearchText(recipe.name);
    if (rule.strong.test(name)) strong.push(recipe);
    else if (rule.extra.test(name)) extra.push(recipe);
  }
  const bySlug = (recipe: Recipe) => recipe.slug;
  return [...seededShuffle(strong, seed, bySlug), ...seededShuffle(extra, seed, bySlug)].slice(
    0,
    limit,
  );
}
