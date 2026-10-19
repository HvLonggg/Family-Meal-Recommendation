import fruitPlatterImage from '@/assets/recipes/trai-cay-trang-mieng.jpg';
import { getRecipe, recipeMinutes, recipes, type Recipe } from '@/data/recipes';

export type MealRole = 'main' | 'soup' | 'vegetable' | 'vegetarian' | 'side' | 'dessert';
export type MealProfile = 'balanced' | 'light' | 'quick' | 'family';

export type RandomDish = {
  id: string;
  sourceKey: string;
  name: string;
  role: MealRole;
  image: string;
  imageAlt: string;
  href?: string;
  calories: number | null;
  protein: number | null;
  vegetableGrams: number | null;
  minutes: number;
  profiles: MealProfile[];
};

export type MealSlot = {
  role: MealRole;
  dish: RandomDish | null;
};

export type SavedRandomMeal = {
  id: string;
  createdAt: string;
  profile: MealProfile;
  dishIds: string[];
};

export const roleDetails: Record<MealRole, { label: string; shortLabel: string; emoji: string }> = {
  main: { label: 'Món chính', shortLabel: 'Món chính', emoji: '🍲' },
  soup: { label: 'Món canh', shortLabel: 'Món canh', emoji: '🥣' },
  vegetable: { label: 'Món rau', shortLabel: 'Món rau', emoji: '🥬' },
  vegetarian: { label: 'Món chay', shortLabel: 'Món chay', emoji: '🌱' },
  side: { label: 'Món phụ', shortLabel: 'Món phụ', emoji: '🍳' },
  dessert: { label: 'Tráng miệng', shortLabel: 'Tráng miệng', emoji: '🍉' },
};

export const profileDetails: Record<
  MealProfile,
  { label: string; description: string; emoji: string }
> = {
  balanced: {
    label: 'Cân bằng',
    description: 'Đủ đạm, rau và món thanh vị',
    emoji: '⚖️',
  },
  light: {
    label: 'Thanh nhẹ',
    description: 'Ưu tiên món ít dầu và dễ ăn',
    emoji: '🌿',
  },
  quick: {
    label: 'Nhanh gọn',
    description: 'Phù hợp ngày bận rộn',
    emoji: '⏱️',
  },
  family: {
    label: 'Cả nhà',
    description: 'Vị quen, dễ dùng cho nhiều lứa tuổi',
    emoji: '🏡',
  },
};

const roleSequences: Record<number, MealRole[]> = {
  3: ['main', 'soup', 'vegetable'],
  4: ['main', 'soup', 'vegetable', 'dessert'],
  5: ['main', 'soup', 'vegetable', 'vegetarian', 'dessert'],
  6: ['main', 'soup', 'vegetable', 'vegetarian', 'side', 'dessert'],
};

function fromRecipe(
  slug: string,
  role: MealRole,
  nutrition: Pick<RandomDish, 'calories' | 'protein' | 'vegetableGrams'>,
  profiles: MealProfile[],
): RandomDish {
  const recipe = getRecipe(slug) as Recipe;
  return {
    id: `${role}:${recipe.slug}`,
    sourceKey: recipe.slug,
    name: recipe.name,
    role,
    image: recipe.image,
    imageAlt: recipe.imageAlt,
    href: `/recipes/${recipe.slug}`,
    minutes: recipeMinutes(recipe),
    profiles,
    ...nutrition,
  };
}

const legacyDishCatalog: RandomDish[] = [
  fromRecipe('ca-chep-kho-rieng', 'main', { calories: 310, protein: 28, vegetableGrams: 25 }, [
    'balanced',
    'family',
  ]),
  fromRecipe('suon-xao-chua-ngot', 'main', { calories: 390, protein: 24, vegetableGrams: 60 }, [
    'balanced',
    'family',
  ]),
  fromRecipe('bun-cha-ha-noi', 'main', { calories: 420, protein: 25, vegetableGrams: 90 }, [
    'family',
  ]),
  fromRecipe('pho-ga-gia-dinh', 'main', { calories: 350, protein: 27, vegetableGrams: 45 }, [
    'light',
    'family',
  ]),
  fromRecipe('canh-chua-ca', 'soup', { calories: 115, protein: 13, vegetableGrams: 105 }, [
    'balanced',
    'light',
    'quick',
    'family',
  ]),
  fromRecipe('rau-muong-xao-toi', 'vegetable', { calories: 85, protein: 3, vegetableGrams: 125 }, [
    'balanced',
    'light',
    'quick',
    'family',
  ]),
  fromRecipe(
    'dau-hu-sot-ca-chua',
    'vegetarian',
    { calories: 145, protein: 8, vegetableGrams: 75 },
    ['balanced', 'light', 'quick', 'family'],
  ),
  fromRecipe(
    'trung-chien-rau-cu',
    'vegetarian',
    { calories: 165, protein: 10, vegetableGrams: 55 },
    ['balanced', 'quick', 'family'],
  ),
  fromRecipe('trung-chien-rau-cu', 'side', { calories: 165, protein: 10, vegetableGrams: 55 }, [
    'balanced',
    'quick',
    'family',
  ]),
  fromRecipe('dau-hu-sot-ca-chua', 'side', { calories: 145, protein: 8, vegetableGrams: 75 }, [
    'balanced',
    'light',
    'quick',
  ]),
  {
    id: 'dessert:seasonal-fruit',
    sourceKey: 'seasonal-fruit',
    name: 'Trái cây theo mùa',
    role: 'dessert',
    image: fruitPlatterImage,
    imageAlt: 'Đĩa trái cây theo mùa gồm dưa hấu, cam, thanh long và xoài',
    calories: 95,
    protein: 1,
    vegetableGrams: 120,
    minutes: 8,
    profiles: ['balanced', 'light', 'quick', 'family'],
  },
];

let catalogSource = recipes;
let cachedCatalog = legacyDishCatalog;

export function getRandomDishCatalog(): RandomDish[] {
  if (catalogSource === recipes) return cachedCatalog;
  const legacyKeys = new Set(legacyDishCatalog.map((dish) => dish.sourceKey));
  const existing = legacyDishCatalog.map((dish) => {
    const recipe = getRecipe(dish.sourceKey);
    return recipe
      ? {
          ...dish,
          name: recipe.name,
          image: recipe.image,
          imageAlt: recipe.imageAlt,
          minutes: recipeMinutes(recipe),
        }
      : dish;
  });
  const added = recipes
    .filter((recipe) => !legacyKeys.has(recipe.slug))
    .flatMap((recipe): RandomDish[] => {
      const roles: MealRole[] =
        recipe.category === 'Món canh'
          ? ['soup']
          : recipe.category === 'Món rau'
            ? ['vegetable']
            : recipe.category === 'Món chay'
              ? ['vegetarian', 'side']
              : recipe.category === 'Món ăn kèm' || recipe.ingredientCategory === 'Trứng'
                ? ['side']
                : recipe.category === 'Món tráng miệng' &&
                    /^(chè|thạch|sữa chua|bánh flan)/i.test(recipe.name)
                  ? ['dessert']
                  : recipe.category === 'Món mặn' || recipe.category === 'Món nước'
                    ? ['main']
                    : [];
      const profiles: MealProfile[] = ['balanced', 'family'];
      if (recipeMinutes(recipe) <= 30) profiles.push('quick');
      if (recipe.tags.some((tag) => ['luộc', 'hấp', 'nấu canh'].includes(tag)))
        profiles.push('light');
      return roles.map((role) =>
        fromRecipe(
          recipe.slug,
          role,
          { calories: null, protein: null, vegetableGrams: null },
          profiles,
        ),
      );
    });
  catalogSource = recipes;
  cachedCatalog = [...existing, ...added];
  return cachedCatalog;
}

export function createMealSlots(count: number): MealSlot[] {
  const normalizedCount = Math.min(6, Math.max(3, count));
  return roleSequences[normalizedCount]!.map((role) => ({ role, dish: null }));
}

export function getCandidates(
  role: MealRole,
  profile: MealProfile,
  excludedSourceKeys: string[] = [],
) {
  const available = getRandomDishCatalog().filter(
    (dish) => dish.role === role && !excludedSourceKeys.includes(dish.sourceKey),
  );
  const preferred = available.filter((dish) => dish.profiles.includes(profile));
  return preferred.length > 0 ? preferred : available;
}

export function pickRandomDish(
  role: MealRole,
  profile: MealProfile,
  excludedSourceKeys: string[] = [],
  random = Math.random,
) {
  const candidates = getCandidates(role, profile, excludedSourceKeys);
  if (candidates.length === 0) return null;
  return candidates[Math.floor(random() * candidates.length)] ?? candidates[0]!;
}

export function calculateMealStats(slots: MealSlot[]) {
  const dishes = slots.flatMap((slot) => (slot.dish ? [slot.dish] : []));
  return dishes.reduce(
    (total, dish) => ({
      calories: total.calories + (dish.calories ?? 0),
      protein: total.protein + (dish.protein ?? 0),
      vegetableGrams: total.vegetableGrams + (dish.vegetableGrams ?? 0),
      maxMinutes: Math.max(total.maxMinutes, dish.minutes),
      hasNutrition: total.hasNutrition,
    }),
    {
      calories: 0,
      protein: 0,
      vegetableGrams: 0,
      maxMinutes: 0,
      hasNutrition: dishes.every(
        (dish) => dish.calories !== null && dish.protein !== null && dish.vegetableGrams !== null,
      ),
    },
  );
}

export function restoreMealSlots(dishIds: string[]): MealSlot[] {
  return dishIds.flatMap((id) => {
    const dish = getRandomDishCatalog().find((item) => item.id === id);
    return dish ? [{ role: dish.role, dish }] : [];
  });
}

// CSS conic gradients start at twelve o'clock; approach the target clockwise.
export function getNextWheelRotation(current: number, segmentIndex: number, segmentCount: number) {
  const target = (360 - ((segmentIndex + 0.5) * 360) / segmentCount) % 360;
  const delta = (target - (current % 360) + 360) % 360;
  return current + 1080 + delta;
}

/** Tên món theo ngôn ngữ hiện tại. */
export function dishName(dish: Pick<RandomDish, 'name' | 'sourceKey'>) {
  return getRecipe(dish.sourceKey)?.name ?? dish.name;
}
