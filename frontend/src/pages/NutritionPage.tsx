import { useMemo, useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { recipeMinutes, recipes, type Recipe } from '@/data/recipes';
import { useI18n } from '@/features/i18n/I18nContext';

interface Need {
  id: string;
  name: string;
  icon: string;
  text: string;
  matches: (recipe: Recipe) => boolean;
}

const needs: Need[] = [
  {
    id: 'balanced',
    name: 'Bữa ăn cân bằng',
    icon: '🥗',
    text: 'Kết hợp món đạm, rau, canh và tinh bột với khẩu phần vừa đủ.',
    matches: (recipe) => ['Món mặn', 'Món canh', 'Món rau'].includes(recipe.category),
  },
  {
    id: 'light',
    name: 'Nhẹ bụng',
    icon: '🌿',
    text: 'Ưu tiên món canh, rau xanh, cách chế biến ít dầu và vị thanh.',
    matches: (recipe) => ['Món canh', 'Món rau', 'Món chay'].includes(recipe.category),
  },
  {
    id: 'kids',
    name: 'Nấu cho trẻ nhỏ',
    icon: '🍳',
    text: 'Món mềm, màu sắc vui mắt, hương vị dịu và dễ chia phần.',
    matches: (recipe) => recipe.difficulty === 'Dễ' && !['Món ăn kèm'].includes(recipe.category),
  },
  {
    id: 'quick',
    name: 'Bữa ăn nhanh',
    icon: '⏱️',
    text: 'Công thức dưới 30 phút cho ngày bận nhưng vẫn đủ món nhà.',
    matches: (recipe) => recipeMinutes(recipe) <= 30,
  },
];

export function NutritionPage() {
  const { t } = useI18n();
  const [activeId, setActiveId] = useState(needs[0]!.id);
  const active = needs.find((need) => need.id === activeId) ?? needs[0]!;
  const matches = useMemo(() => recipes.filter(active.matches).slice(0, 8), [active]);

  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--nutrition">
        <div className="container">
          <span className="section-label">{t('Nhu cầu dinh dưỡng')}</span>
          <h1>{t('Ăn ngon và cân bằng hơn mỗi ngày')}</h1>
          <p>
            {t('Gợi ý món theo mục tiêu bữa ăn phổ thông, dễ áp dụng cho căn bếp gia đình Việt.')}
          </p>
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
                <span>{need.icon}</span>
                <strong>{t(need.name)}</strong>
                <small>{t(need.text)}</small>
              </button>
            ))}
          </div>
          <div className="nutrition-note">
            <AppIcon name="sparkles" />
            <p>
              <strong>{t('Lưu ý:')}</strong>{' '}
              {t(
                'Gợi ý trên Bếp Việt phục vụ lập kế hoạch bữa ăn thông thường, không thay thế tư vấn dinh dưỡng hoặc chẩn đoán y khoa.',
              )}
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
              <p>
                {t('Những món quen thuộc, nguyên liệu dễ tìm và có thể điều chỉnh theo số người.')}
              </p>
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
