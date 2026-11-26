import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { CatalogFilters } from '@/components/recipes/CatalogFilters';
import {
  getCookingMethodOptions,
  getIngredientFacetOptions,
  matchesCatalogCategory,
  matchesCookingMethods,
  matchesIngredientFacets,
  defaultCatalogSort,
  sortCatalogRecipes,
  type CatalogFacetOption,
  type CatalogSort,
} from '@/data/recipeCatalogFilters';
import { recipeMinutes } from '@/data/recipes';
import {
  matchesRecipeRegion,
  matchesRecipeSearch,
  useEnglishSearchIndexVersion,
} from '@/data/recipeSearch';
import { dietaryConflicts, useUserPreferences } from '@/features/account/preferences';
import { useAuth } from '@/features/auth/AuthContext';
import { favoriteRecipesQueryKey, type FavoriteRecipe } from '@/features/favorites/favoritesApi';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog, useRecipeCatalogReady } from '@/features/i18n/recipeContent';
import { apiRequest } from '@/lib/api/client';
import './recipes-page.css';

const categories = [
  'Tất cả',
  'Món mặn',
  'Món canh',
  'Món rau',
  'Món chay',
  'Món nước',
  'Món ăn sáng',
  'Món tráng miệng',
  'Món ăn kèm',
  'Món ăn vặt',
];
const sortOptions: { id: CatalogSort; label: string }[] = [
  { id: 'quick', label: 'Nấu nhanh nhất' },
  { id: 'easy', label: 'Dễ nấu trước' },
  { id: 'few-ingredients', label: 'Ít nguyên liệu trước' },
  { id: 'name', label: 'Tên món A–Z' },
];
const regions = ['Tất cả', 'Bắc', 'Trung', 'Nam', 'Ba miền'];

function selectedFacets(params: URLSearchParams, key: string, options: CatalogFacetOption[]) {
  const available = new Set(options.map(({ id }) => id));
  return [...new Set(params.getAll(key).flatMap((value) => value.split(',')))].filter((id) =>
    available.has(id),
  );
}

export function RecipesPage() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const { t, locale } = useI18n();
  const { user, isLoading: authLoading } = useAuth();
  const catalog = useRecipeCatalog();
  const catalogReady = useRecipeCatalogReady();
  const [pageSize, setPageSize] = useState(() => getCatalogPageSize());
  const query = params.get('q') ?? '';
  // Ô nhập giữ giá trị riêng để gõ không bị trễ hay mất ký tự; URL cập nhật sau khi ngừng gõ.
  const [queryDraft, setQueryDraft] = useState({ locationKey: location.key, value: query });
  // Bỏ bản nháp của lịch sử cũ để Back không khôi phục chữ chưa áp dụng.
  if (queryDraft.locationKey !== location.key) {
    setQueryDraft({ locationKey: location.key, value: query });
  }
  const draftQuery = queryDraft.locationKey === location.key ? queryDraft.value : query;
  const setDraftQuery = (value: string) => setQueryDraft({ locationKey: location.key, value });
  const queryTimerRef = useRef<number | undefined>(undefined);
  useEffect(() => {
    // Back/Forward phải hủy từ khóa đang chờ, kể cả khi URL quay về cùng q.
    window.clearTimeout(queryTimerRef.current);
  }, [location.key]);
  useEffect(() => () => window.clearTimeout(queryTimerRef.current), []);
  const requestedCategory = params.get('category') ?? 'Tất cả';
  const category =
    requestedCategory === 'favorites' || categories.includes(requestedCategory)
      ? requestedCategory
      : 'Tất cả';
  const favoritesOnly = category === 'favorites';
  const requestedRegion = params.get('region') ?? 'Tất cả';
  const region = regions.includes(requestedRegion) ? requestedRegion : 'Tất cả';
  const requestedSort = params.get('sort') ?? defaultCatalogSort(query);
  const sort: CatalogSort =
    requestedSort === 'relevant' && query.trim()
      ? 'relevant'
      : (sortOptions.find(({ id }) => id === requestedSort)?.id ?? 'quick');
  const fitMe = params.get('fit') === '1';
  const { isPersonal, preferences } = useUserPreferences();
  const canPersonalize =
    isPersonal && (preferences.dietary_tags.length > 0 || preferences.max_cooking_minutes > 0);
  const resultsRef = useRef<HTMLDivElement>(null);
  const categoriesRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const strip = categoriesRef.current;
    const active = strip?.querySelector<HTMLButtonElement>('[aria-pressed="true"]');
    if (!strip || !active || strip.scrollWidth <= strip.clientWidth) return;
    const stripBounds = strip.getBoundingClientRect();
    const activeBounds = active.getBoundingClientRect();
    if (activeBounds.left < stripBounds.left)
      strip.scrollLeft -= stripBounds.left - activeBounds.left;
    else if (activeBounds.right > stripBounds.right)
      strip.scrollLeft += activeBounds.right - stripBounds.right;
  }, [category]);
  const favoritesQuery = useQuery({
    queryKey: favoriteRecipesQueryKey(user?.id),
    queryFn: ({ signal }) => apiRequest<FavoriteRecipe[]>('/favorites', { signal }),
    enabled: Boolean(user) && favoritesOnly,
  });
  const favoriteSlugs = useMemo(
    () => new Set((favoritesQuery.data ?? []).map(({ slug }) => slug)),
    [favoritesQuery.data],
  );
  const categoryRecipes = useMemo(
    () =>
      catalog.filter((recipe) =>
        favoritesOnly
          ? Boolean(user) && favoriteSlugs.has(recipe.slug)
          : matchesCatalogCategory(recipe, category),
      ),
    [catalog, category, favoriteSlugs, favoritesOnly, user],
  );
  const ingredientOptions = useMemo(
    () => getIngredientFacetOptions(favoritesOnly ? 'Tất cả' : category, categoryRecipes),
    [category, categoryRecipes, favoritesOnly],
  );
  const methodOptions = useMemo(
    () => getCookingMethodOptions(favoritesOnly ? 'Tất cả' : category, categoryRecipes),
    [category, categoryRecipes, favoritesOnly],
  );
  const ingredients = useMemo(
    () => selectedFacets(params, 'ingredients', ingredientOptions),
    [params, ingredientOptions],
  );
  const methods = useMemo(
    () => selectedFacets(params, 'methods', methodOptions),
    [params, methodOptions],
  );

  useEffect(() => {
    const desktop = window.matchMedia?.('(min-width: 960px)');
    const tablet = window.matchMedia?.('(min-width: 680px)');
    const updatePageSize = () => setPageSize(getCatalogPageSize());
    desktop?.addEventListener('change', updatePageSize);
    tablet?.addEventListener('change', updatePageSize);
    return () => {
      desktop?.removeEventListener('change', updatePageSize);
      tablet?.removeEventListener('change', updatePageSize);
    };
  }, []);

  const updateFilters = (updates: Record<string, string>, replace = false) => {
    window.clearTimeout(queryTimerRef.current);
    // Áp dụng cả chữ vừa gõ nếu người dùng chọn tab/lọc trước khi hết debounce.
    const nextUpdates = { q: draftQuery, ...updates };
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('page');
        for (const [key, value] of Object.entries(nextUpdates)) {
          if (value && value !== 'Tất cả') next.set(key, value);
          else next.delete(key);
        }
        // Chỉ bỏ `sort` khỏi URL khi đó là thứ tự mặc định của trạng thái hiện tại.
        if (next.get('sort') === defaultCatalogSort(next.get('q') ?? '')) next.delete('sort');
        return next;
      },
      { replace },
    );
  };
  const toggleFacet = (key: 'ingredients' | 'methods', id: string) => {
    const selected = key === 'ingredients' ? ingredients : methods;
    updateFilters({
      [key]: (selected.includes(id)
        ? selected.filter((value) => value !== id)
        : [...selected, id]
      ).join(','),
    });
  };
  const englishIndexVersion = useEnglishSearchIndexVersion();
  const filtered = useMemo(() => {
    void englishIndexVersion;
    return sortCatalogRecipes(
      categoryRecipes.filter(
        (recipe) =>
          matchesRecipeSearch(recipe, query) &&
          matchesIngredientFacets(recipe, ingredients) &&
          matchesCookingMethods(recipe, methods) &&
          (region === 'Tất cả' || matchesRecipeRegion(recipe, region)) &&
          (!fitMe ||
            !canPersonalize ||
            ((!preferences.max_cooking_minutes ||
              recipeMinutes(recipe) <= preferences.max_cooking_minutes) &&
              dietaryConflicts(recipe, preferences.dietary_tags).length === 0)),
      ),
      sort,
      query,
      locale,
    );
  }, [
    canPersonalize,
    categoryRecipes,
    englishIndexVersion,
    fitMe,
    ingredients,
    locale,
    methods,
    preferences,
    query,
    region,
    sort,
  ]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Math.min(
    pageCount,
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );
  const offset = (page - 1) * pageSize;
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (value) =>
      value === 1 ||
      value === pageCount ||
      value === page ||
      (pageSize >= 8 && Math.abs(value - page) <= 1),
  );
  const filterCount =
    ingredients.length +
    methods.length +
    Number(region !== 'Tất cả') +
    Number(fitMe && canPersonalize);
  const isFullCatalog = !query && category === 'Tất cả' && filterCount === 0;
  const favoritesLoading =
    favoritesOnly && (authLoading || (Boolean(user) && favoritesQuery.isPending));
  const favoritesUnavailable =
    favoritesOnly && (!user || favoritesQuery.isError || favoritesLoading);
  useEffect(() => {
    if (!catalogReady || (favoritesOnly && (!user || favoritesLoading || favoritesQuery.isError)))
      return;

    const availableIngredients = new Set(ingredientOptions.map(({ id }) => id));
    const availableMethods = new Set(methodOptions.map(({ id }) => id));
    const ingredientIds = params.getAll('ingredients').flatMap((value) => value.split(','));
    const methodIds = params.getAll('methods').flatMap((value) => value.split(','));
    const hasUnavailableIngredients = ingredientIds.some(
      (id) => id && !availableIngredients.has(id),
    );
    const hasUnavailableMethods = methodIds.some((id) => id && !availableMethods.has(id));

    if (!hasUnavailableIngredients && !hasUnavailableMethods) return;

    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        let changed = false;
        for (const [key, available] of [
          ['ingredients', availableIngredients],
          ['methods', availableMethods],
        ] as const) {
          const ids = current.getAll(key).flatMap((value) => value.split(','));
          if (!ids.some((id) => id && !available.has(id))) continue;
          const retained = [...new Set(ids.filter((id) => available.has(id)))];
          next.delete(key);
          if (retained.length) next.set(key, retained.join(','));
          changed = true;
        }
        if (changed) next.delete('page');
        return changed ? next : current;
      },
      { replace: true },
    );
  }, [
    favoritesLoading,
    favoritesOnly,
    favoritesQuery.isError,
    ingredientOptions,
    methodOptions,
    params,
    setParams,
    catalogReady,
    user,
  ]);
  // Tiêu đề kết quả phản ánh loại món, vùng miền và tùy chọn cá nhân đang chọn.
  const filterTitle = [
    category !== 'Tất cả' ? t(category) : '',
    region === 'Tất cả'
      ? ''
      : region === 'Ba miền'
        ? t(region)
        : t('Miền {region}', { region: t(region) }),
    fitMe && canPersonalize ? t('Hợp chế độ ăn của tôi') : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const clearFilters = () => updateFilters({ ingredients: '', methods: '', region: '', fit: '' });
  const clearSearchAndFilters = () =>
    updateFilters({
      q: '',
      ingredients: '',
      methods: '',
      region: '',
      fit: '',
      // Chỉ bỏ loại món khi đó là điều kiện duy nhất còn làm danh sách rỗng.
      ...(!query && filterCount === 0 ? { category: '' } : {}),
    });

  const changePage = (nextPage: number) => {
    if (draftQuery !== query) {
      updateFilters({ q: draftQuery });
    } else {
      setParams((current) => {
        const next = new URLSearchParams(current);
        if (nextPage === 1) next.delete('page');
        else next.set('page', String(nextPage));
        return next;
      });
    }
    resultsRef.current?.scrollIntoView?.({
      block: 'start',
      behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
    resultsRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="page-wrap catalog-page-view">
      <section className="page-hero page-hero--recipes">
        <div className="container">
          <span className="section-label">{t('Kho món Việt')}</span>
          <h1>{t('Món ngon cho mỗi bữa nhà')}</h1>
          <p>{t('Lọc theo loại món, nguyên liệu, cách nấu và vùng miền.')}</p>
          <form
            className="catalog-search"
            onSubmit={(event) => {
              event.preventDefault();
              window.clearTimeout(queryTimerRef.current);
              const trimmedQuery = draftQuery.trim();
              setDraftQuery(trimmedQuery);
              updateFilters({ q: trimmedQuery });
            }}
          >
            <SearchField
              actionLabel={t('Tìm kiếm')}
              label={t('Tìm trong kho món')}
              onChange={(value) => {
                setDraftQuery(value);
                window.clearTimeout(queryTimerRef.current);
                queryTimerRef.current = window.setTimeout(
                  () => {
                    updateFilters({ q: value }, true);
                  },
                  value ? 250 : 0,
                );
              }}
              placeholder={t('Tên món, nguyên liệu hoặc hương vị…')}
              value={draftQuery}
            />
          </form>
        </div>
      </section>
      <section className="content-section">
        <div className="container catalog-layout">
          <aside aria-label={t('Loại món')} className="filter-panel">
            <div ref={categoriesRef}>
              <strong>{t('Loại món')}</strong>
              {['Tất cả', 'favorites', ...categories.slice(1)].map((item) => (
                <button
                  aria-pressed={category === item}
                  className={`${category === item ? 'is-active' : ''}${item === 'favorites' ? ' catalog-favorites-tab' : ''}`}
                  key={item}
                  onClick={() => {
                    updateFilters({ category: item, ingredients: '', methods: '' });
                  }}
                  type="button"
                >
                  {item === 'favorites' ? <AppIcon name="heart" size={16} /> : null}
                  {t(item === 'favorites' ? 'Món yêu thích' : item)}
                </button>
              ))}
            </div>
          </aside>
          <div className="catalog-content" ref={resultsRef} tabIndex={-1}>
            <div className="catalog-results">
              <div>
                <span>
                  {favoritesUnavailable
                    ? t('Bộ sưu tập cá nhân')
                    : isFullCatalog
                      ? t('{count} món ăn tại 3 miền Việt Nam', { count: filtered.length })
                      : t('{count} món phù hợp', { count: filtered.length })}
                </span>
                <h2>
                  {favoritesOnly
                    ? t('Món yêu thích của bạn')
                    : query
                      ? [t('Kết quả cho “{query}”', { query }), filterTitle]
                          .filter(Boolean)
                          .join(' · ')
                      : filterTitle || t('Tất cả món ăn')}
                </h2>
              </div>
              <select
                aria-label={t('Sắp xếp')}
                value={sort}
                disabled={favoritesUnavailable}
                onChange={(event) => {
                  updateFilters({ sort: event.target.value });
                }}
              >
                {query.trim() ? <option value="relevant">{t('Khớp từ khóa nhất')}</option> : null}
                {sortOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {t(option.label)}
                  </option>
                ))}
              </select>
            </div>
            {!favoritesUnavailable ? (
              <CatalogFilters
                ingredientOptions={ingredientOptions}
                methodOptions={methodOptions}
                ingredients={ingredients}
                methods={methods}
                region={region}
                fitMe={fitMe}
                canPersonalize={canPersonalize}
                onToggleFacet={toggleFacet}
                onRegionChange={(value) => updateFilters({ region: value })}
                onFitChange={() => updateFilters({ fit: fitMe ? '' : '1' })}
                onClear={clearFilters}
              />
            ) : null}
            {favoritesLoading ? (
              <div className="catalog-collection-state" role="status">
                <span className="button__spinner" aria-hidden="true" />
                <p>{t('Đang tải món yêu thích của bạn…')}</p>
              </div>
            ) : favoritesOnly && !user ? (
              <div className="catalog-collection-state">
                <span className="catalog-collection-state__icon">
                  <AppIcon name="heart" size={28} />
                </span>
                <h3>{t('Đăng nhập để xem món yêu thích')}</h3>
                <p>{t('Những món bạn đã lưu sẽ xuất hiện ở đây, riêng cho tài khoản của bạn.')}</p>
                <Link
                  className="button button--primary"
                  to="/login"
                  state={{ from: `/recipes?${params.toString()}` }}
                >
                  {t('Đăng nhập')}
                </Link>
              </div>
            ) : favoritesOnly && favoritesQuery.isError ? (
              <div className="catalog-collection-state" role="alert">
                <AppIcon name="heart" size={28} />
                <h3>{t('Chưa tải được bộ sưu tập')}</h3>
                <p>{t('Kiểm tra kết nối rồi thử tải lại danh sách món yêu thích.')}</p>
                <button
                  className="button button--outline"
                  onClick={() => void favoritesQuery.refetch()}
                  type="button"
                >
                  {t('Thử lại')}
                </button>
              </div>
            ) : favoritesOnly && categoryRecipes.length === 0 ? (
              <div className="catalog-collection-state">
                <span className="catalog-collection-state__icon">
                  <AppIcon name="heart" size={28} />
                </span>
                <h3>{t('Bộ sưu tập đang chờ món đầu tiên')}</h3>
                <p>{t('Nhấn biểu tượng trái tim trên món ăn để lưu vào tài khoản này.')}</p>
                <button
                  className="button button--outline"
                  onClick={() => updateFilters({ category: '', ingredients: '', methods: '' })}
                  type="button"
                >
                  {t('Khám phá món ăn')}
                </button>
              </div>
            ) : filtered.length ? (
              <div className="recipe-grid recipe-grid--catalog catalog-page" key={page}>
                {filtered.slice(offset, offset + pageSize).map((recipe, index) => (
                  // Ảnh hàng đầu tải ngay; phần còn lại tải lười khi cuộn tới.
                  <RecipeCard eager={index < 3} key={recipe.slug} recipe={recipe} />
                ))}
              </div>
            ) : (
              <div className="empty-state catalog-empty-state">
                <AppIcon name="search" size={36} />
                <h3>{t('Chưa tìm thấy món phù hợp')}</h3>
                <p>{t('Thử một từ khóa ngắn hơn hoặc bỏ bớt bộ lọc.')}</p>
                {filterCount > 0 || query || category !== 'Tất cả' ? (
                  <button
                    className="button button--outline"
                    onClick={clearSearchAndFilters}
                    type="button"
                  >
                    {t(
                      query
                        ? filterCount > 0
                          ? 'Xóa tìm kiếm và bộ lọc'
                          : 'Xóa tìm kiếm'
                        : 'Xóa bộ lọc',
                    )}
                  </button>
                ) : null}
              </div>
            )}
            {!favoritesUnavailable && filtered.length > 0 && (
              <div className="catalog-pagination">
                <p aria-live="polite" role="status">
                  {t('Món {from}–{to} trong {total} món', {
                    from: offset + 1,
                    to: Math.min(offset + pageSize, filtered.length),
                    total: filtered.length,
                  })}
                </p>
                {pageCount > 1 && (
                  <nav aria-label={t('Phân trang món ăn')}>
                    <button
                      className="catalog-pagination__previous"
                      aria-label={t('Trang trước')}
                      disabled={page === 1}
                      onClick={() => changePage(page - 1)}
                      type="button"
                    >
                      <AppIcon name="arrow" size={16} />
                    </button>
                    {pageNumbers.map((value, index) => (
                      <span className="catalog-pagination__item" key={value}>
                        {index > 0 && value - pageNumbers[index - 1]! > 1 && (
                          <span className="catalog-pagination__ellipsis" aria-hidden="true">
                            …
                          </span>
                        )}
                        <button
                          aria-current={value === page ? 'page' : undefined}
                          aria-label={t('Trang {page}', { page: value })}
                          onClick={() => changePage(value)}
                          type="button"
                        >
                          {value}
                        </button>
                      </span>
                    ))}
                    <button
                      aria-label={t('Trang tiếp')}
                      disabled={page === pageCount}
                      onClick={() => changePage(page + 1)}
                      type="button"
                    >
                      <AppIcon name="arrow" size={16} />
                    </button>
                  </nav>
                )}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function getCatalogPageSize() {
  if (window.matchMedia?.('(min-width: 960px)').matches ?? window.innerWidth >= 960) return 12;
  if (window.matchMedia?.('(min-width: 680px)').matches ?? window.innerWidth >= 680) return 8;
  return 6;
}
