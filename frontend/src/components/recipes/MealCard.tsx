import { useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { describeMealComposition } from '@/data/mealComposition';
import { formatMinutes, getMealRecipes, type mealSets } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';

type Meal = (typeof mealSets)[number] & { anchorName?: string };

export function MealCard({ meal, eager = false }: { meal: Meal; eager?: boolean }) {
  const { t } = useI18n();
  const items = getMealRecipes(meal.recipeSlugs);
  const [active, setActive] = useState(0);
  const platterSize = Math.min(items.length, 4);
  const description = items.length ? describeMealComposition(items, t) : t(meal.description);

  return (
    <article className="meal-card">
      <div
        aria-label={t('Mâm cơm gợi ý: {dishes}', {
          dishes: items.map((item) => item.name).join(', '),
        })}
        className="meal-card__platter"
        role="region"
      >
        <div className={`meal-platter meal-platter--${platterSize}`}>
          {items.map((recipe, index) => (
            <Link
              aria-label={t('Xem chi tiết món {name}', { name: recipe.name })}
              className={`meal-platter__dish meal-platter__dish--${platterSize}-${index + 1}${
                index === active ? ' is-active' : ''
              }`}
              key={recipe.slug}
              onFocus={() => setActive(index)}
              onMouseEnter={() => setActive(index)}
              to={`/recipes/${recipe.slug}`}
            >
              <img
                alt={recipe.imageAlt}
                decoding="async"
                loading={eager ? 'eager' : 'lazy'}
                sizes="(min-width: 1320px) 180px, (min-width: 680px) 17vw, 38vw"
                src={recipe.image}
                srcSet={recipe.imageSrcSet}
              />
            </Link>
          ))}
        </div>
        <div className="meal-card__platter-caption">
          <span aria-live="polite" className="meal-card__current-dish">
            {items[active]?.name ?? t('Mâm cơm Bếp Việt')}
          </span>
          <span className="meal-card__count">{t('{count} món', { count: items.length })}</span>
          <div aria-label={t('Chọn món trên mâm')} className="meal-card__dots">
            {items.map((recipe, index) => (
              <button
                aria-label={t('Làm nổi bật {name} trên mâm', { name: recipe.name })}
                aria-pressed={index === active}
                className={index === active ? 'is-active' : ''}
                key={recipe.slug}
                onClick={() => setActive(index)}
                type="button"
              />
            ))}
          </div>
        </div>
      </div>
      <div className="meal-card__body">
        <div className="recipe-card__meta">
          <span>
            <AppIcon name="clock" size={16} /> {formatMinutes(meal.minutes, t)}
          </span>
          <span>
            <AppIcon name="users" size={16} /> {t('{count} người', { count: meal.servings })}
          </span>
          <span>{t('{count} món', { count: items.length })}</span>
        </div>
        <h3>
          {meal.anchorName ? t('Mâm cơm cùng {name}', { name: meal.anchorName }) : t(meal.title)}
        </h3>
        <div className="meal-card__summary">
          <span className="meal-card__summary-label">{t('Gợi ý phối vị')}</span>
          <p>{description}</p>
        </div>
        <Link className="button button--outline" to={`/meals#${meal.id}`}>
          {t('Xem mâm cơm')}
        </Link>
      </div>
    </article>
  );
}
