import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { recipeMinutes, recipes } from '@/data/recipes';
import { matchesRecipeSearch, recipeSearchRank } from '@/data/recipeSearch';
import { dietaryConflicts, useUserPreferences } from '@/features/account/preferences';
import { useI18n } from '@/features/i18n/I18nContext';

export function RecipesPage() {
  const [params, setParams] = useSearchParams();
  const { t } = useI18n();
  const [pageSize, setPageSize] = useState(() => getCatalogPageSize());
  const query = params.get('q') ?? '';
  const category = params.get('category') ?? 'Tất cả';
  const region = params.get('region') ?? 'Tất cả';
  const sort = params.get('sort') ?? 'relevant';
  const fitMe = params.get('fit') === '1';
  const { isPersonal, preferences } = useUserPreferences();
  const canPersonalize =
    isPersonal && (preferences.dietary_tags.length > 0 || preferences.max_cooking_minutes > 0);
  const resultsRef = useRef<HTMLDivElement>(null);

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
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('page');
        for (const [key, value] of Object.entries(updates)) {
          if (value && value !== 'Tất cả' && value !== 'relevant') next.set(key, value);
          else next.delete(key);
        }
        return next;
      },
      { replace },
    );
  };
  const filtered = useMemo(
    () =>
      recipes
        .filter(
          (recipe) =>
            matchesRecipeSearch(recipe, query) &&
            (category === 'Tất cả' ||
              recipe.category === category ||
              (category === 'Món chay' && recipe.tags.includes('Món chay'))) &&
            (region === 'Tất cả' || recipe.region === region || recipe.regions?.includes(region)) &&
            (!fitMe ||
              !canPersonalize ||
              ((!preferences.max_cooking_minutes ||
                recipeMinutes(recipe) <= preferences.max_cooking_minutes) &&
                dietaryConflicts(recipe, preferences.dietary_tags).length === 0)),
        )
        .sort((a, b) =>
          sort === 'quick'
            ? recipeMinutes(a) - recipeMinutes(b)
            : sort === 'name'
              ? a.name.localeCompare(b.name, 'vi')
              : recipeSearchRank(b, query) - recipeSearchRank(a, query),
        ),
    [canPersonalize, category, fitMe, preferences, query, region, sort],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const requestedPage = Number(params.get('page') ?? 1);
  const page = Math.min(
    pageCount,
    Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1,
  );
  const offset = (page - 1) * pageSize;
  const pageNumbers = Array.from({ length: pageCount }, (_, index) => index + 1).filter(
    (value) => value === 1 || value === pageCount || Math.abs(value - page) <= 1,
  );

  const changePage = (nextPage: number) => {
    setParams((current) => {
      const next = new URLSearchParams(current);
      if (nextPage === 1) next.delete('page');
      else next.set('page', String(nextPage));
      return next;
    });
    resultsRef.current?.scrollIntoView?.({ block: 'start', behavior: 'smooth' });
  };

  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--recipes">
        <div className="container">
          <span className="section-label">{t('Kho món Việt')}</span>
          <h1>{t('Món ngon cho mỗi bữa nhà')}</h1>
          <p>{t('Tìm công thức theo loại món, vùng miền và thời gian bạn có.')}</p>
          <form
            className="catalog-search"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmedQuery = query.trim();
              updateFilters({ q: trimmedQuery });
            }}
          >
            <SearchField
              actionLabel={t('Tìm kiếm')}
              label={t('Tìm trong kho món')}
              onChange={(value) => {
                updateFilters({ q: value }, true);
              }}
              placeholder={t('Tên món, nguyên liệu hoặc hương vị…')}
              value={query}
            />
          </form>
        </div>
      </section>
      <section className="content-section">
        <div className="container catalog-layout">
          <aside className="filter-panel">
            {canPersonalize ? (
              <div>
                <strong>{t('Cá nhân hóa')}</strong>
                <button
                  aria-pressed={fitMe}
                  className={fitMe ? 'is-active' : ''}
                  onClick={() => updateFilters({ fit: fitMe ? '' : '1' })}
                  type="button"
                >
                  {t('Hợp chế độ ăn của tôi')}
                </button>
              </div>
            ) : null}
            <div>
              <strong>{t('Loại món')}</strong>
              {[
                'Tất cả',
                'Món mặn',
                'Món canh',
                'Món rau',
                'Món chay',
                'Món nước',
                'Món ăn sáng',
                'Món tráng miệng',
                'Món ăn kèm',
              ].map((item) => (
                <button
                  className={category === item ? 'is-active' : ''}
                  key={item}
                  onClick={() => {
                    updateFilters({ category: item });
                  }}
                  type="button"
                >
                  {t(item)}
                </button>
              ))}
            </div>
            <div>
              <strong>{t('Vùng miền')}</strong>
              {['Tất cả', 'Bắc', 'Trung', 'Nam', 'Ba miền'].map((item) => (
                <button
                  className={region === item ? 'is-active' : ''}
                  key={item}
                  onClick={() => {
                    updateFilters({ region: item });
                  }}
                  type="button"
                >
                  {t(item)}
                </button>
              ))}
            </div>
          </aside>
          <div className="catalog-content" ref={resultsRef}>
            <div className="catalog-results">
              <div>
                <span>{t('{count} công thức', { count: filtered.length })}</span>
                <h2>{query ? t('Kết quả cho “{query}”', { query }) : t('Tất cả món ăn')}</h2>
              </div>
              <select
                aria-label={t('Sắp xếp')}
                value={sort}
                onChange={(event) => {
                  updateFilters({ sort: event.target.value });
                }}
              >
                <option value="relevant">{t('Phù hợp nhất')}</option>
                <option value="quick">{t('Nấu nhanh nhất')}</option>
                <option value="name">{t('Tên món A–Z')}</option>
              </select>
            </div>
            {filtered.length ? (
              <div className="recipe-grid recipe-grid--catalog catalog-page" key={page}>
                {filtered.slice(offset, offset + pageSize).map((recipe) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <AppIcon name="search" size={36} />
                <h3>{t('Chưa tìm thấy món phù hợp')}</h3>
                <p>{t('Thử một từ khóa ngắn hơn hoặc bỏ bớt bộ lọc.')}</p>
              </div>
            )}
            {filtered.length > 0 && (
              <div className="catalog-pagination">
                <p aria-live="polite" role="status">
                  {t('Món {from}–{to} trong {total} công thức', {
                    from: offset + 1,
                    to: Math.min(offset + pageSize, filtered.length),
                    total: filtered.length,
                  })}
                </p>
                {pageCount > 1 && (
                  <nav aria-label={t('Phân trang món ăn')}>
                    <button
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
  if (window.matchMedia?.('(min-width: 960px)').matches ?? window.innerWidth >= 960) return 9;
  if (window.matchMedia?.('(min-width: 680px)').matches ?? window.innerWidth >= 680) return 6;
  return 3;
}
