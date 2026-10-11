import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { useDefaultServings } from '@/features/account/preferences';
import { formatMinutes, getMealRecipes, mealSets, recipes } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';

export function MealSetsPage() {
  const { t } = useI18n();
  const householdServings = useDefaultServings(0) || null;
  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--meals">
        <div className="container">
          <span className="section-label">{t('Bữa cơm gia đình')}</span>
          <h1>{t('Mâm cơm đủ vị, đỡ phải nghĩ')}</h1>
          <p>
            {t('Gợi ý linh hoạt gồm món mặn, canh và rau; thay món theo khẩu vị của nhà mình.')}
          </p>
        </div>
      </section>
      <section className="meal-random-promo-section">
        <div className="container">
          <div className="meal-random-promo">
            <div className="meal-random-promo__wheel" aria-hidden="true">
              <span>🍲</span>
              <span>🥣</span>
              <span>🥬</span>
              <span>🍉</span>
              <strong>
                <AppIcon name="refresh" size={24} />
              </strong>
            </div>
            <div>
              <span className="section-label section-label--light">
                {t('Không biết hôm nay ăn gì?')}
              </span>
              <h2>{t('Để vòng quay ghép mâm cơm giúp bạn')}</h2>
              <p>
                {t(
                  'Chọn từ 3–6 món theo nhu cầu cân bằng, thanh nhẹ, nhanh gọn hoặc phù hợp cả nhà.',
                )}
              </p>
            </div>
            <Link className="button button--cream" to="/random-meal">
              {t('Thử quay mâm')} <AppIcon name="arrow" size={17} />
            </Link>
          </div>
        </div>
      </section>
      <section className="content-section">
        <div className="container meal-list">
          {mealSets.map((meal, index) => {
            const items = getMealRecipes(meal.recipeSlugs);
            return (
              <article className="meal-plan" id={meal.id} key={meal.id}>
                <div className="meal-plan__visual">
                  <img
                    alt={t('Minh họa {title}', { title: t(meal.title) })}
                    src={items[0]?.image ?? recipes[0]!.image}
                  />
                  <span>{t('Gợi ý {index}', { index: String(index + 1).padStart(2, '0') })}</span>
                </div>
                <div className="meal-plan__body">
                  <div className="recipe-card__meta">
                    <span>
                      <AppIcon name="clock" size={16} /> {formatMinutes(meal.minutes, t)}
                    </span>
                    <span>
                      <AppIcon name="users" size={16} />{' '}
                      {t('{count} người', { count: householdServings ?? meal.servings })}
                    </span>
                  </div>
                  <h2>{t(meal.title)}</h2>
                  <p>{t(meal.description)}</p>
                  <div className="meal-plan__dishes">
                    {items.map((recipe, dishIndex) => (
                      <Link key={recipe.slug} to={`/recipes/${recipe.slug}`}>
                        <span>
                          {t(
                            dishIndex === 0
                              ? 'Món chính'
                              : dishIndex === 1
                                ? 'Món canh'
                                : 'Món rau',
                          )}
                        </span>
                        <strong>{recipe.name}</strong>
                        <AppIcon name="arrow" size={17} />
                      </Link>
                    ))}
                  </div>
                  <div className="meal-plan__actions">
                    <Link
                      className="button button--primary"
                      to={`/planner?add=${encodeURIComponent(meal.recipeSlugs[0] ?? '')}`}
                    >
                      {t('Thêm vào kế hoạch')}
                    </Link>
                    <Link className="button button--outline" to="/random-meal">
                      {t('Đổi món')}
                    </Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
