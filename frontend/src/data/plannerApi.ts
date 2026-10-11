import { apiRequest } from '@/lib/api/client';

export type PlannerMealType = 'breakfast' | 'lunch' | 'dinner';
export type PlannerPeriod = 'day' | 'week' | 'month';
export type PlannerAction = 'added' | 'updated' | 'removed' | 'completed' | 'skipped' | 'reopened';
export type MealCompletionStatus = 'planned' | 'completed' | 'skipped';

export interface PlannedRecipe {
  slug: string;
  name: string;
  image_path: string;
  image_alt: string;
  base_servings: number;
  ingredients: {
    name: string;
    amount: string | number | null;
    unit: string;
    note: string | null;
    scalable: boolean;
  }[];
}

export interface PlanItem {
  id: string;
  plan_date: string;
  meal_type: PlannerMealType;
  servings: number;
  completion_status: MealCompletionStatus;
  created_at: string;
  updated_at: string;
  recipe: PlannedRecipe;
}

export interface PlanEvent {
  id: string;
  action: PlannerAction;
  recipe_slug: string;
  recipe_name: string;
  image_path: string;
  plan_date: string;
  meal_type: PlannerMealType;
  servings: number;
  occurred_at: string;
}

export interface PlanHistoryPage {
  data: PlanEvent[];
  total: number;
}

export interface PlanMealHistoryGroup {
  plan_date: string;
  meal_type: PlannerMealType;
  completion_status: MealCompletionStatus;
  items: PlanItem[];
}

export interface PlanMealHistoryPage {
  data: PlanMealHistoryGroup[];
  total: number;
}

export interface ShoppingList {
  period: PlannerPeriod;
  from_date: string;
  to_date: string;
  recipe_count: number;
  dishes: {
    slug: string;
    name: string;
    image_path: string;
    image_alt: string;
    plan_date: string;
    meal_type: PlannerMealType;
    servings: number;
  }[];
  items: {
    name: string;
    category: 'ingredient' | 'seasoning';
    amount: string | number | null;
    unit: string;
    notes: string[];
    recipe_names: string[];
  }[];
}

export interface PlanItemCreate {
  recipe_slug: string;
  plan_date: string;
  meal_type: PlannerMealType;
  servings: number;
}

export interface PlanMealCreate {
  recipe_slugs: string[];
  plan_date: string;
  meal_type: PlannerMealType;
  servings: number;
}

export interface PlanMealStatusUpdate {
  plan_date: string;
  meal_type: PlannerMealType;
  completion_status: MealCompletionStatus;
}

export const plannerItemsQueryKey = (userId?: string, from = '', to = '') =>
  ['planner-items', userId, from, to] as const;
export const plannerHistoryQueryKey = (userId?: string) => ['planner-history', userId] as const;
export const plannerMealHistoryQueryKey = (userId?: string, through = '') =>
  ['planner-meal-history', userId, through] as const;
export const plannerShoppingQueryKey = (userId?: string, period?: PlannerPeriod, date?: string) =>
  ['planner-shopping', userId, period, date] as const;

export function getPlanItems(from: string, to: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ from, to });
  return apiRequest<PlanItem[]>(`/planner/items?${query}`, { signal });
}

export function addPlanItem(payload: PlanItemCreate) {
  return apiRequest<PlanItem>('/planner/items', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function addPlanMeal(payload: PlanMealCreate) {
  return apiRequest<{ items: PlanItem[]; already_planned: number }>('/planner/meals', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export function updateMealStatus(payload: PlanMealStatusUpdate) {
  return apiRequest<PlanItem[]>('/planner/meals/status', {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export function updatePlanServings(id: string, servings: number) {
  return apiRequest<PlanItem>(`/planner/items/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify({ servings }),
  });
}

export function removePlanItem(id: string) {
  return apiRequest<void>(`/planner/items/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export function getPlanHistory(limit: number, offset: number, signal?: AbortSignal) {
  const query = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  return apiRequest<PlanHistoryPage>(`/planner/history?${query}`, { signal });
}

export function getPastMealHistory(
  through: string,
  limit: number,
  offset: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ through, limit: String(limit), offset: String(offset) });
  return apiRequest<PlanMealHistoryPage>(`/planner/history/meals?${query}`, { signal });
}

export function getShoppingList(period: PlannerPeriod, date: string, signal?: AbortSignal) {
  const query = new URLSearchParams({ period, date });
  return apiRequest<ShoppingList>(`/planner/shopping-list?${query}`, { signal });
}
