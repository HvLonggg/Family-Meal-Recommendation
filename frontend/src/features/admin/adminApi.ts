import type { ArticleList, ArticleDetail, ArticleStatus } from '@/features/articles/articlesApi';
import { toSearch } from '@/features/articles/articlesApi';
import type { AdminSubmission, SubmissionStatus } from '@/features/submissions/submissionsApi';
import type { SupportStatus, SupportTicket } from '@/features/support/supportApi';
import { apiPatch, apiRequest } from '@/lib/api/client';

export interface Paged<T> {
  data: T[];
  total: number;
}

export interface AdminOverview {
  counts: {
    users: number;
    active_users: number;
    admins: number;
    new_users_7d: number;
    recipes_published: number;
    recipes_hidden: number;
    plan_items: number;
    planners: number;
    articles_published: number;
    articles_pending: number;
    submissions_pending: number;
    tickets_open: number;
  };
  recent_users: { id: string; full_name: string; email: string | null; created_at: string }[];
}

export interface AdminUserRow {
  id: string;
  full_name: string;
  email: string | null;
  role: 'user' | 'admin';
  status: string;
  avatar_url: string | null;
  created_at: string;
  last_login_at: string | null;
  favorites: number;
  plan_items: number;
  stories: number;
}

export interface AdminPlanItem {
  id: string;
  plan_date: string;
  meal_type: 'breakfast' | 'lunch' | 'dinner';
  servings: number;
  completion_status: 'planned' | 'completed' | 'skipped';
  recipe_slug: string;
  recipe_name: string;
  image_path: string;
}

export interface AdminPlannerRow {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  total_items: number;
  upcoming_items: number;
  completed_items: number;
  first_date: string | null;
  last_date: string | null;
}

export interface AdminRecipe {
  id: string;
  slug: string;
  catalog_id: string | null;
  name: string;
  excerpt: string;
  region: string;
  category: string;
  difficulty: string;
  prep_minutes: number;
  cook_minutes: number;
  base_servings: number;
  image_path: string;
  status: 'published' | 'hidden' | 'draft';
  tip: string;
  serving: string;
  updated_at: string;
}

export type AdminRecipeUpdate = Omit<
  AdminRecipe,
  'id' | 'slug' | 'catalog_id' | 'image_path' | 'updated_at'
>;

type Params = Record<string, string | number | undefined>;

export const adminKeys = {
  all: ['admin'] as const,
  overview: () => ['admin', 'overview'] as const,
  list: (resource: string, params: Params) => ['admin', resource, params] as const,
  userPlans: (userId: string) => ['admin', 'user-plans', userId] as const,
  user: (userId: string) => ['admin', 'user', userId] as const,
  userSection: (userId: string, section: string, params?: Params) =>
    ['admin', 'user', userId, section, params ?? {}] as const,
  recipeInsights: (slug: string) => ['admin', 'recipe-insights', slug] as const,
};

export function getAdminOverview(signal?: AbortSignal) {
  return apiRequest<AdminOverview>('/admin/overview', { signal });
}

export function listAdminUsers(params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<AdminUserRow>>(`/admin/users${toSearch(params)}`, { signal });
}

export function updateAdminUser(id: string, payload: { role?: 'user' | 'admin'; status?: string }) {
  return apiPatch<AdminUserRow>(`/admin/users/${encodeURIComponent(id)}`, payload);
}

export function getAdminUserPlans(id: string, signal?: AbortSignal) {
  return apiRequest<{ user: AdminUserRow; data: AdminPlanItem[]; total: number }>(
    `/admin/users/${encodeURIComponent(id)}/plans`,
    { signal },
  );
}

export function listAdminPlanners(params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<AdminPlannerRow>>(`/admin/plans${toSearch(params)}`, { signal });
}

export function listAdminRecipes(params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<AdminRecipeEngagement>>(`/admin/recipes${toSearch(params)}`, { signal });
}

export function updateAdminRecipe(slug: string, payload: AdminRecipeUpdate) {
  return apiPatch<AdminRecipe>(`/admin/recipes/${encodeURIComponent(slug)}`, payload);
}

export function listAdminArticles(params: Params, signal?: AbortSignal) {
  return apiRequest<ArticleList>(`/admin/articles${toSearch(params)}`, { signal });
}

export function moderateArticle(
  id: string,
  payload: { status: Exclude<ArticleStatus, 'draft'>; note?: string | null },
) {
  return apiPatch<ArticleDetail>(`/admin/articles/${encodeURIComponent(id)}/moderation`, payload);
}

export function listAdminSubmissions(params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<AdminSubmission>>(`/admin/submissions${toSearch(params)}`, { signal });
}

export function reviewSubmission(
  id: string,
  payload: { status: Exclude<SubmissionStatus, 'draft'>; admin_note?: string | null },
) {
  return apiPatch<AdminSubmission>(`/admin/submissions/${encodeURIComponent(id)}`, payload);
}

export function listAdminSupport(params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<SupportTicket>>(`/admin/support${toSearch(params)}`, { signal });
}

export function updateSupportTicket(
  id: string,
  payload: { status: SupportStatus; admin_note?: string | null },
) {
  return apiPatch<SupportTicket>(`/admin/support/${encodeURIComponent(id)}`, payload);
}

export interface AdminRecipeEngagement extends AdminRecipe {
  favorites: number;
  planned: number;
  cooked: number;
}

export type AdminRecipeSort = 'catalog' | 'updated' | 'favorites' | 'planned' | 'cooked';

export interface DailyCount {
  day: string;
  count: number;
}

export interface RankedRecipe {
  slug: string;
  name: string;
  image_path: string;
  region: string;
  category: string;
  favorites: number;
  planned: number;
  cooked: number;
}

export interface AdminInsights {
  activity: DailyCount[];
  signups: DailyCount[];
  top_recipes: RankedRecipe[];
}

export interface AdminCookedRecipe {
  slug: string;
  name: string;
  image_path: string;
  region: string;
  category: string;
  times: number;
  servings: number;
  last_cooked: string;
}

export interface AdminFavoriteRecipe {
  slug: string;
  name: string;
  image_path: string;
  region: string;
  category: string;
  status: AdminRecipe['status'];
  favorited_at: string;
  cooked_times: number;
}

export interface AdminUserDetail {
  user: AdminUserRow;
  email_verified: boolean;
  providers: string[];
  last_active_at: string | null;
  stats: {
    plan_total: number;
    plan_upcoming: number;
    plan_completed: number;
    plan_skipped: number;
    cooked_recipes: number;
    favorites: number;
    stories: number;
    submissions: number;
    saved_meals: number;
    tickets: number;
    active_sessions: number;
  };
  regions: { label: string; count: number }[];
  categories: { label: string; count: number }[];
  activity: DailyCount[];
  top_cooked: AdminCookedRecipe[];
}

export type ActivityKind = 'plan' | 'favorite' | 'story' | 'submission' | 'saved_meal' | 'support';

export interface AdminActivityEvent {
  id: string;
  kind: ActivityKind;
  action: string;
  title: string;
  occurred_at: string;
  recipe_slug: string | null;
  image_path: string | null;
  status: string | null;
  plan_date: string | null;
  meal_type: AdminPlanItem['meal_type'] | null;
  servings: number | null;
  count: number | null;
}

export interface AdminRecipeFan {
  user_id: string;
  full_name: string;
  email: string | null;
  avatar_url: string | null;
  occurred_at: string;
  times: number | null;
}

export interface AdminRecipeInsights {
  recipe: AdminRecipeEngagement;
  upcoming: number;
  skipped: number;
  recent_favorites: AdminRecipeFan[];
  top_cooks: AdminRecipeFan[];
}

export function getAdminInsights(signal?: AbortSignal) {
  return apiRequest<AdminInsights>('/admin/insights', { signal });
}

export function getAdminUser(id: string, signal?: AbortSignal) {
  return apiRequest<AdminUserDetail>(`/admin/users/${encodeURIComponent(id)}`, { signal });
}

export function listAdminUserFavorites(id: string, params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<AdminFavoriteRecipe>>(
    `/admin/users/${encodeURIComponent(id)}/favorites${toSearch(params)}`,
    { signal },
  );
}

export function listAdminUserCooked(id: string, params: Params, signal?: AbortSignal) {
  return apiRequest<Paged<AdminCookedRecipe>>(
    `/admin/users/${encodeURIComponent(id)}/cooked${toSearch(params)}`,
    { signal },
  );
}

export function listAdminUserActivity(id: string, params: Params, signal?: AbortSignal) {
  return apiRequest<{ data: AdminActivityEvent[]; next_before: string | null }>(
    `/admin/users/${encodeURIComponent(id)}/activity${toSearch(params)}`,
    { signal },
  );
}

export function getAdminRecipeInsights(slug: string, signal?: AbortSignal) {
  return apiRequest<AdminRecipeInsights>(`/admin/recipes/${encodeURIComponent(slug)}/insights`, {
    signal,
  });
}
