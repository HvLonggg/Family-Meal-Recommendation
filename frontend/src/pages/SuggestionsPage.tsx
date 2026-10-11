import { useState } from 'react';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { recipeMinutes, recipes, type Recipe } from '@/data/recipes';
import { dietaryConflicts, useUserPreferences } from '@/features/account/preferences';
import type { UserPreferences } from '@/features/auth/types';
import { useI18n } from '@/features/i18n/I18nContext';

interface SuggestionOption {
  id: string;
  label: string;
  description: string;
  matches: (recipe: Recipe, preferences: UserPreferences) => boolean;
}

const RESULT_LIMIT = 8;
const vegetableCategories = new Set(['Món rau', 'Món canh', 'Món chay']);

const options: SuggestionOption[] = [
  {
    id: 'mine',
    label: 'Hợp với tôi',
    description: 'Theo chế độ ăn, vùng miền và thời gian bạn đã chọn trong Cài đặt.',
    matches: (recipe, preferences) =>
      dietaryConflicts(recipe, preferences.dietary_tags).length === 0 &&
      (!preferences.max_cooking_minutes ||
        recipeMinutes(recipe) <= preferences.max_cooking_minutes) &&
      (!preferences.preferred_regions.length ||
        preferences.preferred_regions.some(
          (region) => recipe.region === region || recipe.regions?.includes(region),
        )),
  },
  {
    id: 'quick',
    label: 'Dưới 30 phút',
    description: 'Món nấu nhanh cho ngày bận rộn.',
    matches: (recipe) => recipeMinutes(recipe) <= 30,
  },
  {
    id: 'greens',
    label: 'Nhiều rau',
    description: 'Ưu tiên món rau, món canh và món chay thanh nhẹ.',
    matches: (recipe) => vegetableCategories.has(recipe.category),
  },
  {
    id: 'easy',
    label: 'Dễ nấu',
    description: 'Công thức độ khó dễ, ít bước, nguyên liệu quen thuộc.',
    matches: (recipe) => recipe.difficulty === 'Dễ',
  },
  {
    id: 'kids',
    label: 'Trẻ nhỏ thích',
    description: 'Vị dịu, dễ ăn, phù hợp bữa cơm có trẻ nhỏ.',
    matches: (recipe) =>
      recipe.difficulty !== 'Khó' &&
      ['Món mặn', 'Món canh', 'Món ăn sáng', 'Món tráng miệng'].includes(recipe.category) &&
      !recipe.ingredients.some((group) => group.items.some((item) => /ớt|tiêu/i.test(item.name))),
  },
  {
    id: 'weekend',
    label: 'Cuối tuần',
    description: 'Món cầu kỳ hơn khi cả nhà có thời gian quây quần.',
    matches: (recipe) => recipeMinutes(recipe) >= 45 || recipe.difficulty === 'Khó',
  },
];

export function SuggestionsPage() {
  const { t } = useI18n();
  const { isPersonal, preferences } = useUserPreferences();
  const available = isPersonal ? options : options.filter((option) => option.id !== 'mine');
  const [selectedId, setSelectedId] = useState(available[0]!.id);
  const [seed, setSeed] = useState(0);
  const selected = available.find((option) => option.id === selectedId) ?? available[0]!;

  const matched = recipes.filter((recipe) => selected.matches(recipe, preferences));
  const start = matched.length > RESULT_LIMIT ? (seed * RESULT_LIMIT) % matched.length : 0;
  const results = [...matched.slice(start), ...matched.slice(0, start)].slice(0, RESULT_LIMIT);

  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--suggestions">
        <div className="container">
          <span className="section-label">{t('Gợi ý cho nhà mình')}</span>
          <h1>{t('Hôm nay bạn muốn ăn thế nào?')}</h1>
          <p>{t('Chọn một ưu tiên, Bếp Việt sẽ rút gọn những món phù hợp nhất.')}</p>
          <div className="choice-chips">
            {available.map((option) => (
              <button
                aria-pressed={selected.id === option.id}
                className={selected.id === option.id ? 'is-active' : ''}
                key={option.id}
                onClick={() => {
                  setSelectedId(option.id);
                  setSeed(0);
                }}
                type="button"
              >
                {t(option.label)}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">{t('Đề xuất theo lựa chọn')}</span>
              <h2>{t(selected.label)}</h2>
              <p>{t(selected.description)}</p>
            </div>
            <button
              className="button button--outline"
              disabled={results.length < RESULT_LIMIT}
              onClick={() => setSeed((value) => value + 1)}
              type="button"
            >
              <AppIcon name="refresh" size={16} /> {t('Đổi gợi ý khác')}
            </button>
          </div>
          {results.length ? (
            <div className="recipe-grid">
              {results.map((recipe) => (
                <RecipeCard key={recipe.slug} recipe={recipe} />
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <AppIcon name="search" size={36} />
              <h3>{t('Chưa có món phù hợp')}</h3>
              <p>
                {selected.id === 'mine'
                  ? t('Thử nới lỏng thiết lập khẩu vị trong Cài đặt để có thêm gợi ý.')
                  : t('Thử chọn một ưu tiên khác.')}
              </p>
              {selected.id === 'mine' ? (
                <Link className="button button--outline" to="/account/settings#diet">
                  {t('Mở cài đặt khẩu vị')}
                </Link>
              ) : null}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
