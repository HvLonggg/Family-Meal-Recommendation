import { useMemo, useState } from 'react';
import { Link } from 'react-router';

import { AppIcon, type IconName } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { getNutritionMatches, type NutritionNeedId } from '@/data/nutritionRecommendations';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';

interface Need {
  id: NutritionNeedId;
  name: string;
  icon: IconName;
  text: string;
}

const needs: Need[] = [
  {
    id: 'balanced',
    name: 'Bữa ăn cân bằng',
    icon: 'balance',
    text: 'Đủ đạm, rau, canh và tinh bột.',
  },
  {
    id: 'light',
    name: 'Nhẹ bụng',
    icon: 'leaf',
    text: 'Canh, rau xanh, ít dầu, vị thanh.',
  },
  {
    id: 'family',
    name: 'Dễ ăn cho cả nhà',
    icon: 'users',
    text: 'Vị dịu, không cay nồng.',
  },
];

export function NutritionPage() {
  const { t } = useI18n();
  const catalog = useRecipeCatalog();
  const [activeId, setActiveId] = useState(needs[0]!.id);
  const active = needs.find((need) => need.id === activeId) ?? needs[0]!;
  const matches = useMemo(
    () => getNutritionMatches(catalog, active.id).slice(0, 8),
    [active.id, catalog],
  );

  return (
    <div className="page-wrap explore-page">
      <section className="page-hero page-hero--nutrition">
        <div className="container">
          <span className="section-label">{t('Nhu cầu dinh dưỡng')}</span>
          <h1>{t('Ăn ngon và cân bằng hơn mỗi ngày')}</h1>
          <p>{t('Chọn mục tiêu bữa ăn để xem món phù hợp.')}</p>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="need-grid">
            {needs.map((need) => (
              <button
                aria-pressed={active.id === need.id}
                className={active.id === need.id ? 'is-active' : ''}
                key={need.id}
                onClick={() => setActiveId(need.id)}
                type="button"
              >
                <span>
                  <AppIcon name={need.icon} size={24} />
                </span>
                <strong>{t(need.name)}</strong>
                <small>{t(need.text)}</small>
              </button>
            ))}
          </div>
          <div className="nutrition-note">
            <AppIcon name="sparkles" />
            <p>
              {t('Gợi ý tham khảo, không thay thế tư vấn dinh dưỡng hoặc y khoa.')}{' '}
              {/* Món nhanh, dễ nấu đã có ở Gợi ý món; không lặp lại ở đây. */}
              <Link to="/suggestions">{t('Cần món nhanh hoặc dễ nấu? Xem Gợi ý món')}</Link>
            </p>
          </div>
        </div>
      </section>
      <section className="content-section content-section--tint">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">{t('Đang xem')}</span>
              <h2>{t(active.name)}</h2>
            </div>
          </div>
          <div className="recipe-grid">
            {matches.map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
