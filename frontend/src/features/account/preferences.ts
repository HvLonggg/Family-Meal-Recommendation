import { useAuth } from '@/features/auth/AuthContext';
import type { Appetite, DietaryTag, HouseholdMember, UserPreferences } from '@/features/auth/types';
import type { Recipe } from '@/data/recipes';

export const DEFAULT_PREFERENCES: UserPreferences = {
  language: 'vi',
  household_description: '',
  household_members: [],
  servings_mode: 'auto',
  manual_servings: 4,
  dietary_tags: [],
  allergies: '',
  spice_level: 'medium',
  preferred_regions: [],
  max_cooking_minutes: 0,
  week_start: 'monday',
  calendar_mode: 'solar',
  vegetarian_lunar_days: false,
  email_meal_plan_reminders: true,
  text_size: 'normal',
  reduce_motion: false,
  notify_weekly_plan: true,
  notify_story_updates: true,
  show_name_on_stories: true,
  assistant_sassy: false,
  admin_notify_pending: true,
  admin_landing: 'admin',
  computed_portions: 0,
  computed_servings: 4,
};

const APPETITE_FACTORS: Record<Appetite, number> = { light: 0.8, normal: 1, big: 1.25 };

/** Quy đổi khẩu phần để xem trước khi chỉnh thành viên. */
export function portionFactor(age: number, appetite: Appetite = 'normal') {
  const base = age < 3 ? 0.3 : age <= 6 ? 0.5 : age <= 12 ? 0.7 : age < 65 ? 1 : 0.8;
  return base * APPETITE_FACTORS[appetite];
}

export function householdPortions(members: HouseholdMember[]) {
  return members.reduce((total, member) => total + portionFactor(member.age, member.appetite), 0);
}

export function recommendedServings(
  preferences: Pick<UserPreferences, 'household_members' | 'servings_mode' | 'manual_servings'>,
) {
  if (preferences.servings_mode === 'manual' || preferences.household_members.length === 0) {
    return preferences.manual_servings;
  }
  const portions = householdPortions(preferences.household_members);
  return Math.max(1, Math.min(20, Math.round(portions + Number.EPSILON)));
}

export const householdPresets: {
  id: string;
  label: string;
  description: string;
  members: HouseholdMember[];
}[] = [
  {
    id: 'single',
    label: 'Một mình',
    description: 'Một người lớn',
    members: [{ label: 'Tôi', age: 28, appetite: 'normal' }],
  },
  {
    id: 'sisters',
    label: 'Hai chị em',
    description: 'Ví dụ: 25 và 22 tuổi',
    members: [
      { label: 'Chị', age: 25, appetite: 'normal' },
      { label: 'Em', age: 22, appetite: 'normal' },
    ],
  },
  {
    id: 'small-family',
    label: 'Gia đình nhỏ',
    description: 'Bố mẹ và bé 12 tuổi',
    members: [
      { label: 'Bố', age: 40, appetite: 'normal' },
      { label: 'Mẹ', age: 38, appetite: 'normal' },
      { label: 'Bé', age: 12, appetite: 'normal' },
    ],
  },
  {
    id: 'three-generations',
    label: 'Ba thế hệ',
    description: 'Ông bà, bố mẹ và hai con',
    members: [
      { label: 'Ông', age: 70, appetite: 'light' },
      { label: 'Bà', age: 67, appetite: 'light' },
      { label: 'Bố', age: 42, appetite: 'normal' },
      { label: 'Mẹ', age: 40, appetite: 'normal' },
      { label: 'Con lớn', age: 15, appetite: 'big' },
      { label: 'Con nhỏ', age: 6, appetite: 'normal' },
    ],
  },
];

export const dietaryTagLabels: Record<DietaryTag, string> = {
  vegetarian: 'Ăn chay',
  no_pork: 'Không ăn thịt lợn',
  no_beef: 'Không ăn thịt bò',
  no_seafood: 'Không ăn hải sản',
  low_salt: 'Ít muối',
  low_sugar: 'Ít đường',
  less_oil: 'Ít dầu mỡ',
};

// Giữ dấu tiếng Việt khi so khớp: bỏ dấu sẽ nhầm “cà chua” thành “cá”.
const CONFLICT_KEYWORDS: Partial<Record<DietaryTag, string[]>> = {
  no_pork: ['lợn', 'heo', 'ba chỉ', 'sườn', 'giò', 'chả lụa', 'nạc vai', 'thịt xay', 'thịt băm'],
  no_beef: ['bò'],
  no_seafood: ['tôm', 'cua', 'mực', 'ngao', 'nghêu', 'hến', 'ốc', 'sò', 'cá', 'ghẹ'],
  vegetarian: ['thịt', 'cá', 'tôm', 'cua', 'mực', 'sườn', 'giò', 'chả', 'ghẹ', 'ốc'],
};

function wordsOf(value: string) {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('vi-VN')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .join(' ');
}

/** Gợi ý nguyên liệu theo từ khóa. */
export function dietaryConflicts(recipe: Recipe, tags: DietaryTag[]) {
  if (!tags.length) return [];
  const ingredientText = ` ${recipe.ingredients
    .flatMap((group) => group.items.map((item) => wordsOf(item.name)))
    .join(' | ')} `;
  return tags.filter((tag) => {
    if (
      tag === 'vegetarian' &&
      (recipe.category === 'Món chay' || recipe.tags.includes('Món chay'))
    )
      return false;
    return (CONFLICT_KEYWORDS[tag] ?? []).some((keyword) =>
      ingredientText.includes(` ${keyword} `),
    );
  });
}

export function useUserPreferences() {
  const { user } = useAuth();
  return { user, preferences: user?.preferences ?? DEFAULT_PREFERENCES, isPersonal: Boolean(user) };
}

/** Khẩu phần theo thiết lập gia đình hoặc giá trị mặc định. */
export function useDefaultServings(fallback = 4) {
  const { user } = useAuth();
  return user?.preferences ? user.preferences.computed_servings : fallback;
}
