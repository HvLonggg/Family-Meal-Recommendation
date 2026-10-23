import { useCallback, useEffect, useRef, useState } from 'react';

import { getServerTimers, saveServerTimer, updateServerTimer } from '@/features/cooking/cookingApi';
import { foldVietnamese } from '@/features/cooking/durations';

/**
 * Chuông hẹn giờ lưu theo mốc giờ tuyệt đối (không đếm lùi) nên tải lại trang, khóa máy hay
 * trình duyệt giảm tần suất chạy nền vẫn báo đúng giờ. Máy chủ giữ bản sao để đẩy thông báo.
 */
export type CookTimer = {
  id: string;
  label: string;
  recipeSlug: string;
  startedAt: number;
  dueAt: number;
};

export const isRinging = (timer: CookTimer, now: number) => timer.dueAt <= now;

const STORAGE_KEY = 'bep-viet-cook-timers';
const MAX_TIMERS = 6;
export const MIN_TIMER_SECONDS = 5;
export const MAX_TIMER_SECONDS = 86_400;

// Từ chung chung không dùng để nhận ra chuông ("nồi xương" khớp "Hầm xương" nhờ chữ "xương").
const GENERIC = new Set([
  'noi',
  'chao',
  'cai',
  'mon',
  'cua',
  'cho',
  'chuong',
  'gio',
  'hen',
  'the',
  'timer',
  'for',
  'of',
]);
const words = (text: string) =>
  foldVietnamese(text)
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => word.length > 1 && !GENERIC.has(word));

export type TimerPick =
  | { kind: 'one'; timer: CookTimer }
  | { kind: 'ambiguous'; timers: CookTimer[] }
  | { kind: 'missing' }
  | { kind: 'none' };

/**
 * Chọn chuông người dùng nói tới: theo tên ("nồi xương" → "Hầm xương"); không nêu tên thì chuông
 * đang kêu, chuông duy nhất, hoặc (khi `fallback = 'latest'`) chuông vừa đặt gần nhất.
 */
export function pickTimer(
  timers: CookTimer[],
  target: string | undefined,
  now: number,
  fallback: 'latest' | 'ask' = 'latest',
): TimerPick {
  if (!timers.length) return { kind: 'none' };
  if (target) {
    const wanted = words(target);
    const scored = timers.map((timer) => {
      const label = new Set(words(timer.label));
      return { timer, score: wanted.filter((word) => label.has(word)).length };
    });
    const best = Math.max(...scored.map((item) => item.score));
    if (best === 0) return { kind: 'missing' };
    const winners = scored.filter((item) => item.score === best).map((item) => item.timer);
    return winners.length === 1
      ? { kind: 'one', timer: winners[0]! }
      : { kind: 'ambiguous', timers: winners };
  }
  const ringing = timers.filter((timer) => isRinging(timer, now));
  if (ringing.length === 1) return { kind: 'one', timer: ringing[0]! };
  if (timers.length === 1) return { kind: 'one', timer: timers[0]! };
  if (fallback === 'ask') return { kind: 'ambiguous', timers };
  const latest = [...timers].sort((a, b) => b.startedAt - a.startedAt)[0]!;
  return { kind: 'one', timer: latest };
}

function load(): CookTimer[] {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]') as CookTimer[];
    // Bỏ chuông đã quá hạn hơn 6 giờ (phiên nấu cũ bị bỏ dở).
    return Array.isArray(stored)
      ? stored.filter((timer) => timer?.id && Date.now() - timer.dueAt < 6 * 3600 * 1000)
      : [];
  } catch {
    return [];
  }
}

function persist(timers: CookTimer[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(timers));
  } catch {
    // Không lưu được vẫn chạy trong phiên hiện tại.
  }
}

function newId() {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ ((Math.random() * 16) >> (Number(c) / 4))).toString(16),
      );
}

type Options = {
  returnPath: string;
  onRing: (timer: CookTimer) => void;
  /** Đồng bộ với máy chủ (tắt trong test hoặc khi chưa đăng nhập). */
  sync?: boolean;
};

export function useCookTimers({ returnPath, onRing, sync = true }: Options) {
  const [timers, setTimers] = useState<CookTimer[]>(load);
  const [now, setNow] = useState(() => Date.now());
  const onRingRef = useRef(onRing);
  const timersRef = useRef(timers);
  const rung = useRef(new Set<string>());

  useEffect(() => {
    onRingRef.current = onRing;
  }, [onRing]);

  const update = useCallback((next: (current: CookTimer[]) => CookTimer[]) => {
    setTimers((current) => {
      const value = next(current);
      timersRef.current = value;
      persist(value);
      return value;
    });
  }, []);

  // Đồng hồ chung: so mốc giờ mỗi giây và ngay khi quay lại ứng dụng; chuông nào vừa đến hạn
  // thì báo đúng một lần (hoãn chuông sẽ cho báo lại).
  useEffect(() => {
    const tick = () => {
      const current = Date.now();
      setNow(current);
      for (const timer of timersRef.current) {
        if (timer.dueAt <= current && !rung.current.has(timer.id)) {
          rung.current.add(timer.id);
          onRingRef.current(timer);
        }
      }
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  // Chuông đặt ở thiết bị/tab khác vẫn hiện ở đây.
  useEffect(() => {
    if (!sync) return;
    let cancelled = false;
    getServerTimers()
      .then((remote) => {
        if (cancelled) return;
        update((current) => {
          const known = new Set(current.map((timer) => timer.id));
          const added = remote
            .filter((timer) => !known.has(timer.id))
            .map<CookTimer>((timer) => ({
              id: timer.id,
              label: timer.label,
              recipeSlug: timer.recipe_slug,
              startedAt: Date.parse(timer.started_at),
              dueAt: Date.parse(timer.due_at),
            }));
          return added.length ? [...current, ...added] : current;
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [sync, update]);

  const start = useCallback(
    (label: string, seconds: number, recipeSlug: string) => {
      const at = Date.now();
      const timer: CookTimer = {
        id: newId(),
        label,
        recipeSlug,
        startedAt: at,
        dueAt: at + seconds * 1000,
      };
      setNow(at);
      update((current) => [...current, timer].slice(-MAX_TIMERS));
      if (sync) {
        void saveServerTimer({
          id: timer.id,
          label,
          recipe_slug: recipeSlug,
          seconds,
          return_path: returnPath,
        }).catch(() => undefined);
      }
      return timer;
    },
    [returnPath, sync, update],
  );

  const snooze = useCallback(
    (id: string, seconds: number) => {
      const at = Date.now();
      rung.current.delete(id);
      setNow(at);
      update((current) =>
        current.map((timer) =>
          timer.id === id ? { ...timer, dueAt: at + seconds * 1000 } : timer,
        ),
      );
      if (sync) void updateServerTimer(id, 'snooze', seconds).catch(() => undefined);
    },
    [sync, update],
  );

  /** Đổi thời gian còn lại của chuông (thêm/bớt/đổi thành), giữ trong 5 giây..24 giờ. */
  const adjust = useCallback(
    (id: string, remainingSeconds: number) => {
      const seconds = Math.min(
        MAX_TIMER_SECONDS,
        Math.max(MIN_TIMER_SECONDS, Math.round(remainingSeconds)),
      );
      snooze(id, seconds);
      return seconds;
    },
    [snooze],
  );

  const finish = useCallback(
    (id: string, action: 'done' | 'cancel' = 'done') => {
      rung.current.delete(id);
      update((current) => current.filter((timer) => timer.id !== id));
      if (sync) void updateServerTimer(id, action).catch(() => undefined);
    },
    [sync, update],
  );

  return { timers, now, start, snooze, adjust, finish, timersRef };
}
