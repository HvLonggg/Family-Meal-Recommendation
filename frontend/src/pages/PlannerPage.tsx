import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { PlannerCalendarHeader, PlannerDayHeader } from '@/components/planner/PlannerCalendar';
import { MealCelebration } from '@/components/recipes/MealCelebration';
import { dishImage } from '@/data/dishImages';
import {
  matchesRecipeSearch,
  recipeSearchRank,
  useEnglishSearchIndexVersion,
} from '@/data/recipeSearch';
import { recipeText, type Recipe } from '@/data/recipes';
import {
  addPlanMeal,
  getPlanHistory,
  getPastMealHistory,
  getPlanItems,
  getShoppingList,
  getVegetarianDays,
  plannerHistoryQueryKey,
  plannerItemsQueryKey,
  plannerMealHistoryQueryKey,
  plannerShoppingQueryKey,
  plannerVegetarianDaysQueryKey,
  removePlanItem,
  setVegetarianDay,
  updatePlanServings,
  updateMealStatus,
  type PlanItem,
  type PlannerMealType,
  type PlannerPeriod,
  type MealCompletionStatus,
  type VegetarianDayMark,
} from '@/data/plannerApi';
import { savePreferences } from '@/features/account/accountApi';
import { DEFAULT_PREFERENCES, useDefaultServings } from '@/features/account/preferences';
import { useAuth } from '@/features/auth/AuthContext';
import { LoginRequiredDialog } from '@/features/auth/LoginRequiredDialog';
import { logCooked, unmarkPlanItem } from '@/features/cooking/cookingApi';
import { cookPath } from '@/features/cooking/cookSession';
import type { CalendarMode } from '@/features/auth/types';
import type { Translate } from '@/features/i18n/translate';
import { errorMessage as translateError } from '@/lib/errors';
import { fitDishCutout } from '@/lib/fitDishCutout';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';
import {
  formatDateTime,
  formatDayMonth,
  formatFullDate,
  formatLunarRange,
  formatWeekdayDate,
  isVegetarianRecipe,
  resolveVegetarianDay,
  upsertVegetarianMark,
  vegetarianOverrides,
  vegetarianRulesFrom,
} from '@/features/planner/plannerCalendar';
import { PlannerHistoryCalendar } from '@/features/planner/PlannerHistoryCalendar';
import { PlannerWeekOverview } from '@/features/planner/PlannerWeekOverview';
import {
  lunarFromIsoDate,
  lunarYearName,
  numericLunarLabel,
  vietnamToday,
} from '@/lib/lunarCalendar';

import './planner-page.css';

const mealTypes: { id: PlannerMealType; label: string }[] = [
  { id: 'breakfast', label: 'Bữa sáng' },
  { id: 'lunch', label: 'Bữa trưa' },
  { id: 'dinner', label: 'Bữa tối' },
];

const periods: { id: PlannerPeriod; label: string }[] = [
  { id: 'day', label: 'Theo ngày' },
  { id: 'week', label: 'Theo tuần' },
  { id: 'month', label: 'Theo tháng' },
];

const maxRecipesPerMeal = 30;
/** Số món hiện thêm mỗi lần cuộn gần cuối danh sách trong hộp thoại chọn món. */
const recipeBatchSize = 30;
const mobileQuery = '(max-width: 760px)';
const viewModeStorageKey = 'bep-viet:planner-view-mode';
type PlannerViewMode = 'edit' | 'overview';

function readViewMode(): PlannerViewMode {
  try {
    return window.localStorage.getItem(viewModeStorageKey) === 'overview' ? 'overview' : 'edit';
  } catch {
    return 'edit';
  }
}

function storeViewMode(mode: PlannerViewMode) {
  try {
    window.localStorage.setItem(viewModeStorageKey, mode);
  } catch {
    // Trình duyệt chặn lưu trữ: chế độ xem chỉ giữ trong phiên hiện tại.
  }
}

// Đơn vị đếm nguyên chiếc: không thể mua "0,5 khúc" hay "1,5 bó".
const wholeUnits = new Set([
  'bìa',
  'bó',
  'cái',
  'cánh',
  'cây',
  'chiếc',
  'con',
  'cọng',
  'đoạn',
  'gói',
  'hộp',
  'khúc',
  'lá',
  'miếng',
  'nhánh',
  'ổ',
  'ống',
  'piece',
  'que',
  'sợi',
  'tàu',
  'tấm',
  'tép',
  'thanh',
  'viên',
]);
// Đơn vị có thể mua nửa (nửa quả chanh, nửa củ hành) nhưng không nhỏ hơn.
const halfUnits = new Set(['củ', 'quả', 'trái']);

/** Làm tròn lên theo đơn vị mua được; giữ nguyên với g, ml, muỗng… */
function purchasableAmount(value: number, unit: string) {
  const normalized = unit.trim().toLocaleLowerCase('vi-VN');
  const head = normalized.split(/\s+/)[0] ?? '';
  // "khúc 40 cm", "lá 20x20": đơn vị kèm kích thước luôn là một chiếc nguyên.
  if (wholeUnits.has(head) || (/\d/.test(normalized) && !/^\d/.test(normalized))) {
    return Math.max(1, Math.ceil(value - 1e-9));
  }
  if (halfUnits.has(head)) return Math.max(0.5, Math.ceil(value * 2 - 1e-9) / 2);
  return value;
}

function toDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseLocalDate(value: string) {
  return new Date(`${value}T12:00:00`);
}

function startOfWeek(date: Date, sundayFirst = false) {
  const start = new Date(date);
  start.setHours(12, 0, 0, 0);
  const offset = sundayFirst ? start.getDay() : (start.getDay() + 6) % 7;
  start.setDate(start.getDate() - offset);
  return start;
}

function shiftDate(date: Date, days: number) {
  const shifted = new Date(date);
  shifted.setDate(shifted.getDate() + days);
  return shifted;
}

function formatDay(date: Date, locale: string) {
  return formatDayMonth(date, locale);
}

function formatRange(from: string, to: string, locale: string) {
  return `${formatDay(parseLocalDate(from), locale)} – ${formatDay(parseLocalDate(to), locale)}`;
}

function formatQuantity(
  amount: string | number | null,
  unit: string,
  t: Translate,
  locale: string,
) {
  // Đơn vị "vừa đủ" đã đủ nghĩa, không ghép thêm lần nữa.
  if (amount === null && unit.trim().toLocaleLowerCase('vi-VN') === 'vừa đủ') return t('vừa đủ');
  const value = amount === null ? null : purchasableAmount(Number(amount), unit);
  unit = recipeText(unit);
  if (value === null) return t('vừa đủ {unit}', { unit });
  const display = Number.isInteger(value) ? String(value) : value.toLocaleString(locale);
  return `${display} ${unit}`.trim();
}

function planItemKey(item: PlanItem) {
  return `${item.plan_date}:${item.meal_type}`;
}

export function PlannerPage() {
  const { updateUser, user } = useAuth();
  const { locale, t } = useI18n();
  const preferences = user?.preferences ?? DEFAULT_PREFERENCES;
  const catalog = useRecipeCatalog();
  const errorMessage = (error: unknown) => translateError(error, t);
  const defaultServings = useDefaultServings();
  const [searchParams, setSearchParams] = useSearchParams();
  const sundayFirst = user?.preferences?.week_start === 'sunday';
  const weekStartOf = (date: Date) => startOfWeek(date, sundayFirst);
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(parseLocalDate(vietnamToday())));
  const [activeTab, setActiveTab] = useState<'week' | 'history'>('week');
  // Tổng quan tuần: bảng chỉ đọc để xem nhanh tuần đã lên thực đơn; nhớ lựa chọn trên thiết bị.
  const [viewMode, setViewModeState] = useState<PlannerViewMode>(readViewMode);
  const setViewMode = (mode: PlannerViewMode) => {
    setViewModeState(mode);
    storeViewMode(mode);
  };
  const overviewActive = activeTab === 'week' && viewMode === 'overview';
  const [addTarget, setAddTarget] = useState<{ date: string; mealType: PlannerMealType } | null>(
    null,
  );
  // Bảng chi tiết một bữa: nơi đặt mọi thao tác từng món để lưới tuần luôn gọn.
  const [detailTarget, setDetailTarget] = useState<{
    date: string;
    mealType: PlannerMealType;
    readOnly?: boolean;
  } | null>(null);
  const detailTriggerRef = useRef<HTMLElement | null>(null);
  const [search, setSearch] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(recipeBatchSize);
  // Ô bữa vừa lưu: cuộn tới và làm nổi vài giây để người dùng thấy kết quả.
  const [highlightSlot, setHighlightSlot] = useState<string | null>(null);
  const highlightTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(highlightTimerRef.current), []);
  const weekScrollRef = useRef<HTMLDivElement>(null);
  const [servings, setServings] = useState(defaultServings);
  const [feedback, setFeedback] = useState('');
  // Món vừa xóa: giữ lại vài giây để người dùng hoàn tác nếu bấm nhầm.
  const [removedItem, setRemovedItem] = useState<PlanItem | null>(null);
  const removedTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(removedTimerRef.current), []);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingPeriod, setShoppingPeriod] = useState<PlannerPeriod>('week');
  const [shoppingDate, setShoppingDate] = useState(() =>
    toDateInputValue(weekStartOf(parseLocalDate(vietnamToday()))),
  );
  const [celebration, setCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState('');
  const [vegetarianFilter, setVegetarianFilter] = useState<boolean | null>(null);
  const [modeOverride, setModeOverride] = useState<CalendarMode | null>(null);
  // Khách được xem và thử lịch (đổi tuần, đánh dấu ăn chay ngay trên máy); chỉ khi lưu thật mới cần đăng nhập.
  const [loginPrompt, setLoginPrompt] = useState(false);
  const [guestVegetarian, setGuestVegetarian] = useState<Record<string, boolean>>({});
  const requireLogin = () => {
    if (user) return false;
    setLoginPrompt(true);
    return true;
  };
  // Lịch luôn chạy theo ngày Việt Nam (GMT+7), kể cả khi máy đặt múi giờ khác.
  const [today, setToday] = useState(() => vietnamToday());
  const calendarMode = modeOverride ?? preferences.calendar_mode;
  const currentWeekStart = toDateInputValue(weekStartOf(parseLocalDate(today)));

  useEffect(() => {
    const refreshToday = () => setToday(vietnamToday());
    const timer = window.setInterval(refreshToday, 60_000);
    window.addEventListener('focus', refreshToday);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refreshToday);
    };
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, index) => shiftDate(weekStart, index)),
    [weekStart],
  );
  const weekFrom = toDateInputValue(weekStart);
  const weekTo = toDateInputValue(days[6]!);
  const itemsQuery = useQuery({
    queryKey: plannerItemsQueryKey(user?.id, weekFrom, weekTo),
    queryFn: ({ signal }) => getPlanItems(weekFrom, weekTo, signal),
    enabled: Boolean(user),
  });
  const historyQuery = useInfiniteQuery({
    queryKey: plannerHistoryQueryKey(user?.id),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => getPlanHistory(40, pageParam, signal),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.data.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: activeTab === 'history' && Boolean(user),
  });
  const pastMealsQuery = useInfiniteQuery({
    queryKey: plannerMealHistoryQueryKey(user?.id, today),
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => getPastMealHistory(today, 20, pageParam, signal),
    getNextPageParam: (lastPage, pages) => {
      const loaded = pages.reduce((total, page) => total + page.data.length, 0);
      return loaded < lastPage.total ? loaded : undefined;
    },
    enabled: activeTab === 'history' && Boolean(user),
  });
  const vegetarianQuery = useQuery({
    queryKey: plannerVegetarianDaysQueryKey(user?.id, weekFrom, weekTo),
    queryFn: ({ signal }) => getVegetarianDays(weekFrom, weekTo, signal),
    enabled: Boolean(user),
  });
  const todayVegetarianQuery = useQuery({
    queryKey: plannerVegetarianDaysQueryKey(user?.id, today, today),
    queryFn: ({ signal }) => getVegetarianDays(today, today, signal),
    enabled: Boolean(user),
  });
  const shoppingQuery = useQuery({
    queryKey: plannerShoppingQueryKey(user?.id, shoppingPeriod, shoppingDate),
    queryFn: ({ signal }) => getShoppingList(shoppingPeriod, shoppingDate, signal),
    enabled: shoppingOpen && Boolean(user),
  });

  const invalidatePlanner = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['planner-items', user?.id] }),
      queryClient.invalidateQueries({ queryKey: plannerHistoryQueryKey(user?.id) }),
      queryClient.invalidateQueries({ queryKey: ['planner-meal-history', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['planner-history-days', user?.id] }),
      queryClient.invalidateQueries({ queryKey: ['planner-shopping', user?.id] }),
    ]);

  const addMutation = useMutation({
    mutationFn: addPlanMeal,
    onSuccess: async (result, payload) => {
      const addedCount = result.items.length;
      const alreadyPlannedCount = result.already_planned;
      const resultMessage =
        addedCount && alreadyPlannedCount
          ? t('Đã thêm {added} món; {existing} món đã có trong bữa ăn.', {
              added: addedCount,
              existing: alreadyPlannedCount,
            })
          : addedCount
            ? t('Đã lưu {count} món vào bữa ăn.', { count: addedCount })
            : alreadyPlannedCount
              ? t('Các món bạn chọn đã có trong bữa ăn này.')
              : t('Không có món mới được thêm vào bữa ăn.');
      setFeedback(resultMessage);
      setCelebrationMessage(resultMessage);
      const targetWeek = weekStartOf(parseLocalDate(payload.plan_date));
      if (toDateInputValue(targetWeek) !== weekFrom) setWeekStart(targetWeek);
      await invalidatePlanner();
      if (addedCount) {
        setAddTarget(null);
        setSelectedSlugs([]);
        setCelebration(true);
      }
    },
  });
  const removeMutation = useMutation({
    mutationFn: (item: PlanItem) => removePlanItem(item.id),
    onSuccess: async (_result, item) => {
      setRemovedItem(item);
      window.clearTimeout(removedTimerRef.current);
      removedTimerRef.current = window.setTimeout(() => setRemovedItem(null), 6000);
      await invalidatePlanner();
    },
  });
  const undoRemove = () => {
    if (!removedItem) return;
    window.clearTimeout(removedTimerRef.current);
    addMutation.mutate({
      recipe_slugs: [removedItem.recipe.slug],
      plan_date: removedItem.plan_date,
      meal_type: removedItem.meal_type,
      servings: removedItem.servings,
    });
    setRemovedItem(null);
  };
  // Tick "đã nấu" từng món: ghi vào nhật ký nấu và đánh dấu món hoàn thành trong kế hoạch.
  const cookedMutation = useMutation({
    mutationFn: async (item: PlanItem) => {
      if (item.completion_status === 'completed') await unmarkPlanItem(item.id);
      else {
        await logCooked({
          recipe_slug: item.recipe.slug,
          plan_item_id: item.id,
          servings: item.servings,
          source: 'planner',
        });
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cook-logs'] });
      return invalidatePlanner();
    },
  });
  const servingsMutation = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => updatePlanServings(id, count),
    onSuccess: invalidatePlanner,
  });
  const mealStatusMutation = useMutation({
    mutationFn: updateMealStatus,
    onSuccess: invalidatePlanner,
  });
  const vegetarianKey = ['planner-vegetarian-days', user?.id] as const;
  const vegetarianMutation = useMutation({
    mutationFn: ({ day, value }: { day: string; value: boolean }) => setVegetarianDay(day, value),
    // Cập nhật lạc quan để ô lịch đổi màu ngay khi bấm, hoàn tác nếu máy chủ từ chối.
    onMutate: async ({ day, value }) => {
      await queryClient.cancelQueries({ queryKey: vegetarianKey });
      const snapshots = queryClient.getQueriesData<VegetarianDayMark[]>({
        queryKey: vegetarianKey,
      });
      for (const [key, marks] of snapshots) {
        const [, , from, to] = key;
        if (typeof from === 'string' && typeof to === 'string' && day >= from && day <= to) {
          queryClient.setQueryData(key, upsertVegetarianMark(marks ?? [], day, value));
        }
      }
      return { snapshots };
    },
    onError: (_error, _variables, context) => {
      for (const [key, marks] of context?.snapshots ?? []) queryClient.setQueryData(key, marks);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: vegetarianKey }),
  });
  const calendarModeMutation = useMutation({
    mutationFn: (mode: CalendarMode) => savePreferences({ ...preferences, calendar_mode: mode }),
    onMutate: (mode) => setModeOverride(mode),
    onSuccess: (saved) => {
      if (user) updateUser({ ...user, preferences: saved });
    },
    onError: () => setModeOverride(null),
  });

  const plannedItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  // Gõ phím không phải chờ lọc ~800 món: React ưu tiên ô nhập, danh sách cập nhật ngay sau đó.
  const deferredSearch = useDeferredValue(search);
  const englishIndexVersion = useEnglishSearchIndexVersion();
  const filteredRecipes = useMemo(() => {
    void englishIndexVersion;
    const ranked = catalog
      .filter((recipe) => matchesRecipeSearch(recipe, deferredSearch))
      .map((recipe) => ({ recipe, rank: recipeSearchRank(recipe, deferredSearch) }));
    ranked.sort((left, right) => right.rank - left.rank);
    return ranked.map(({ recipe }) => recipe);
  }, [catalog, deferredSearch, englishIndexVersion]);
  const historyEvents = historyQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const pastMealGroups = pastMealsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const groupedItems = useMemo(() => {
    const grouped = new Map<string, PlanItem[]>();
    for (const item of plannedItems) {
      const key = planItemKey(item);
      grouped.set(key, [...(grouped.get(key) ?? []), item]);
    }
    return grouped;
  }, [plannedItems]);
  const overrides = useMemo(() => {
    const merged = vegetarianOverrides(vegetarianQuery.data, todayVegetarianQuery.data);
    for (const [day, value] of Object.entries(guestVegetarian)) merged.set(day, value);
    return merged;
  }, [guestVegetarian, todayVegetarianQuery.data, vegetarianQuery.data]);
  // Ngày 1/15 tự đánh dấu theo đúng lịch đang xem (dương hoặc âm).
  const vegetarianRules = vegetarianRulesFrom({ ...preferences, calendar_mode: calendarMode });
  const vegetarianStateOf = (value: string) =>
    resolveVegetarianDay(value, overrides, vegetarianRules);
  const toggleVegetarian = (value: string) => {
    const next = !vegetarianStateOf(value).vegetarian;
    if (!user) {
      setGuestVegetarian((current) => ({ ...current, [value]: next }));
      return;
    }
    vegetarianMutation.mutate({ day: value, value: next });
  };
  const changeCalendarMode = (mode: CalendarMode) => {
    if (!user) {
      setModeOverride(mode);
      return;
    }
    calendarModeMutation.mutate(mode);
  };
  const vegetarianPendingFor = (value: string) =>
    vegetarianMutation.isPending && vegetarianMutation.variables?.day === value;
  const catalogBySlug = useMemo(
    () => new Map(catalog.map((recipe) => [recipe.slug, recipe])),
    [catalog],
  );
  const isNonVegetarianDish = (slug: string) => {
    const recipe = catalogBySlug.get(slug);
    return Boolean(recipe && !isVegetarianRecipe(recipe));
  };
  const vegetarianDayCount = days.filter(
    (day) => vegetarianStateOf(toDateInputValue(day)).vegetarian,
  ).length;
  const targetIsVegetarian = addTarget ? vegetarianStateOf(addTarget.date).vegetarian : false;
  const targetLunar =
    addTarget && /^\d{4}-\d{2}-\d{2}$/.test(addTarget.date)
      ? lunarFromIsoDate(addTarget.date)
      : null;
  const vegetarianOnly = vegetarianFilter ?? targetIsVegetarian;
  const dialogRecipes = vegetarianOnly
    ? filteredRecipes.filter((recipe) => isVegetarianRecipe(recipe))
    : filteredRecipes;
  const visibleRecipes = dialogRecipes.slice(0, visibleCount);
  const showMoreRecipes = (target: HTMLElement) => {
    if (visibleCount >= dialogRecipes.length) return;
    if (target.scrollTop + target.clientHeight >= target.scrollHeight - 160) {
      setVisibleCount((count) => count + recipeBatchSize);
    }
  };
  const uniqueMeals = new Set(plannedItems.map(planItemKey)).size;
  const totalServings = plannedItems.reduce((total, item) => total + item.servings, 0);

  const openAddDialog = (date: string, mealType: PlannerMealType) => {
    setFeedback('');
    setSearch('');
    setSelectedSlugs([]);
    setVisibleCount(recipeBatchSize);
    setServings(defaultServings);
    setVegetarianFilter(null);
    setAddTarget({ date, mealType });
    addMutation.reset();
  };

  const openMealDetail = (
    date: string,
    mealType: PlannerMealType,
    trigger?: HTMLElement,
    readOnly = false,
  ) => {
    detailTriggerRef.current = trigger ?? null;
    setDetailTarget({ date, mealType, readOnly });
  };
  const closeMealDetail = () => {
    setDetailTarget(null);
    // Trả tiêu điểm về món vừa bấm để người dùng bàn phím không bị lạc.
    const trigger = detailTriggerRef.current;
    detailTriggerRef.current = null;
    if (trigger?.isConnected) trigger.focus();
  };
  const addFromMealDetail = () => {
    if (!detailTarget) return;
    detailTriggerRef.current = null;
    setDetailTarget(null);
    openAddDialog(detailTarget.date, detailTarget.mealType);
  };
  const detailItems = detailTarget
    ? (groupedItems.get(`${detailTarget.date}:${detailTarget.mealType}`) ?? [])
    : [];
  const detailMealLabel = detailTarget
    ? (mealTypes.find((meal) => meal.id === detailTarget.mealType)?.label ?? '')
    : '';
  const detailVegetarian = detailTarget ? vegetarianStateOf(detailTarget.date).vegetarian : false;
  const detailReadOnly = Boolean(detailTarget?.readOnly);

  const requestedToken = JSON.stringify([...new Set(searchParams.getAll('add').filter(Boolean))]);
  const [handledAddToken, setHandledAddToken] = useState<string | null>(null);
  // Mở hộp thoại từ liên kết ?add=… ngay trong lúc render (mẫu "điều chỉnh state theo props"),
  // tránh setState đồng bộ trong effect; effect bên dưới chỉ xóa tham số khỏi URL.
  if (requestedToken !== '[]' && requestedToken !== handledAddToken && user) {
    const requestedSlugs = JSON.parse(requestedToken) as string[];
    const requestedRecipes = requestedSlugs
      .map((slug) => catalogBySlug.get(slug))
      .filter((recipe): recipe is Recipe => Boolean(recipe));
    const selectedRecipes = requestedRecipes.slice(0, maxRecipesPerMeal);
    const missingCount = requestedSlugs.length - requestedRecipes.length;
    const overflowCount = requestedRecipes.length - selectedRecipes.length;

    setHandledAddToken(requestedToken);
    setSearch(selectedRecipes.length === 1 ? selectedRecipes[0]!.name : '');
    setSelectedSlugs(selectedRecipes.map((recipe) => recipe.slug));
    setVisibleCount(recipeBatchSize);
    setServings(defaultServings);
    setVegetarianFilter(null);
    setAddTarget({ date: today, mealType: 'dinner' });
    if (missingCount && overflowCount) {
      setFeedback(
        t('Đã bỏ {missing} món không còn trong kho và giữ tối đa {limit} món.', {
          missing: missingCount,
          limit: maxRecipesPerMeal,
        }),
      );
    } else if (missingCount) {
      setFeedback(
        t('Đã bỏ {count} món không còn trong kho; các món khác vẫn được chọn.', {
          count: missingCount,
        }),
      );
    } else if (overflowCount) {
      setFeedback(
        t('Một bữa tối đa {limit} món; đã giữ lại số món đầu tiên trong mâm.', {
          limit: maxRecipesPerMeal,
        }),
      );
    } else {
      setFeedback('');
    }
  }
  const addTokenHandled = requestedToken !== '[]' && requestedToken === handledAddToken;
  useEffect(() => {
    if (addTokenHandled) setSearchParams({}, { replace: true });
  }, [addTokenHandled, setSearchParams]);

  const submitAdd = () => {
    if (!addTarget || requireLogin()) return;
    setFeedback('');
    const slot = `${addTarget.date}:${addTarget.mealType}`;
    addMutation.mutate(
      {
        recipe_slugs: selectedSlugs,
        plan_date: addTarget.date,
        meal_type: addTarget.mealType,
        servings,
      },
      {
        onSuccess: (result) => {
          if (!result.items.length) return;
          setHighlightSlot(slot);
          window.clearTimeout(highlightTimerRef.current);
          highlightTimerRef.current = window.setTimeout(() => setHighlightSlot(null), 3500);
        },
      },
    );
  };

  // Cuộn tới ô vừa lưu (dọc và ngang) sau khi lưới đã vẽ lại.
  useEffect(() => {
    if (!highlightSlot) return;
    const cell = document.querySelector(`[data-slot="${highlightSlot}"]`);
    cell?.scrollIntoView?.({ behavior: 'smooth', block: 'center', inline: 'center' });
  }, [highlightSlot]);

  // Di động: lưới 7 cột phải cuộn ngang, nên đưa cột hôm nay (hoặc đầu tuần) vào tầm nhìn.
  const weekGridReady = activeTab === 'week' && itemsQuery.isSuccess;
  useEffect(() => {
    const scroller = weekScrollRef.current;
    if (!weekGridReady || !scroller || !window.matchMedia?.(mobileQuery).matches) return;
    const todayColumn = scroller.querySelector<HTMLElement>('.planner-day.is-today');
    scroller.scrollLeft = todayColumn ? todayColumn.offsetLeft : 0;
  }, [weekFrom, today, weekGridReady]);

  const dismissCelebration = useCallback(() => setCelebration(false), []);
  const toggleRecipe = (slug: string) => {
    if (selectedSlugs.includes(slug)) {
      setSelectedSlugs((current) => current.filter((selected) => selected !== slug));
      setFeedback('');
      return;
    }
    if (selectedSlugs.length >= maxRecipesPerMeal) {
      setFeedback(
        t('Bạn có thể chọn tối đa {count} món cho một bữa.', { count: maxRecipesPerMeal }),
      );
      return;
    }
    setSelectedSlugs((current) => (current.includes(slug) ? current : [...current, slug]));
    setFeedback('');
  };
  const updateStatus = (date: string, mealType: PlannerMealType, status: MealCompletionStatus) => {
    if (requireLogin()) return;
    mealStatusMutation.mutate({ plan_date: date, meal_type: mealType, completion_status: status });
  };

  const addMealThisWeek = () =>
    openAddDialog(weekFrom === currentWeekStart ? today : weekFrom, 'lunch');
  const showShoppingList = () => {
    setShoppingDate(weekFrom);
    setShoppingOpen(true);
    window.setTimeout(
      () => document.querySelector('.planner-shopping')?.scrollIntoView?.({ behavior: 'smooth' }),
      0,
    );
  };

  return (
    <div
      className={`page-wrap planner-page${overviewActive && !shoppingOpen ? ' planner-page--print-overview' : ''}`}
    >
      <LoginRequiredDialog
        description={t(
          'Bạn cứ xem và thử lịch thoải mái. Đăng nhập để lưu kế hoạch, đánh dấu bữa đã ăn và đồng bộ trên mọi thiết bị.',
        )}
        onClose={() => setLoginPrompt(false)}
        open={loginPrompt}
      />
      <section className="page-hero page-hero--planner">
        <div className="container">
          <span className="section-label">
            {user
              ? t('Kế hoạch của {name}', { name: user.full_name.split(' ').at(-1) ?? '' })
              : t('Kế hoạch nấu ăn của bạn')}
          </span>
          <h1>{t('Một tuần chủ động, mỗi bữa thảnh thơi')}</h1>
          <p>{t('Lưu món theo từng bữa, xem lại lịch sử và chuẩn bị nguyên liệu vừa đủ.')}</p>
        </div>
      </section>

      <section className="content-section">
        <div className="container planner-dashboard">
          <PlannerCalendarHeader
            mode={calendarMode}
            modeSaving={calendarModeMutation.isPending}
            onModeChange={changeCalendarMode}
            onToggleTodayVegetarian={() => toggleVegetarian(today)}
            today={today}
            todayVegetarian={vegetarianStateOf(today)}
            vegetarianPending={vegetarianPendingFor(today)}
          />
          {calendarModeMutation.isError || vegetarianMutation.isError ? (
            <p className="planner-inline-error" role="alert">
              {errorMessage(calendarModeMutation.error ?? vegetarianMutation.error)}
            </p>
          ) : null}
          <div className="planner-toolbar planner-toolbar--modern">
            <div className="planner-week-control">
              <button
                aria-label={t('Xem tuần trước')}
                className="icon-button planner-round-button"
                onClick={() => setWeekStart((current) => shiftDate(current, -7))}
                type="button"
              >
                <AppIcon name="arrow" size={18} />
              </button>
              <div className="planner-week-label">
                <strong>
                  {weekFrom === currentWeekStart ? t('Tuần này') : t('Kế hoạch tuần')}
                </strong>
                <span>
                  {calendarMode === 'lunar'
                    ? t('ÂL {date}', { date: formatLunarRange(weekFrom, weekTo) })
                    : `${formatRange(weekFrom, weekTo, locale)} · ${weekStart.getFullYear()}`}
                </span>
              </div>
              <button
                aria-label={t('Xem tuần tiếp theo')}
                className="icon-button planner-round-button planner-round-button--next"
                onClick={() => setWeekStart((current) => shiftDate(current, 7))}
                type="button"
              >
                <AppIcon name="arrow" size={18} />
              </button>
              {weekFrom !== currentWeekStart ? (
                <button
                  className="button button--outline planner-current-week"
                  onClick={() => setWeekStart(parseLocalDate(currentWeekStart))}
                  type="button"
                >
                  {t('Tuần hiện tại')}
                </button>
              ) : null}
            </div>
            <div className="planner-toolbar__actions">
              <button
                className="button button--outline"
                disabled={!plannedItems.length}
                onClick={showShoppingList}
                type="button"
              >
                <AppIcon name="check" size={17} /> {t('Danh sách mua sắm')}
              </button>
              {overviewActive ? null : (
                <button className="button button--primary" onClick={addMealThisWeek} type="button">
                  <AppIcon name="plus" size={18} /> {t('Thêm bữa ăn')}
                </button>
              )}
            </div>
          </div>

          <div className="planner-tabs-row">
            <div aria-label={t('Chế độ xem kế hoạch')} className="planner-tabs" role="tablist">
              <button
                aria-selected={activeTab === 'week'}
                className={activeTab === 'week' ? 'is-active' : ''}
                onClick={() => setActiveTab('week')}
                role="tab"
                type="button"
              >
                <AppIcon name="calendar" size={17} /> {t('Lịch tuần')}
              </button>
              <button
                aria-selected={activeTab === 'history'}
                className={activeTab === 'history' ? 'is-active' : ''}
                onClick={() => setActiveTab('history')}
                role="tab"
                type="button"
              >
                <AppIcon name="history" size={17} /> {t('Lịch sử bữa ăn')}
              </button>
            </div>
            {activeTab === 'week' ? (
              <button
                aria-label={t('Xem tổng quan tuần')}
                aria-pressed={viewMode === 'overview'}
                className={`planner-overview-toggle${viewMode === 'overview' ? ' is-active' : ''}`}
                onClick={() => setViewMode(viewMode === 'overview' ? 'edit' : 'overview')}
                title={
                  viewMode === 'overview'
                    ? t('Đang xem tổng quan · bấm để quay lại chỉnh sửa')
                    : t('Xem tổng quan tuần')
                }
                type="button"
              >
                <AppIcon name="eye" size={17} />
                <span>{t('Tổng quan')}</span>
              </button>
            ) : null}
          </div>

          {activeTab === 'week' ? (
            <>
              {itemsQuery.isLoading ? (
                <div className="route-loading" role="status">
                  <span className="button__spinner" aria-hidden="true" />{' '}
                  {t('Đang tải kế hoạch của bạn…')}
                </div>
              ) : itemsQuery.isError ? (
                <div className="planner-message planner-message--error" role="alert">
                  <strong>{t('Chưa tải được kế hoạch')}</strong>
                  <span>{errorMessage(itemsQuery.error)}</span>
                  <button
                    className="button button--outline"
                    onClick={() => void itemsQuery.refetch()}
                    type="button"
                  >
                    {t('Thử tải lại')}
                  </button>
                </div>
              ) : overviewActive ? (
                <PlannerWeekOverview
                  days={days.map(toDateInputValue)}
                  groupedItems={groupedItems}
                  mealTypes={mealTypes}
                  mode={calendarMode}
                  onAddMeal={() => {
                    setViewMode('edit');
                    addMealThisWeek();
                  }}
                  onEdit={() => setViewMode('edit')}
                  onOpenMeal={(date, mealType, trigger) =>
                    openMealDetail(date, mealType, trigger, true)
                  }
                  today={today}
                  vegetarianStateOf={vegetarianStateOf}
                />
              ) : (
                <>
                  <div className="planner-legend">
                    <span className="planner-legend__item planner-legend__item--veg">
                      <i aria-hidden="true" /> {t('Ngày ăn chay')}
                    </span>
                    <span className="planner-legend__item planner-legend__item--today">
                      <i aria-hidden="true" /> {t('Hôm nay')}
                    </span>
                    <span className="planner-legend__hint">
                      <AppIcon name="leaf" size={14} />
                      {t('Bấm biểu tượng lá ở đầu mỗi ngày để đánh dấu ngày ăn chay.')}
                    </span>
                  </div>
                  <div
                    aria-label={t('Lịch món ăn trong tuần')}
                    className="planner-week-scroll"
                    ref={weekScrollRef}
                  >
                    {removedItem && !detailTarget ? (
                      <div className="planner-undo" role="status">
                        <span>
                          {t('Đã xóa {name} khỏi kế hoạch.', {
                            name: recipeText(removedItem.recipe.name),
                          })}
                        </span>
                        <button onClick={undoRemove} type="button">
                          {t('Hoàn tác')}
                        </button>
                      </div>
                    ) : null}
                    <div className="planner-grid planner-grid--personal">
                      {days.map((day) => {
                        const dateValue = toDateInputValue(day);
                        const isToday = dateValue === today;
                        const vegetarianDay = vegetarianStateOf(dateValue);
                        const dayLabel = formatWeekdayDate(day, locale);
                        return (
                          <article
                            aria-label={
                              vegetarianDay.vegetarian
                                ? t('{date} · ngày ăn chay', {
                                    date: formatWeekdayDate(day, locale, true),
                                  })
                                : undefined
                            }
                            className={`planner-day${isToday ? ' is-today' : ''}${vegetarianDay.vegetarian ? ' is-vegetarian' : ''}`}
                            key={dateValue}
                          >
                            <PlannerDayHeader
                              isToday={isToday}
                              mode={calendarMode}
                              onToggleVegetarian={() => toggleVegetarian(dateValue)}
                              pending={vegetarianPendingFor(dateValue)}
                              value={dateValue}
                              vegetarian={vegetarianDay}
                            />
                            <div className="planner-day__meals">
                              {mealTypes.map((meal) => {
                                const slot = `${dateValue}:${meal.id}`;
                                const slotItems = groupedItems.get(slot) ?? [];
                                const addLabel = t('Thêm món vào {meal} {date}', {
                                  meal: t(meal.label).toLocaleLowerCase(locale),
                                  date: dayLabel,
                                });
                                return (
                                  <section
                                    className={`planner-meal${slotItems.length ? '' : ' is-empty'}${highlightSlot === slot ? ' is-highlighted' : ''}`}
                                    data-slot={slot}
                                    key={meal.id}
                                  >
                                    <div className="planner-meal__heading">
                                      <h3>{t(meal.label)}</h3>
                                      {slotItems.length ? (
                                        <>
                                          <span className="planner-meal__count">
                                            {t('{count} món', { count: slotItems.length })}
                                          </span>
                                          <button
                                            aria-label={addLabel}
                                            className="planner-add-icon"
                                            onClick={() => openAddDialog(dateValue, meal.id)}
                                            type="button"
                                          >
                                            <AppIcon name="plus" size={14} />
                                          </button>
                                        </>
                                      ) : null}
                                    </div>
                                    {slotItems.length ? (
                                      // Ô gọn: chỉ ảnh nhỏ + tên; thao tác từng món nằm trong bảng chi tiết bữa.
                                      <ul className="planner-dish-list">
                                        {slotItems.map((item) => {
                                          const name = recipeText(item.recipe.name);
                                          const notVegetarian =
                                            vegetarianDay.vegetarian &&
                                            isNonVegetarianDish(item.recipe.slug);
                                          return (
                                            <li
                                              className={`planner-dish${item.completion_status === 'completed' ? ' is-cooked' : ''}${notVegetarian ? ' is-not-veg' : ''}`}
                                              key={item.id}
                                            >
                                              <button
                                                aria-haspopup="dialog"
                                                aria-label={t('Mở {meal} {date}: {name}', {
                                                  meal: t(meal.label).toLocaleLowerCase(locale),
                                                  date: dayLabel,
                                                  name,
                                                })}
                                                className="planner-dish__open"
                                                onClick={(event) =>
                                                  openMealDetail(
                                                    dateValue,
                                                    meal.id,
                                                    event.currentTarget,
                                                  )
                                                }
                                                title={
                                                  notVegetarian
                                                    ? `${name} · ${t('Không phải món chay')}`
                                                    : name
                                                }
                                                type="button"
                                              >
                                                <img
                                                  alt=""
                                                  {...dishImage(
                                                    item.recipe.slug,
                                                    item.recipe.image_path,
                                                    '40px',
                                                  )}
                                                />
                                                <span>{name}</span>
                                                {item.completion_status === 'completed' ? (
                                                  <i
                                                    aria-hidden="true"
                                                    className="planner-dish__done"
                                                  >
                                                    <AppIcon name="check" size={10} />
                                                  </i>
                                                ) : notVegetarian ? (
                                                  <i
                                                    aria-hidden="true"
                                                    className="planner-dish__veg-dot"
                                                  />
                                                ) : null}
                                              </button>
                                            </li>
                                          );
                                        })}
                                      </ul>
                                    ) : (
                                      <button
                                        aria-label={addLabel}
                                        className="planner-meal__empty"
                                        onClick={() => openAddDialog(dateValue, meal.id)}
                                        type="button"
                                      >
                                        <AppIcon name="plus" size={20} />
                                      </button>
                                    )}
                                  </section>
                                );
                              })}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {overviewActive ? null : (
                <div className="planner-summary planner-summary--personal">
                  <div className="planner-summary__icon">
                    <AppIcon name="calendar" size={22} />
                  </div>
                  <div className="planner-summary__copy">
                    <strong>
                      {t('{count} món trong kế hoạch tuần', { count: plannedItems.length })}
                    </strong>
                    <small>
                      {t('{meals} bữa đã sắp xếp · Tổng khẩu phần {servings}', {
                        meals: uniqueMeals,
                        servings: totalServings,
                      })}
                    </small>
                    {vegetarianDayCount ? (
                      <small className="planner-summary__veg">
                        <AppIcon name="leaf" size={13} />
                        {t('{count} ngày ăn chay trong tuần', { count: vegetarianDayCount })}
                      </small>
                    ) : null}
                  </div>
                  <button
                    className="button button--primary"
                    disabled={!plannedItems.length}
                    onClick={showShoppingList}
                    type="button"
                  >
                    {t('Danh sách mua sắm')} <AppIcon name="arrow" size={17} />
                  </button>
                </div>
              )}
              {servingsMutation.isError || removeMutation.isError || cookedMutation.isError ? (
                <p className="planner-inline-error" role="alert">
                  {errorMessage(
                    servingsMutation.error ?? removeMutation.error ?? cookedMutation.error,
                  )}
                </p>
              ) : null}
            </>
          ) : (
            <section aria-label={t('Lịch sử kế hoạch món ăn')} className="planner-history">
              {user ? (
                <PlannerHistoryCalendar
                  onOpenWeek={(value) => {
                    setWeekStart(weekStartOf(parseLocalDate(value)));
                    setActiveTab('week');
                  }}
                  sundayFirst={sundayFirst}
                  today={today}
                  userId={user.id}
                />
              ) : null}
              {pastMealsQuery.isLoading ? (
                <div className="route-loading" role="status">
                  <span className="button__spinner" aria-hidden="true" />{' '}
                  {t('Đang tải lịch sử bữa ăn…')}
                </div>
              ) : pastMealsQuery.isError ? (
                <div className="planner-message planner-message--error" role="alert">
                  <strong>{t('Chưa tải được lịch sử bữa ăn')}</strong>
                  <span>{errorMessage(pastMealsQuery.error)}</span>
                </div>
              ) : pastMealGroups.length ? (
                <>
                  <div className="planner-history__intro">
                    <h2>
                      {t('{count} bữa trong lịch sử', {
                        count: pastMealsQuery.data?.pages[0]?.total ?? 0,
                      })}
                    </h2>
                    <p>
                      {t('Kế hoạch được cập nhật theo ngày, kèm trạng thái thực tế của từng bữa.')}
                    </p>
                  </div>
                  <ol className="planner-meal-history">
                    {pastMealGroups.map((group) => (
                      <li
                        className="planner-meal-history__card"
                        key={`${group.plan_date}:${group.meal_type}`}
                      >
                        <div className="planner-meal-history__heading">
                          <div>
                            <span>
                              {formatWeekdayDate(parseLocalDate(group.plan_date), locale, true)} ·{' '}
                              {t('ÂL {date}', {
                                date: numericLunarLabel(lunarFromIsoDate(group.plan_date)),
                              })}
                            </span>
                            <h3>
                              {t(
                                mealTypes.find((meal) => meal.id === group.meal_type)?.label ?? '',
                              )}
                            </h3>
                          </div>
                          <span className={`planner-status-pill is-${group.completion_status}`}>
                            {group.completion_status === 'completed'
                              ? t('Đã nấu')
                              : group.completion_status === 'skipped'
                                ? t('Đã bỏ qua')
                                : t('Theo kế hoạch')}
                          </span>
                        </div>
                        <div className="planner-meal-history__dishes">
                          {group.items.map((item) => (
                            <Link key={item.id} to={`/recipes/${item.recipe.slug}`}>
                              <img
                                alt={recipeText(item.recipe.image_alt)}
                                {...dishImage(item.recipe.slug, item.recipe.image_path)}
                              />
                              <span>{recipeText(item.recipe.name)}</span>
                            </Link>
                          ))}
                        </div>
                        <div className="planner-meal-history__actions">
                          <small>
                            {t('{count} món · {servings} khẩu phần', {
                              count: group.items.length,
                              servings: group.items.reduce((n, item) => n + item.servings, 0),
                            })}
                          </small>
                          <div>
                            <button
                              className="button button--outline"
                              disabled={
                                mealStatusMutation.isPending ||
                                group.completion_status === 'completed'
                              }
                              onClick={() =>
                                updateStatus(group.plan_date, group.meal_type, 'completed')
                              }
                              type="button"
                            >
                              <AppIcon name="check" size={15} /> {t('Đã nấu')}
                            </button>
                            <button
                              className="planner-history__skip"
                              disabled={
                                mealStatusMutation.isPending ||
                                group.completion_status === 'skipped'
                              }
                              onClick={() =>
                                updateStatus(group.plan_date, group.meal_type, 'skipped')
                              }
                              type="button"
                            >
                              {t('Bỏ qua')}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                  {mealStatusMutation.isError ? (
                    <p className="planner-inline-error" role="alert">
                      {errorMessage(mealStatusMutation.error)}
                    </p>
                  ) : null}
                  {pastMealsQuery.hasNextPage ? (
                    <button
                      className="button button--outline planner-history__more"
                      disabled={pastMealsQuery.isFetchingNextPage}
                      onClick={() => void pastMealsQuery.fetchNextPage()}
                      type="button"
                    >
                      {pastMealsQuery.isFetchingNextPage ? t('Đang tải…') : t('Xem các bữa cũ hơn')}
                    </button>
                  ) : null}
                  <details className="planner-audit-history">
                    <summary>{t('Lịch sử thay đổi chi tiết')}</summary>
                    {historyQuery.isLoading ? (
                      <p>{t('Đang tải lịch sử thay đổi…')}</p>
                    ) : historyQuery.isError ? (
                      <p>{errorMessage(historyQuery.error)}</p>
                    ) : (
                      <>
                        <ol className="planner-history__list">
                          {historyEvents.map((event) => (
                            <li key={event.id}>
                              <img alt="" {...dishImage(event.recipe_slug, event.image_path)} />
                              <div>
                                <strong>
                                  {t(
                                    event.action === 'added'
                                      ? 'Đã thêm'
                                      : event.action === 'updated'
                                        ? 'Đã cập nhật'
                                        : event.action === 'removed'
                                          ? 'Đã xóa'
                                          : event.action === 'completed'
                                            ? 'Đã nấu'
                                            : event.action === 'skipped'
                                              ? 'Đã bỏ qua'
                                              : 'Đưa lại vào kế hoạch',
                                  )}{' '}
                                  {recipeText(event.recipe_name)}
                                </strong>
                                <span>
                                  {t(
                                    mealTypes.find((meal) => meal.id === event.meal_type)?.label ??
                                      '',
                                  )}{' '}
                                  · {formatDateTime(new Date(event.occurred_at), locale)}
                                </span>
                                <small>
                                  {t('Ngày kế hoạch {date} · {count} khẩu phần', {
                                    date: formatFullDate(parseLocalDate(event.plan_date), locale),
                                    count: event.servings,
                                  })}
                                </small>
                              </div>
                            </li>
                          ))}
                        </ol>
                        {historyQuery.hasNextPage ? (
                          <button
                            className="button button--outline planner-history__more"
                            disabled={historyQuery.isFetchingNextPage}
                            onClick={() => void historyQuery.fetchNextPage()}
                            type="button"
                          >
                            {historyQuery.isFetchingNextPage
                              ? t('Đang tải…')
                              : t('Xem thay đổi cũ hơn')}
                          </button>
                        ) : null}
                      </>
                    )}
                  </details>
                </>
              ) : (
                <div className="planner-empty-state">
                  <AppIcon name="history" size={28} />
                  <h2>{t('Chưa có bữa ăn trong lịch sử')}</h2>
                  <p>{t('Các bữa đã lên kế hoạch sẽ xuất hiện tại đây sau ngày nấu.')}</p>
                  <button
                    className="button button--primary"
                    onClick={() => setActiveTab('week')}
                    type="button"
                  >
                    {t('Mở lịch tuần')}
                  </button>
                </div>
              )}
            </section>
          )}

          {shoppingOpen ? (
            <section aria-label={t('Danh sách mua sắm')} className="planner-shopping">
              <div className="planner-shopping__header">
                <div>
                  <span className="section-label">{t('Chuẩn bị nguyên liệu')}</span>
                  <h2>{t('Danh sách mua sắm')}</h2>
                  {shoppingQuery.data ? (
                    <p>
                      {formatRange(
                        shoppingQuery.data.from_date,
                        shoppingQuery.data.to_date,
                        locale,
                      )}{' '}
                      ·{' '}
                      {t('{count} món trong kế hoạch', { count: shoppingQuery.data.recipe_count })}
                    </p>
                  ) : null}
                </div>
                <button
                  aria-label={t('Đóng danh sách mua sắm')}
                  className="icon-button"
                  onClick={() => setShoppingOpen(false)}
                  type="button"
                >
                  <AppIcon name="close" size={19} />
                </button>
              </div>
              <div className="planner-shopping__filters">
                <div
                  aria-label={t('Khoảng thời gian danh sách')}
                  className="planner-period-tabs"
                  role="group"
                >
                  {periods.map((period) => (
                    <button
                      aria-pressed={shoppingPeriod === period.id}
                      className={shoppingPeriod === period.id ? 'is-active' : ''}
                      key={period.id}
                      onClick={() => setShoppingPeriod(period.id)}
                      type="button"
                    >
                      {t(period.label)}
                    </button>
                  ))}
                </div>
                <label className="planner-date-picker">
                  <span>{t('Chọn ngày làm mốc')}</span>
                  <input
                    aria-label={t('Ngày làm mốc danh sách mua sắm')}
                    type="date"
                    value={shoppingDate}
                    onChange={(event) => setShoppingDate(event.target.value)}
                  />
                </label>
                <button
                  className="button button--outline"
                  onClick={() => window.print()}
                  type="button"
                >
                  {t('In danh sách')}
                </button>
              </div>
              {shoppingQuery.isLoading ? (
                <div className="route-loading" role="status">
                  <span className="button__spinner" aria-hidden="true" />{' '}
                  {t('Đang tổng hợp nguyên liệu…')}
                </div>
              ) : shoppingQuery.isError ? (
                <div className="planner-message planner-message--error" role="alert">
                  {errorMessage(shoppingQuery.error)}
                  <button
                    className="button button--outline"
                    onClick={() => void shoppingQuery.refetch()}
                    type="button"
                  >
                    {t('Thử lại')}
                  </button>
                </div>
              ) : shoppingQuery.data?.recipe_count ? (
                <>
                  <section className="planner-shopping__dishes">
                    <h3>{t('Món trong kế hoạch')}</h3>
                    <div>
                      {shoppingQuery.data.dishes.map((dish, index) => (
                        <article key={`${dish.plan_date}:${dish.meal_type}:${dish.slug}:${index}`}>
                          <img
                            alt={recipeText(dish.name)}
                            {...dishImage(dish.slug, dish.image_path)}
                          />
                          <div>
                            <strong>{recipeText(dish.name)}</strong>
                            <small>
                              {formatWeekdayDate(parseLocalDate(dish.plan_date), locale)} ·{' '}
                              {t(mealTypes.find((meal) => meal.id === dish.meal_type)?.label ?? '')}{' '}
                              · {t('{count} khẩu phần', { count: dish.servings })}
                            </small>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                  <div className="planner-shopping__groups">
                    {(
                      [
                        { id: 'ingredient', title: 'Nguyên liệu', icon: 'leaf' as const },
                        { id: 'seasoning', title: 'Gia vị', icon: 'sparkles' as const },
                      ] as const
                    ).map((group) => {
                      const groupItems = shoppingQuery.data.items.filter(
                        (ingredient) => ingredient.category === group.id,
                      );
                      return (
                        <section className="planner-shopping__group" key={group.id}>
                          <header>
                            <span>
                              <AppIcon name={group.icon} size={18} />
                            </span>
                            <div>
                              <h3>{t(group.title)}</h3>
                              <small>
                                {t('{count} mục cần chuẩn bị', { count: groupItems.length })}
                              </small>
                            </div>
                          </header>
                          {groupItems.length ? (
                            <ul className="planner-shopping__list">
                              {groupItems.map((ingredient) => (
                                <li
                                  key={`${ingredient.category}:${ingredient.name}:${ingredient.unit}`}
                                >
                                  <input
                                    aria-label={t('Đã mua {name}', {
                                      name: recipeText(ingredient.name),
                                    })}
                                    className="planner-shopping__check"
                                    type="checkbox"
                                  />
                                  <div>
                                    <strong>{recipeText(ingredient.name)}</strong>
                                    <small>
                                      {ingredient.recipe_names.map(recipeText).join(' · ')}
                                    </small>
                                    {ingredient.notes.length ? (
                                      <small className="planner-shopping__note">
                                        {ingredient.notes.map(recipeText).join(' · ')}
                                      </small>
                                    ) : null}
                                  </div>
                                  <span className="planner-shopping__amount">
                                    {formatQuantity(ingredient.amount, ingredient.unit, t, locale)}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="planner-shopping__group-empty">
                              {t('Chưa có {group} trong các món đã chọn.', {
                                group: t(group.title).toLocaleLowerCase(locale),
                              })}
                            </p>
                          )}
                        </section>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="planner-empty-shopping">
                  <AppIcon name="plate" size={24} />
                  <strong>{t('Chưa có nguyên liệu để tổng hợp')}</strong>
                  <span>
                    {t(
                      'Thêm món vào kế hoạch trong khoảng thời gian này, danh sách sẽ tự cập nhật.',
                    )}
                  </span>
                </div>
              )}
            </section>
          ) : null}
        </div>
      </section>

      {detailTarget ? (
        <div
          className="planner-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) closeMealDetail();
          }}
        >
          <section
            aria-labelledby="planner-meal-detail-title"
            aria-modal="true"
            className="planner-dialog planner-meal-panel"
            role="dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeMealDetail();
            }}
          >
            <header className="planner-dialog__header">
              <div>
                <span className="section-label">
                  {formatWeekdayDate(parseLocalDate(detailTarget.date), locale, true)}
                </span>
                <h2 id="planner-meal-detail-title">{t(detailMealLabel)}</h2>
                <p className="planner-meal-panel__meta">
                  {t('{count} món · {servings} khẩu phần', {
                    count: detailItems.length,
                    servings: detailItems.reduce((total, item) => total + item.servings, 0),
                  })}
                  {detailVegetarian ? (
                    <span className="planner-meal-panel__veg">
                      <AppIcon name="leaf" size={12} /> {t('Ngày ăn chay')}
                    </span>
                  ) : null}
                </p>
              </div>
              <button
                aria-label={t('Đóng chi tiết bữa ăn')}
                autoFocus
                className="icon-button"
                onClick={closeMealDetail}
                type="button"
              >
                <AppIcon name="close" size={19} />
              </button>
            </header>
            {removedItem ? (
              <div className="planner-undo planner-meal-panel__undo" role="status">
                <span>
                  {t('Đã xóa {name} khỏi kế hoạch.', { name: recipeText(removedItem.recipe.name) })}
                </span>
                <button onClick={undoRemove} type="button">
                  {t('Hoàn tác')}
                </button>
              </div>
            ) : null}
            {detailItems.length ? (
              <ul className="planner-meal-panel__list">
                {detailItems.map((item) => {
                  const name = recipeText(item.recipe.name);
                  const cooked = item.completion_status === 'completed';
                  return (
                    <li
                      className={`planner-meal-panel__item${cooked ? ' is-cooked' : ''}`}
                      key={item.id}
                    >
                      <Link
                        aria-label={t('Xem chi tiết {name}', { name })}
                        className="planner-dish__link"
                        to={`/recipes/${item.recipe.slug}`}
                      >
                        <img
                          alt={recipeText(item.recipe.image_alt)}
                          {...dishImage(item.recipe.slug, item.recipe.image_path, '72px')}
                        />
                        <span>{name}</span>
                      </Link>
                      {detailReadOnly ? null : (
                        <button
                          aria-label={t('Xóa {name} khỏi kế hoạch', { name })}
                          className="planner-dish__remove"
                          disabled={removeMutation.isPending}
                          onClick={() => removeMutation.mutate(item)}
                          type="button"
                        >
                          <AppIcon name="close" size={14} />
                        </button>
                      )}
                      {detailVegetarian && isNonVegetarianDish(item.recipe.slug) ? (
                        <span className="planner-dish__veg-warning">
                          {t('Không phải món chay')}
                        </span>
                      ) : null}
                      <div className="planner-meal-panel__actions">
                        {detailReadOnly ? (
                          <span className="planner-meal-panel__status">
                            {cooked ? (
                              <>
                                <AppIcon name="check" size={13} /> {t('Đã nấu')}
                              </>
                            ) : (
                              t('Chưa nấu')
                            )}
                          </span>
                        ) : (
                          <button
                            aria-label={
                              cooked
                                ? t('Bỏ đánh dấu đã nấu {name}', { name })
                                : t('Đánh dấu đã nấu {name}', { name })
                            }
                            aria-pressed={cooked}
                            className="planner-dish__cooked"
                            disabled={cookedMutation.isPending}
                            onClick={() => cookedMutation.mutate(item)}
                            type="button"
                          >
                            {cooked ? (
                              <>
                                <AppIcon name="check" size={14} /> {t('Đã nấu')}
                              </>
                            ) : (
                              t('Đánh dấu đã nấu')
                            )}
                          </button>
                        )}
                        <Link
                          aria-label={t('Vào bếp nấu {name}', { name })}
                          className="planner-dish__cook-link"
                          to={cookPath([
                            {
                              slug: item.recipe.slug,
                              servings: item.servings,
                              planItemId: item.id,
                            },
                          ])}
                        >
                          <AppIcon name="chef" size={13} /> {t('Vào bếp')}
                        </Link>
                        {detailReadOnly ? (
                          <span className="planner-meal-panel__status">
                            {t('{count} người', { count: item.servings })}
                          </span>
                        ) : (
                          <div
                            aria-label={t('Khẩu phần {name}', { name })}
                            className="planner-servings"
                            role="group"
                          >
                            <button
                              aria-label={t('Giảm khẩu phần {name}', { name })}
                              disabled={item.servings <= 1 || servingsMutation.isPending}
                              onClick={() =>
                                servingsMutation.mutate({ id: item.id, count: item.servings - 1 })
                              }
                              type="button"
                            >
                              <AppIcon name="minus" size={13} />
                            </button>
                            <span>{t('{count} người', { count: item.servings })}</span>
                            <button
                              aria-label={t('Tăng khẩu phần {name}', { name })}
                              disabled={item.servings >= 30 || servingsMutation.isPending}
                              onClick={() =>
                                servingsMutation.mutate({ id: item.id, count: item.servings + 1 })
                              }
                              type="button"
                            >
                              <AppIcon name="plus" size={13} />
                            </button>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="planner-no-results">{t('Bữa này chưa có món nào.')}</p>
            )}
            {servingsMutation.isError || removeMutation.isError || cookedMutation.isError ? (
              <p className="planner-inline-error" role="alert">
                {errorMessage(
                  servingsMutation.error ?? removeMutation.error ?? cookedMutation.error,
                )}
              </p>
            ) : null}
            <footer className="planner-dialog__footer planner-meal-panel__footer">
              {detailItems.length > 1 ? (
                <Link className="button button--outline" to={mealCookPath(detailItems)}>
                  <AppIcon name="chef" size={16} /> {t('Vào bếp cả bữa')}
                </Link>
              ) : (
                <span />
              )}
              {detailReadOnly ? (
                <span className="planner-meal-panel__readonly">
                  <AppIcon name="eye" size={14} /> {t('Chế độ xem tổng quan')}
                </span>
              ) : (
                <button
                  className="button button--primary"
                  onClick={addFromMealDetail}
                  type="button"
                >
                  <AppIcon name="plus" size={16} /> {t('Thêm món')}
                </button>
              )}
            </footer>
          </section>
        </div>
      ) : null}
      {addTarget ? (
        <div
          className="planner-dialog-backdrop"
          onClick={(event) => {
            if (event.target === event.currentTarget) setAddTarget(null);
          }}
        >
          <section
            aria-labelledby="planner-add-title"
            aria-modal="true"
            className="planner-dialog planner-add-dialog"
            role="dialog"
            onKeyDown={(event) => {
              if (event.key === 'Escape') setAddTarget(null);
            }}
          >
            <header className="planner-dialog__header">
              <div>
                <span className="section-label">{t('Thêm vào lịch')}</span>
                <h2 id="planner-add-title">{t('Chọn món cho bữa ăn')}</h2>
              </div>
              <button
                aria-label={t('Đóng cửa sổ thêm món')}
                className="icon-button"
                onClick={() => setAddTarget(null)}
                type="button"
              >
                <AppIcon name="close" size={19} />
              </button>
            </header>
            <div className="planner-dialog__controls">
              <label>
                <span>{t('Ngày nấu')}</span>
                <input
                  type="date"
                  value={addTarget.date}
                  onChange={(event) => {
                    setVegetarianFilter(null);
                    setVisibleCount(recipeBatchSize);
                    setAddTarget({ ...addTarget, date: event.target.value });
                  }}
                />
                {targetLunar ? (
                  <small className="planner-dialog__lunar">
                    <AppIcon name="moon" size={12} />
                    {t('ÂL {date}', {
                      date: `${numericLunarLabel(targetLunar)} · ${lunarYearName(targetLunar.year)}`,
                    })}
                  </small>
                ) : null}
              </label>
              <label>
                <span>{t('Bữa ăn')}</span>
                <select
                  value={addTarget.mealType}
                  onChange={(event) =>
                    setAddTarget({ ...addTarget, mealType: event.target.value as PlannerMealType })
                  }
                >
                  {mealTypes.map((meal) => (
                    <option key={meal.id} value={meal.id}>
                      {t(meal.label)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t('Khẩu phần')}</span>
                <input
                  max={30}
                  min={1}
                  type="number"
                  value={servings}
                  onChange={(event) =>
                    setServings(Math.max(1, Math.min(30, Number(event.target.value))))
                  }
                />
              </label>
            </div>
            <label className="planner-recipe-search">
              <AppIcon name="search" size={18} />
              <input
                autoFocus
                placeholder={t('Tìm món ăn theo tên hoặc nguyên liệu')}
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setVisibleCount(recipeBatchSize);
                }}
              />
            </label>
            <div className="planner-dialog__veg">
              <button
                aria-pressed={vegetarianOnly}
                className={`planner-veg-filter${vegetarianOnly ? ' is-active' : ''}`}
                onClick={() => {
                  setVegetarianFilter(!vegetarianOnly);
                  setVisibleCount(recipeBatchSize);
                }}
                type="button"
              >
                <AppIcon name="leaf" size={14} /> {t('Chỉ món chay')}
              </button>
              {targetIsVegetarian ? (
                <span className="planner-dialog__veg-note">
                  {t('Ngày ăn chay — danh sách đang ưu tiên món chay.')}
                </span>
              ) : null}
            </div>
            {addMutation.isError ? (
              <p className="planner-inline-error" role="alert">
                {errorMessage(addMutation.error)}
              </p>
            ) : feedback ? (
              <p className="planner-inline-success" role="status">
                <AppIcon name="check" size={15} /> {feedback}
              </p>
            ) : null}
            <div
              aria-label={t('Kết quả tìm món')}
              className="planner-recipe-results"
              onScroll={(event) => showMoreRecipes(event.currentTarget)}
            >
              {dialogRecipes.length ? (
                visibleRecipes.map((recipe) => {
                  const alreadyAdded = plannedItems.some(
                    (item) =>
                      item.plan_date === addTarget.date &&
                      item.meal_type === addTarget.mealType &&
                      item.recipe.slug === recipe.slug,
                  );
                  return (
                    <article key={recipe.slug}>
                      <img
                        alt={recipe.imageAlt}
                        className="dish-cutout"
                        onLoad={(event) => fitDishCutout(event.currentTarget)}
                        src={recipe.image}
                        srcSet={recipe.imageSrcSet}
                      />
                      <div>
                        <strong>{recipe.name}</strong>
                        <span>
                          {t(recipe.category)} · {t(recipe.region)}
                        </span>
                      </div>
                      <button
                        aria-label={
                          selectedSlugs.includes(recipe.slug)
                            ? t('Bỏ chọn {name}', { name: recipe.name })
                            : t('Chọn {name}', { name: recipe.name })
                        }
                        aria-pressed={selectedSlugs.includes(recipe.slug)}
                        className={`button button--outline planner-recipe-select${selectedSlugs.includes(recipe.slug) ? ' is-selected' : ''}`}
                        disabled={alreadyAdded || addMutation.isPending}
                        onClick={() => toggleRecipe(recipe.slug)}
                        type="button"
                      >
                        {alreadyAdded
                          ? t('Đã có')
                          : selectedSlugs.includes(recipe.slug)
                            ? t('Đã chọn')
                            : t('Chọn')}
                      </button>
                    </article>
                  );
                })
              ) : (
                <p className="planner-no-results">
                  {vegetarianOnly && filteredRecipes.length
                    ? t('Chưa có món chay phù hợp. Tắt “Chỉ món chay” để xem tất cả món.')
                    : t('Không tìm thấy món phù hợp với từ khóa này.')}
                </p>
              )}
              {visibleCount < dialogRecipes.length ? (
                <button
                  className="planner-recipe-more"
                  onClick={() => setVisibleCount((count) => count + recipeBatchSize)}
                  type="button"
                >
                  {t('Xem thêm món')}
                </button>
              ) : null}
            </div>
            {/* Thanh lưu luôn hiện ở đáy hộp thoại: chỉ danh sách món cuộn, không phải kéo tới cuối. */}
            <footer className="planner-dialog__footer planner-add-dialog__bar">
              <span aria-live="polite">
                <strong>{t('Đã chọn {count} món', { count: selectedSlugs.length })}</strong> ·{' '}
                {t('{count} món phù hợp', { count: dialogRecipes.length })}
              </span>
              <button
                className="button button--primary"
                disabled={!selectedSlugs.length || addMutation.isPending}
                onClick={submitAdd}
                type="button"
              >
                {addMutation.isPending ? t('Đang lưu…') : t('Lưu bữa ăn')}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
      {celebration ? (
        <MealCelebration
          key="planner-meal-saved"
          message={celebrationMessage || t('Kế hoạch của bạn đã được cập nhật thành công.')}
          onFinish={dismissCelebration}
          title={t('Đã lưu bữa ăn!')}
        />
      ) : null}
    </div>
  );
}

/** Vào bếp cả bữa: nấu các món chưa xong; bữa đã nấu hết thì nấu lại toàn bộ. */
function mealCookPath(items: PlanItem[]) {
  const pending = items.filter((item) => item.completion_status !== 'completed');
  return cookPath(
    (pending.length ? pending : items).map((item) => ({
      slug: item.recipe.slug,
      servings: item.servings,
      planItemId: item.id,
    })),
  );
}
