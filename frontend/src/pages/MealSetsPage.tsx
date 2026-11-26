import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { dishImage } from '@/data/dishImages';
import { createHomeMealSuggestions } from '@/data/homeMealSuggestions';
import {
  describeMealComposition,
  getMealRole,
  getMealRoleLabel,
  hasVegetarianMealLabel,
} from '@/data/mealComposition';
import { formatMinutes, getMealRecipes } from '@/data/recipes';
import { useDefaultServings } from '@/features/account/preferences';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';

import './meal-sets-page.css';

function createVisitSeed() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function MealSetsPage() {
  const { t } = useI18n();
  const householdServings = useDefaultServings(0) || null;
  const catalog = useRecipeCatalog();
  const [searchParams] = useSearchParams();
  const requestedMealId = searchParams.get('anchor');
  const [visitSeed, setVisitSeed] = useState(createVisitSeed);
  const [mealFilter, setMealFilter] = useState<'all' | 'vegetarian'>('all');
  const [refreshCount, setRefreshCount] = useState(0);
  const [failedDishImages, setFailedDishImages] = useState<Set<string>>(() => new Set());
  const allSuggestions = useMemo(
    () => createHomeMealSuggestions(catalog, visitSeed),
    [catalog, visitSeed],
  );
  const suggestions = useMemo(() => {
    const eligibleMeals =
      mealFilter === 'vegetarian'
        ? allSuggestions.filter((meal) => {
            const items = getMealRecipes(meal.recipeSlugs);
            return items.length === 3 && items.every(hasVegetarianMealLabel);
          })
        : allSuggestions;
    if (!requestedMealId) return eligibleMeals.slice(0, 6);
    const selected = eligibleMeals.find((meal) => meal.id === requestedMealId);
    if (!selected) return eligibleMeals.slice(0, 6);
    return [selected, ...eligibleMeals.filter((meal) => meal.id !== selected.id).slice(0, 5)];
  }, [allSuggestions, mealFilter, requestedMealId]);
  const scrolledMealId = useRef<string | null>(null);
  useEffect(() => {
    if (!requestedMealId || scrolledMealId.current === requestedMealId) return;
    const target = document.getElementById(requestedMealId);
    if (!target) return;
    scrolledMealId.current = requestedMealId;
    target.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
  }, [requestedMealId, suggestions]);
  const featuredDishes = useMemo(
    () => getMealRecipes(suggestions[0]?.recipeSlugs ?? []).slice(0, 3),
    [suggestions],
  );
  const featuredPositions = ['main', 'soup', 'greens'] as const;

  return (
    <div className="page-wrap meal-sets-page">
      <section className="meal-sets-page__hero">
        <div className="container meal-sets-page__hero-inner">
          <div className="meal-sets-page__hero-copy">
            <span className="section-label">{t('Bữa cơm gia đình')}</span>
            <h1>{t('Mâm cơm đủ vị, đỡ phải nghĩ')}</h1>
            <p>
              {t('Gợi ý linh hoạt gồm món chính, canh và rau; thay món theo khẩu vị của nhà mình.')}
            </p>
            <div className="meal-sets-page__hero-notes" aria-label={t('Điểm nổi bật')}>
              <span>
                <AppIcon name="check" size={15} /> {t('Đủ vị cho bữa cơm nhà')}
              </span>
              <span>
                <AppIcon name="clock" size={15} /> {t('Thời gian rõ ràng')}
              </span>
              <span>
                <AppIcon name="users" size={15} />
                {t('{count} người', { count: String(householdServings ?? 4) })}
              </span>
            </div>
          </div>
          <div className="meal-sets-page__hero-art" aria-hidden="true">
            <span className="meal-sets-page__art-ring" />
            {featuredDishes.map((recipe, index) => {
              const { className: cutoutClassName, ...imageProps } = dishImage(
                recipe.slug,
                recipe.image,
                '120px',
              );

              return (
                <span
                  className={`meal-sets-page__art-dish meal-sets-page__art-dish--${featuredPositions[index] ?? 'main'}`}
                  key={recipe.slug}
                >
                  <img
                    alt=""
                    className={cutoutClassName}
                    decoding="async"
                    loading="eager"
                    {...imageProps}
                  />
                </span>
              );
            })}
            <span className="meal-sets-page__art-center">
              <AppIcon name="sparkles" size={23} />
            </span>
          </div>
        </div>
      </section>

      <section className="meal-sets-page__quick-section" aria-labelledby="meal-sets-quick-title">
        <div className="container">
          <div className="meal-sets-page__quick-card">
            <div className="meal-sets-page__quick-icon" aria-hidden="true">
              <AppIcon name="refresh" size={22} />
            </div>
            <div className="meal-sets-page__quick-copy">
              <span className="section-label section-label--light">
                {t('Không biết hôm nay ăn gì?')}
              </span>
              <h2 id="meal-sets-quick-title">{t('Để vòng quay ghép mâm cơm giúp bạn')}</h2>
              <p>
                {t(
                  'Chọn từ 3–6 món theo nhu cầu cân bằng, thanh nhẹ, nhanh gọn hoặc phù hợp cả nhà.',
                )}
              </p>
            </div>
            <Link className="button button--cream meal-sets-page__quick-action" to="/random-meal">
              {t('Thử quay mâm')} <AppIcon name="arrow" size={17} />
            </Link>
          </div>
        </div>
      </section>

      <section className="meal-sets-page__list-section" aria-labelledby="meal-sets-list-title">
        <div className="container">
          <div className="meal-sets-page__list-heading">
            <div>
              <span className="section-label">{t('Gợi ý hôm nay')}</span>
              <h2 id="meal-sets-list-title">{t('Chọn một mâm hợp với nhà mình')}</h2>
            </div>
            <div className="meal-sets-page__list-controls">
              <button
                aria-label={t('Gợi ý mâm cơm mới')}
                className="button button--outline meal-sets-page__refresh"
                onClick={() => {
                  setVisitSeed(createVisitSeed());
                  setRefreshCount((count) => count + 1);
                }}
                type="button"
              >
                <AppIcon name="refresh" size={16} /> {t('Mâm khác')}
              </button>
            </div>
          </div>

          <div className="meal-sets-page__filter-bar">
            <div aria-label={t('Lọc mâm cơm')} className="meal-sets-page__filters" role="group">
              <button
                aria-pressed={mealFilter === 'all'}
                className={mealFilter === 'all' ? 'is-active' : ''}
                onClick={() => setMealFilter('all')}
                type="button"
              >
                {t('Tất cả mâm')}
              </button>
              <button
                aria-pressed={mealFilter === 'vegetarian'}
                className={mealFilter === 'vegetarian' ? 'is-active' : ''}
                onClick={() => setMealFilter('vegetarian')}
                type="button"
              >
                {t('Mâm chay')}
              </button>
            </div>
          </div>
          <p aria-live="polite" className="meal-sets-page__announcement" role="status">
            {refreshCount > 0
              ? t('Gợi ý mâm cơm mới đã sẵn sàng (lần {count}).', {
                  count: String(refreshCount),
                })
              : ''}
          </p>

          {suggestions.length ? (
            <div className="meal-sets-page__grid">
              {suggestions.map((meal, index) => {
                const items = getMealRecipes(meal.recipeSlugs);
                const leadRecipe = items[0];
                if (!leadRecipe) return null;
                const isVegetarianMeal = items.every(hasVegetarianMealLabel);
                const servings = householdServings ?? meal.servings;
                // Tên mâm theo món chính (tên đã dịch), không theo món canh/rau dùng để ghép.
                const mainRecipe = items.find((recipe) => getMealRole(recipe) === 'main');
                const mealTitle = t('Mâm cơm cùng {name}', {
                  name: (mainRecipe ?? leadRecipe).name,
                });
                const mealDescription = describeMealComposition(items, t);
                const plannerQuery = new URLSearchParams();
                meal.recipeSlugs.forEach((slug) => plannerQuery.append('add', slug));

                return (
                  <article className="meal-sets-page__card" id={meal.id} key={meal.id}>
                    <div className="meal-sets-page__image-wrap">
                      <div
                        aria-label={t('Mâm cơm gợi ý: {dishes}', {
                          dishes: items.map((recipe) => recipe.name).join(', '),
                        })}
                        className={`meal-sets-page__platter meal-sets-page__platter--${Math.min(items.length, 4)}`}
                        role="img"
                      >
                        {items.slice(0, 4).map((recipe, dishIndex) => {
                          const dishClassName = `meal-sets-page__platter-dish meal-sets-page__platter-dish--${Math.min(items.length, 4)}-${dishIndex + 1}`;
                          if (failedDishImages.has(recipe.slug)) {
                            return (
                              <span
                                aria-hidden="true"
                                className={`${dishClassName} meal-sets-page__platter-fallback`}
                                key={recipe.slug}
                              >
                                <AppIcon name="plate" size={24} />
                              </span>
                            );
                          }
                          const { className: cutoutClassName, ...imageProps } = dishImage(
                            recipe.slug,
                            recipe.image,
                            '(min-width: 1200px) 150px, (min-width: 720px) 22vw, 38vw',
                          );

                          return (
                            <img
                              alt=""
                              className={`${cutoutClassName} ${dishClassName}`}
                              decoding="async"
                              key={recipe.slug}
                              loading={index === 0 ? 'eager' : 'lazy'}
                              {...imageProps}
                              onError={() =>
                                setFailedDishImages((current) => new Set(current).add(recipe.slug))
                              }
                            />
                          );
                        })}
                      </div>
                      <span className="meal-sets-page__number">
                        {t('Gợi ý {index}', { index: String(index + 1).padStart(2, '0') })}
                      </span>
                      {isVegetarianMeal ? (
                        <span className="meal-sets-page__diet-badge">{t('Mâm chay')}</span>
                      ) : null}
                      <span className="meal-sets-page__image-caption">
                        <AppIcon name="plate" size={15} />
                        {t('{count} món', { count: String(items.length) })}
                      </span>
                    </div>

                    <div className="meal-sets-page__card-body">
                      <div className="meal-sets-page__meta">
                        <span>
                          <AppIcon name="clock" size={15} />{' '}
                          {t('Món lâu nhất: {time}', { time: formatMinutes(meal.minutes, t) })}
                        </span>
                        <span>
                          <AppIcon name="users" size={15} />
                          {t('{count} người', { count: String(servings) })}
                        </span>
                      </div>
                      <h3>{mealTitle}</h3>
                      <p className="meal-sets-page__description">{mealDescription}</p>

                      <ul className="meal-sets-page__dishes" aria-label={t('Các món trong mâm')}>
                        {items.map((recipe) => (
                          <li key={recipe.slug}>
                            <Link to={`/recipes/${recipe.slug}`}>
                              <span className="meal-sets-page__dish-role">
                                {t(getMealRoleLabel(recipe))}
                              </span>
                              <strong>{recipe.name}</strong>
                              <AppIcon name="arrow" size={15} />
                            </Link>
                          </li>
                        ))}
                      </ul>

                      <div className="meal-sets-page__actions">
                        <Link
                          className="button button--primary"
                          to={`/planner?${plannerQuery.toString()}`}
                        >
                          {t('Thêm cả mâm vào kế hoạch')} <AppIcon name="arrow" size={16} />
                        </Link>
                        <Link className="button button--outline" to="/random-meal">
                          {t('Ghép mâm khác')}
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          ) : (
            <div className="meal-sets-page__empty" role="status">
              <AppIcon name="plate" size={26} />
              <p>
                {mealFilter === 'vegetarian'
                  ? t('Chưa có đủ món chay để ghép thành mâm hoàn chỉnh.')
                  : t('Chưa đủ món đã được phân loại để ghép thành mâm.')}
              </p>
              <Link className="button button--outline" to="/recipes">
                {t('Mở kho món')} <AppIcon name="arrow" size={16} />
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
