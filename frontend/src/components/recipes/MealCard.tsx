import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { describeHomeMeal, resolveHomeMealRecipes } from '@/data/homeMealPresentation';
import { getMealRole } from '@/data/mealComposition';
import { formatMinutes, recipeMinutes, type mealSets } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';
import { fitDishPlate, guessDishPlateKind } from '@/components/recipes/dishPlate';
import './MealCard.css';

type Meal = (typeof mealSets)[number] & { anchorName?: string };

export function MealCard({ meal, eager = false }: { meal: Meal; eager?: boolean }) {
  const { t, locale } = useI18n();
  const catalog = useRecipeCatalog();
  const items = useMemo(
    () => resolveHomeMealRecipes(meal.recipeSlugs, catalog),
    [catalog, meal.recipeSlugs],
  );
  const platterItems = useMemo(() => {
    const roleOrder = { main: 0, soup: 1, vegetable: 2, other: 3 };
    return [...items].sort(
      (left, right) => roleOrder[getMealRole(left)] - roleOrder[getMealRole(right)],
    );
  }, [items]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const activeRecipe = platterItems.find((recipe) => recipe.slug === activeSlug) ?? platterItems[0];
  // Mâm cơm luôn được gọi theo món chính, không theo món canh/rau dùng để ghép mâm.
  const anchor = platterItems.find((recipe) => getMealRole(recipe) === 'main') ?? platterItems[0];
  const description = describeHomeMeal(platterItems, t, locale);

  if (!activeRecipe || !anchor) return null;

  const platterSize = platterItems.length;
  const minutes = Math.max(...platterItems.map(recipeMinutes));

  return (
    <article className="meal-card meal-card--home">
      <div
        aria-label={t('Mâm cơm gợi ý: {dishes}', {
          dishes: new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' }).format(
            platterItems.map((item) => item.name),
          ),
        })}
        className="meal-card__platter"
        role="region"
      >
        <div
          className={`meal-platter meal-platter--${platterSize}${platterSize > 4 ? ' meal-platter--many' : ''}`}
        >
          {platterItems.map((recipe, index) => (
            <Link
              aria-label={t('Xem chi tiết món {name}', { name: recipe.name })}
              className={`meal-platter__dish meal-platter__dish--${platterSize}-${index + 1} dish-plate${
                recipe.slug === activeRecipe.slug ? ' is-active' : ''
              }`}
              data-dish-kind={guessDishPlateKind(recipe.slug, recipe.image)}
              key={recipe.slug}
              onFocus={() => setActiveSlug(recipe.slug)}
              onMouseEnter={() => setActiveSlug(recipe.slug)}
              to={`/recipes/${recipe.slug}`}
            >
              <img
                alt={recipe.imageAlt}
                className="dish-plate__img"
                decoding="async"
                onLoad={fitDishPlate}
                loading={eager ? 'eager' : 'lazy'}
                sizes="(min-width: 1320px) 180px, (min-width: 680px) 17vw, 38vw"
                src={recipe.image}
                srcSet={recipe.imageSrcSet}
              />
            </Link>
          ))}
        </div>
        <div className="meal-card__platter-caption">
          <span className="meal-card__current-dish">{activeRecipe.name}</span>
          <span className="meal-card__count">
            {t('{count} món', { count: platterItems.length })}
          </span>
          <div aria-label={t('Chọn món trên mâm')} className="meal-card__dots">
            {platterItems.map((recipe) => (
              <button
                aria-label={t('Làm nổi bật {name} trên mâm', { name: recipe.name })}
                aria-pressed={recipe.slug === activeRecipe.slug}
                className={recipe.slug === activeRecipe.slug ? 'is-active' : ''}
                key={recipe.slug}
                onClick={() => setActiveSlug(recipe.slug)}
                type="button"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="meal-card__body">
        <div className="recipe-card__meta">
          <span>
            <AppIcon name="clock" size={16} />{' '}
            {t('Món lâu nhất: {time}', { time: formatMinutes(minutes, t) })}
          </span>
          <span>
            <AppIcon name="users" size={16} /> {t('{count} người', { count: meal.servings })}
          </span>
        </div>
        <h3>{meal.anchorName ? t('Mâm cơm cùng {name}', { name: anchor.name }) : t(meal.title)}</h3>
        <div className="meal-card__summary">
          <span className="meal-card__summary-label">{t('Gợi ý phối vị')}</span>
          <p>{description}</p>
        </div>
        <Link
          className="button button--outline"
          to={`/meals?anchor=${encodeURIComponent(meal.id)}#${encodeURIComponent(meal.id)}`}
        >
          {t('Xem mâm cơm')}
        </Link>
      </div>
    </article>
  );
}
