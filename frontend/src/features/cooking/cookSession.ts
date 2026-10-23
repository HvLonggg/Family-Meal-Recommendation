import { ingredientAmount, type Recipe } from '@/data/recipes';
import type { Language } from '@/features/auth/types';
import { detectStepTimer } from '@/features/cooking/durations';

/** Một món trong phiên vào bếp; món từ kế hoạch mang theo id để ghi nhận "đã nấu". */
export type CookDish = { slug: string; servings: number; planItemId?: string };

export type CookStepKind = 'ingredients' | 'preparation' | 'cooking' | 'finish';

export type CookStep = {
  key: string;
  dishIndex: number;
  kind: CookStepKind;
  /** Thứ tự trong nhóm (sơ chế/thực hiện), bắt đầu từ 1. */
  number: number;
  groupSize: number;
  text: string;
  /** Danh sách nguyên liệu (chỉ bước chuẩn bị). */
  items?: string[];
  timerSeconds: number | null;
};

const PLAN_ID = /^[0-9a-f-]{36}$/i;
const SLUG = /^[a-z0-9-]{1,180}$/;

/** `?dish=canh-chua-ca:4:<id kế hoạch>` (lặp lại cho nhiều món của một bữa). */
export function parseCookDishes(values: string[]): CookDish[] {
  const seen = new Set<string>();
  const dishes: CookDish[] = [];
  for (const value of values.slice(0, 8)) {
    const [slug = '', rawServings = '', planItemId = ''] = value.split(':');
    if (!SLUG.test(slug) || seen.has(slug)) continue;
    seen.add(slug);
    const servings = Number.parseInt(rawServings, 10);
    dishes.push({
      slug,
      servings: Number.isFinite(servings) ? Math.min(30, Math.max(1, servings)) : 0,
      ...(PLAN_ID.test(planItemId) ? { planItemId } : {}),
    });
  }
  return dishes;
}

export function cookDishParam(dish: CookDish) {
  return [dish.slug, dish.servings || '', dish.planItemId ?? ''].join(':').replace(/:+$/, '');
}

export function cookPath(dishes: CookDish[]) {
  const params = new URLSearchParams();
  for (const dish of dishes) params.append('dish', cookDishParam(dish));
  return `/cook?${params.toString()}`;
}

export function buildCookSteps(
  dishes: { recipe: Recipe; servings: number }[],
  language: Language,
): CookStep[] {
  const number = new Intl.NumberFormat(language === 'vi' ? 'vi-VN' : 'en-US', {
    maximumFractionDigits: 2,
  });
  const steps: CookStep[] = [];
  dishes.forEach(({ recipe, servings }, dishIndex) => {
    const items = recipe.ingredients.flatMap((group) =>
      group.items.map((item) => {
        const amount = ingredientAmount(item, recipe, servings);
        const quantity = amount == null ? item.unit : `${number.format(amount)} ${item.unit}`;
        return `${item.name}: ${quantity}${item.note ? ` (${item.note})` : ''}`;
      }),
    );
    steps.push({
      key: `${recipe.slug}:ingredients`,
      dishIndex,
      kind: 'ingredients',
      number: 1,
      groupSize: 1,
      text: recipe.name,
      items,
      timerSeconds: null,
    });
    const add = (kind: 'preparation' | 'cooking', list: string[]) =>
      list.forEach((text, index) =>
        steps.push({
          key: `${recipe.slug}:${kind}:${index}`,
          dishIndex,
          kind,
          number: index + 1,
          groupSize: list.length,
          text,
          timerSeconds: detectStepTimer(text),
        }),
      );
    add('preparation', recipe.preparation);
    add('cooking', recipe.cooking);
    steps.push({
      key: `${recipe.slug}:finish`,
      dishIndex,
      kind: 'finish',
      number: 1,
      groupSize: 1,
      text: [recipe.finishedDish, recipe.serving].filter(Boolean).join(' '),
      timerSeconds: null,
    });
  });
  return steps;
}

/** Tiến độ được lưu trên trình duyệt để tải lại trang hay khóa máy vẫn nấu tiếp được. */
export type CookProgress = {
  key: string;
  stepIndex: number;
  startedAt: number;
  dishStartedAt: Record<string, number>;
  logged: string[];
};

const PROGRESS_KEY = 'bep-viet-cook-progress';
const PROGRESS_TTL = 12 * 3600 * 1000;

export function loadProgress(key: string, now = Date.now()): CookProgress | null {
  try {
    const stored = JSON.parse(localStorage.getItem(PROGRESS_KEY) ?? 'null') as CookProgress | null;
    if (stored?.key === key && now - stored.startedAt < PROGRESS_TTL) return stored;
  } catch {
    // Bộ nhớ trình duyệt bị chặn: bắt đầu phiên mới.
  }
  return null;
}

export function saveProgress(progress: CookProgress | null) {
  try {
    if (progress) localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
    else localStorage.removeItem(PROGRESS_KEY);
  } catch {
    // Không lưu được thì vẫn nấu bình thường trong phiên hiện tại.
  }
}
