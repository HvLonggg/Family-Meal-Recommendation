import { apiDelete, apiPatch, apiPost, apiPut, apiRequest } from '@/lib/api/client';

export type CookSource = 'manual' | 'planner' | 'cook_mode';

export interface CookLog {
  id: string;
  recipe_slug: string;
  recipe_name: string;
  image_path: string;
  servings: number;
  source: CookSource;
  plan_item_id: string | null;
  started_at: string | null;
  cooked_at: string;
  duration_seconds: number | null;
  note: string | null;
}

export interface CookStats {
  total: number;
  dishes: number;
  last_7_days: number;
  total_minutes: number;
}

export interface CookLogPage {
  data: CookLog[];
  total: number;
  stats: CookStats;
}

export interface RecipeCookSummary {
  recipe_slug: string;
  count: number;
  last_cooked_at: string | null;
  last_log_id: string | null;
}

export interface CookLogInput {
  recipe_slug: string;
  servings?: number;
  source?: CookSource;
  plan_item_id?: string;
  started_at?: string;
  duration_seconds?: number;
  note?: string;
}

export interface ServerTimer {
  id: string;
  label: string;
  recipe_slug: string;
  status: 'running' | 'done' | 'cancelled';
  started_at: string;
  due_at: string;
}

export const cookLogsQueryKey = (userId: string | undefined) => ['cook-logs', userId] as const;
export const recipeCookQueryKey = (userId: string | undefined, slug: string) =>
  ['cook-logs', userId, 'recipe', slug] as const;

export function getCookLogs(limit = 30, offset = 0, signal?: AbortSignal) {
  return apiRequest<CookLogPage>(`/cooking/logs?limit=${limit}&offset=${offset}`, { signal });
}

export function getRecipeCookSummary(slug: string, signal?: AbortSignal) {
  return apiRequest<RecipeCookSummary>(`/cooking/recipes/${encodeURIComponent(slug)}`, {
    signal,
  });
}

export function logCooked(input: CookLogInput) {
  return apiPost<CookLog>('/cooking/logs', input);
}

export function deleteCookLog(id: string) {
  return apiDelete(`/cooking/logs/${encodeURIComponent(id)}`);
}

export function unmarkPlanItem(itemId: string) {
  return apiDelete(`/cooking/plan-items/${encodeURIComponent(itemId)}`);
}

export function getServerTimers() {
  return apiRequest<ServerTimer[]>('/cooking/timers');
}

export function saveServerTimer(timer: {
  id: string;
  label: string;
  recipe_slug: string;
  seconds: number;
  return_path: string;
}) {
  return apiPut<ServerTimer>('/cooking/timers', timer);
}

export function updateServerTimer(
  id: string,
  action: 'snooze' | 'done' | 'cancel',
  seconds?: number,
) {
  return apiPatch<ServerTimer>(`/cooking/timers/${encodeURIComponent(id)}`, {
    action,
    ...(seconds ? { seconds } : {}),
  });
}

export function getPushConfig() {
  return apiRequest<{ enabled: boolean; public_key: string | null }>('/cooking/push');
}

export function savePushSubscription(subscription: PushSubscriptionJSON) {
  return apiPut<void>('/cooking/push/subscriptions', {
    endpoint: subscription.endpoint,
    keys: subscription.keys,
  });
}

export type CompanionActionType =
  | 'none'
  | 'next'
  | 'back'
  | 'repeat'
  | 'goto'
  | 'wait'
  | 'set_timer'
  | 'snooze_timer'
  | 'stop_timer'
  | 'cancel_timer'
  | 'adjust_timer'
  | 'ingredients'
  | 'finish'
  | 'pause_listening';

export interface CompanionReply {
  handled: boolean;
  reply: string;
  action: {
    type: CompanionActionType;
    seconds: number | null;
    step: number | null;
    label: string | null;
    /** adjust_timer: thêm/bớt `seconds` hoặc đổi thời gian còn lại thành `seconds`. */
    mode?: 'add' | 'subtract' | 'set' | null;
    /** Chuông được nhắm (mã máy khách đã gửi trong `timers`). */
    timer_id?: string | null;
    all_timers?: boolean;
  };
  off_topic: boolean;
}

export interface CompanionRequest {
  utterance: string;
  language: 'vi' | 'en';
  recipe_name: string;
  servings: number;
  ingredients: string[];
  steps: { kind: 'ingredients' | 'preparation' | 'cooking' | 'finish'; text: string }[];
  step_index: number;
  timers: { id?: string; label: string; remaining_seconds: number }[];
  history: { role: 'user' | 'assistant'; content: string }[];
  /** Giờ trên máy người dùng (giây kể từ nửa đêm) để quy "lúc 7 giờ tối" ra số giây. */
  local_seconds?: number;
}

/** Hỏi Chú Rồng phụ bếp: hiểu câu nói theo bối cảnh bước đang nấu và chọn hành động. */
export function askCompanion(request: CompanionRequest, signal?: AbortSignal) {
  return apiRequest<CompanionReply>('/cooking/assistant', {
    method: 'POST',
    body: JSON.stringify(request),
    signal,
  });
}
