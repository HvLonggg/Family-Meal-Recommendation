export type UserRole = 'admin' | 'user';
export type Language = 'vi' | 'en';
export type Appetite = 'light' | 'normal' | 'big';
export type DietaryTag =
  'vegetarian' | 'no_pork' | 'no_beef' | 'no_seafood' | 'low_salt' | 'low_sugar' | 'less_oil';
export type PreferredRegion = 'Bắc' | 'Trung' | 'Nam';
export type CalendarMode = 'solar' | 'lunar';

export interface HouseholdMember {
  label: string;
  age: number;
  appetite: Appetite;
}

export interface UserPreferences {
  language: Language;
  household_description: string;
  household_members: HouseholdMember[];
  servings_mode: 'auto' | 'manual';
  manual_servings: number;
  dietary_tags: DietaryTag[];
  allergies: string;
  spice_level: 'mild' | 'medium' | 'hot';
  preferred_regions: PreferredRegion[];
  max_cooking_minutes: number;
  week_start: 'monday' | 'sunday';
  calendar_mode: CalendarMode;
  vegetarian_lunar_days: boolean;
  email_meal_plan_reminders: boolean;
  text_size: 'normal' | 'large';
  reduce_motion: boolean;
  notify_weekly_plan: boolean;
  notify_story_updates: boolean;
  show_name_on_stories: boolean;
  /** Chú Rồng trả treo, cà khịa nhưng vẫn trả lời đúng. */
  assistant_sassy: boolean;
  admin_notify_pending: boolean;
  admin_landing: 'home' | 'admin';
  /** Số hàng món mỗi trang ở kho món (3–5); null = theo thiết bị/mặc định. */
  catalog_rows?: number | null;
  computed_portions: number;
  computed_servings: number;
}

export interface AuthUser {
  id: string;
  email: string | null;
  phone_e164: string | null;
  full_name: string;
  role: UserRole;
  created_at: string;
  avatar_url?: string | null;
  preferences?: UserPreferences;
  /** Phiên bản Điều khoản/Chính sách đã đồng ý; null khi chưa đồng ý. */
  terms_version?: string | null;
  terms_accepted_at?: string | null;
}

export interface AuthSession {
  access_token: string;
  token_type: 'bearer';
  expires_in: number;
  user: AuthUser;
}

export interface ProviderAvailability {
  google: boolean;
  facebook: boolean;
  email: boolean;
}
