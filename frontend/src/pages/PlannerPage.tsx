import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { MealCelebration } from '@/components/recipes/MealCelebration';
import { matchesRecipeSearch, recipeSearchRank } from '@/data/recipeSearch';
import { recipes } from '@/data/recipes';
import {
  addPlanMeal,
  getPlanHistory,
  getPastMealHistory,
  getPlanItems,
  getShoppingList,
  plannerHistoryQueryKey,
  plannerItemsQueryKey,
  plannerMealHistoryQueryKey,
  plannerShoppingQueryKey,
  removePlanItem,
  updatePlanServings,
  updateMealStatus,
  type PlanItem,
  type PlannerMealType,
  type PlannerPeriod,
  type MealCompletionStatus,
} from '@/data/plannerApi';
import { useDefaultServings } from '@/features/account/preferences';
import { useAuth } from '@/features/auth/AuthContext';
import type { Translate } from '@/features/i18n/translate';
import { errorMessage as translateError } from '@/lib/errors';
import { useI18n } from '@/features/i18n/I18nContext';

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
  return new Intl.DateTimeFormat(locale, { day: '2-digit', month: '2-digit' }).format(date);
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
  if (amount === null) return t('vừa đủ {unit}', { unit });
  const value = Number(amount);
  const display = Number.isInteger(value) ? String(value) : value.toLocaleString(locale);
  return `${display} ${unit}`.trim();
}

function planItemKey(item: PlanItem) {
  return `${item.plan_date}:${item.meal_type}`;
}

export function PlannerPage() {
  const { user } = useAuth();
  const { locale, t } = useI18n();
  const errorMessage = (error: unknown) => translateError(error, t);
  const defaultServings = useDefaultServings();
  const [searchParams, setSearchParams] = useSearchParams();
  const sundayFirst = user?.preferences?.week_start === 'sunday';
  const weekStartOf = (date: Date) => startOfWeek(date, sundayFirst);
  const queryClient = useQueryClient();
  const [weekStart, setWeekStart] = useState(() => weekStartOf(new Date()));
  const [activeTab, setActiveTab] = useState<'week' | 'history'>('week');
  const [addTarget, setAddTarget] = useState<{ date: string; mealType: PlannerMealType } | null>(
    null,
  );
  const [search, setSearch] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [recipePage, setRecipePage] = useState(0);
  const [servings, setServings] = useState(defaultServings);
  const [feedback, setFeedback] = useState('');
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [shoppingPeriod, setShoppingPeriod] = useState<PlannerPeriod>('week');
  const [shoppingDate, setShoppingDate] = useState(() => toDateInputValue(weekStartOf(new Date())));
  const [celebration, setCelebration] = useState(false);
  const [today, setToday] = useState(() => toDateInputValue(new Date()));

  useEffect(() => {
    const refreshToday = () => setToday(toDateInputValue(new Date()));
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
      queryClient.invalidateQueries({ queryKey: ['planner-shopping', user?.id] }),
    ]);

  const addMutation = useMutation({
    mutationFn: addPlanMeal,
    onSuccess: async (result, payload) => {
      setFeedback(
        result.items.length
          ? t('Đã lưu {count} món vào bữa ăn.', { count: result.items.length })
          : t('Các món bạn chọn đã có trong bữa ăn này.'),
      );
      const targetWeek = weekStartOf(parseLocalDate(payload.plan_date));
      if (toDateInputValue(targetWeek) !== weekFrom) setWeekStart(targetWeek);
      await invalidatePlanner();
      setAddTarget(null);
      setSelectedSlugs([]);
      if (result.items.length) setCelebration(true);
    },
  });
  const removeMutation = useMutation({
    mutationFn: removePlanItem,
    onSuccess: invalidatePlanner,
  });
  const servingsMutation = useMutation({
    mutationFn: ({ id, count }: { id: string; count: number }) => updatePlanServings(id, count),
    onSuccess: invalidatePlanner,
  });
  const mealStatusMutation = useMutation({
    mutationFn: updateMealStatus,
    onSuccess: invalidatePlanner,
  });

  const plannedItems = useMemo(() => itemsQuery.data ?? [], [itemsQuery.data]);
  const filteredRecipes = useMemo(
    () =>
      recipes
        .filter((recipe) => matchesRecipeSearch(recipe, search))
        .sort((left, right) => recipeSearchRank(right, search) - recipeSearchRank(left, search)),
    [search],
  );
  const recipePageSize = 8;
  const recipePageCount = Math.max(1, Math.ceil(filteredRecipes.length / recipePageSize));
  const visibleRecipes = filteredRecipes.slice(
    recipePage * recipePageSize,
    (recipePage + 1) * recipePageSize,
  );
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
  const uniqueMeals = new Set(plannedItems.map(planItemKey)).size;
  const totalServings = plannedItems.reduce((total, item) => total + item.servings, 0);

  const openAddDialog = (date: string, mealType: PlannerMealType) => {
    setFeedback('');
    setSearch('');
    setSelectedSlugs([]);
    setRecipePage(0);
    setServings(defaultServings);
    setAddTarget({ date, mealType });
    addMutation.reset();
  };

  const requestedSlug = searchParams.get('add');
  const [handledAddSlug, setHandledAddSlug] = useState<string | null>(null);
  if (requestedSlug && requestedSlug !== handledAddSlug && user) {
    // Mở sẵn hộp thoại khi người dùng bấm “Thêm vào kế hoạch” từ trang công thức.
    setHandledAddSlug(requestedSlug);
    const requestedRecipe = recipes.find((recipe) => recipe.slug === requestedSlug);
    setSearch(requestedRecipe?.name ?? '');
    setSelectedSlugs(requestedRecipe ? [requestedRecipe.slug] : []);
    setRecipePage(0);
    setServings(defaultServings);
    setAddTarget({ date: toDateInputValue(new Date()), mealType: 'dinner' });
  }
  useEffect(() => {
    if (requestedSlug && requestedSlug === handledAddSlug) setSearchParams({}, { replace: true });
  }, [handledAddSlug, requestedSlug, setSearchParams]);

  const submitAdd = () => {
    if (!addTarget) return;
    setFeedback('');
    addMutation.mutate({
      recipe_slugs: selectedSlugs,
      plan_date: addTarget.date,
      meal_type: addTarget.mealType,
      servings,
    });
  };

  const dismissCelebration = useCallback(() => setCelebration(false), []);
  const toggleRecipe = (slug: string) =>
    setSelectedSlugs((current) =>
      current.includes(slug) ? current.filter((selected) => selected !== slug) : [...current, slug],
    );
  const updateStatus = (date: string, mealType: PlannerMealType, status: MealCompletionStatus) =>
    mealStatusMutation.mutate({ plan_date: date, meal_type: mealType, completion_status: status });

  const showShoppingList = () => {
    setShoppingDate(weekFrom);
    setShoppingOpen(true);
    window.setTimeout(
      () => document.querySelector('.planner-shopping')?.scrollIntoView?.({ behavior: 'smooth' }),
      0,
    );
  };

  return (
    <div className="page-wrap planner-page">
      <section className="page-hero page-hero--planner">
        <div className="container">
          <span className="section-label">
            {t('Kế hoạch của {name}', { name: user?.full_name.split(' ').at(-1) ?? '' })}
          </span>
          <h1>{t('Một tuần chủ động, mỗi bữa thảnh thơi')}</h1>
          <p>{t('Lưu món theo từng bữa, xem lại lịch sử và chuẩn bị nguyên liệu vừa đủ.')}</p>
        </div>
      </section>

      <section className="content-section">
        <div className="container planner-dashboard">
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
                  {toDateInputValue(weekStart) === toDateInputValue(weekStartOf(new Date()))
                    ? t('Tuần này')
                    : t('Kế hoạch tuần')}
                </strong>
                <span>
                  {formatRange(weekFrom, weekTo, locale)} · {weekStart.getFullYear()}
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
              {toDateInputValue(weekStart) !== toDateInputValue(weekStartOf(new Date())) ? (
                <button
                  className="button button--outline planner-current-week"
                  onClick={() => setWeekStart(weekStartOf(new Date()))}
                  type="button"
                >
                  {t('Tuần hiện tại')}
                </button>
              ) : null}
            </div>
            <div className="planner-toolbar__actions">
              <button className="button button--outline" onClick={showShoppingList} type="button">
                <AppIcon name="check" size={17} /> {t('Danh sách mua sắm')}
              </button>
              <button
                className="button button--primary"
                onClick={() => openAddDialog(weekFrom, 'lunch')}
                type="button"
              >
                <AppIcon name="plus" size={18} /> {t('Thêm bữa ăn')}
              </button>
            </div>
          </div>

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
              ) : (
                <div aria-label={t('Lịch món ăn trong tuần')} className="planner-week-scroll">
                  <div className="planner-grid planner-grid--personal">
                    {days.map((day) => {
                      const dateValue = toDateInputValue(day);
                      const today = dateValue === toDateInputValue(new Date());
                      return (
                        <article
                          className={`planner-day${today ? ' is-today' : ''}`}
                          key={dateValue}
                        >
                          <header className="planner-day__header">
                            <span>
                              {new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(day)}
                            </span>
                            <strong>{day.getDate()}</strong>
                          </header>
                          <div className="planner-day__meals">
                            {mealTypes.map((meal) => {
                              const slotItems = groupedItems.get(`${dateValue}:${meal.id}`) ?? [];
                              return (
                                <section className="planner-meal" key={meal.id}>
                                  <div className="planner-meal__heading">
                                    <h3>{t(meal.label)}</h3>
                                    <button
                                      aria-label={t('Thêm món vào {meal} {date}', {
                                        meal: t(meal.label).toLocaleLowerCase(locale),
                                        date: dateValue,
                                      })}
                                      className="planner-add-icon"
                                      onClick={() => openAddDialog(dateValue, meal.id)}
                                      type="button"
                                    >
                                      <AppIcon name="plus" size={15} />
                                    </button>
                                  </div>
                                  {slotItems.length ? (
                                    <ul className="planner-dish-list">
                                      {slotItems.map((item) => (
                                        <li className="planner-dish" key={item.id}>
                                          <Link
                                            aria-label={t('Xem chi tiết {name}', {
                                              name: item.recipe.name,
                                            })}
                                            className="planner-dish__link"
                                            to={`/recipes/${item.recipe.slug}`}
                                          >
                                            <img
                                              alt={item.recipe.image_alt}
                                              src={item.recipe.image_path}
                                            />
                                            <span>{item.recipe.name}</span>
                                          </Link>
                                          <div className="planner-dish__footer">
                                            <span>
                                              {t('{count} người', { count: item.servings })}
                                            </span>
                                            <div>
                                              <button
                                                aria-label={t('Giảm khẩu phần {name}', {
                                                  name: item.recipe.name,
                                                })}
                                                disabled={
                                                  item.servings <= 1 || servingsMutation.isPending
                                                }
                                                onClick={() =>
                                                  servingsMutation.mutate({
                                                    id: item.id,
                                                    count: item.servings - 1,
                                                  })
                                                }
                                                type="button"
                                              >
                                                <AppIcon name="minus" size={13} />
                                              </button>
                                              <button
                                                aria-label={t('Tăng khẩu phần {name}', {
                                                  name: item.recipe.name,
                                                })}
                                                disabled={
                                                  item.servings >= 30 || servingsMutation.isPending
                                                }
                                                onClick={() =>
                                                  servingsMutation.mutate({
                                                    id: item.id,
                                                    count: item.servings + 1,
                                                  })
                                                }
                                                type="button"
                                              >
                                                <AppIcon name="plus" size={13} />
                                              </button>
                                              <button
                                                aria-label={t('Xóa {name} khỏi kế hoạch', {
                                                  name: item.recipe.name,
                                                })}
                                                className="planner-dish__remove"
                                                disabled={removeMutation.isPending}
                                                onClick={() => removeMutation.mutate(item.id)}
                                                type="button"
                                              >
                                                <AppIcon name="close" size={13} />
                                              </button>
                                            </div>
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  ) : (
                                    <p className="planner-meal__empty">{t('Chưa có món')}</p>
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
              )}

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
                </div>
                <button className="button button--primary" onClick={showShoppingList} type="button">
                  {t('Tạo danh sách mua sắm')} <AppIcon name="arrow" size={17} />
                </button>
              </div>
              {servingsMutation.isError || removeMutation.isError ? (
                <p className="planner-inline-error" role="alert">
                  {errorMessage(servingsMutation.error ?? removeMutation.error)}
                </p>
              ) : null}
            </>
          ) : (
            <section aria-label={t('Lịch sử kế hoạch món ăn')} className="planner-history">
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
                              {new Intl.DateTimeFormat(locale, { dateStyle: 'full' }).format(
                                parseLocalDate(group.plan_date),
                              )}
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
                              <img alt={item.recipe.image_alt} src={item.recipe.image_path} />
                              <span>{item.recipe.name}</span>
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
                              <img alt="" src={event.image_path} />
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
                                  {event.recipe_name}
                                </strong>
                                <span>
                                  {t(
                                    mealTypes.find((meal) => meal.id === event.meal_type)?.label ??
                                      '',
                                  )}{' '}
                                  ·{' '}
                                  {new Intl.DateTimeFormat(locale, {
                                    dateStyle: 'medium',
                                    timeStyle: 'short',
                                  }).format(new Date(event.occurred_at))}
                                </span>
                                <small>
                                  {t('Ngày kế hoạch {date} · {count} khẩu phần', {
                                    date: new Intl.DateTimeFormat(locale, {
                                      dateStyle: 'medium',
                                    }).format(parseLocalDate(event.plan_date)),
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
                          <img alt={dish.image_alt} src={dish.image_path} />
                          <div>
                            <strong>{dish.name}</strong>
                            <small>
                              {new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(
                                parseLocalDate(dish.plan_date),
                              )}{' '}
                              ·{' '}
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
                                    aria-label={t('Đã mua {name}', { name: ingredient.name })}
                                    className="planner-shopping__check"
                                    type="checkbox"
                                  />
                                  <div>
                                    <strong>{ingredient.name}</strong>
                                    <small>{ingredient.recipe_names.join(' · ')}</small>
                                    {ingredient.notes.length ? (
                                      <small>{ingredient.notes.join(' · ')}</small>
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
            className="planner-dialog"
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
                  onChange={(event) => setAddTarget({ ...addTarget, date: event.target.value })}
                />
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
                  setRecipePage(0);
                }}
              />
            </label>
            {addMutation.isError ? (
              <p className="planner-inline-error" role="alert">
                {errorMessage(addMutation.error)}
              </p>
            ) : feedback ? (
              <p className="planner-inline-success" role="status">
                <AppIcon name="check" size={15} /> {feedback}
              </p>
            ) : null}
            <div aria-label={t('Kết quả tìm món')} className="planner-recipe-results">
              {filteredRecipes.length ? (
                visibleRecipes.map((recipe) => {
                  const alreadyAdded = plannedItems.some(
                    (item) =>
                      item.plan_date === addTarget.date &&
                      item.meal_type === addTarget.mealType &&
                      item.recipe.slug === recipe.slug,
                  );
                  return (
                    <article key={recipe.slug}>
                      <img alt={recipe.imageAlt} src={recipe.image} />
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
                  {t('Không tìm thấy món phù hợp với từ khóa này.')}
                </p>
              )}
            </div>
            {filteredRecipes.length > recipePageSize ? (
              <nav aria-label={t('Phân trang danh sách món')} className="planner-recipe-pagination">
                <span>
                  {t('{count} món phù hợp · Trang {page}/{pages}', {
                    count: filteredRecipes.length,
                    page: recipePage + 1,
                    pages: recipePageCount,
                  })}
                </span>
                <div>
                  <button
                    aria-label={t('Trang món trước')}
                    className="button button--outline"
                    disabled={recipePage === 0}
                    onClick={() => setRecipePage((page) => Math.max(0, page - 1))}
                    type="button"
                  >
                    ‹ {t('Trước')}
                  </button>
                  <button
                    aria-label={t('Trang món tiếp theo')}
                    className="button button--outline"
                    disabled={recipePage + 1 >= recipePageCount}
                    onClick={() => setRecipePage((page) => Math.min(recipePageCount - 1, page + 1))}
                    type="button"
                  >
                    {t('Tiếp')} ›
                  </button>
                </div>
              </nav>
            ) : null}
            <footer className="planner-dialog__footer">
              <span>
                {t('{count} món đã chọn. Bạn có thể chuyển trang để chọn thêm.', {
                  count: selectedSlugs.length,
                })}
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
          message={t('Kế hoạch của bạn đã được cập nhật thành công.')}
          onFinish={dismissCelebration}
          title={t('Đã lưu bữa ăn!')}
        />
      ) : null}
    </div>
  );
}
