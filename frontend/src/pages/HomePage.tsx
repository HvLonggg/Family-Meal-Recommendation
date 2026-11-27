import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { SearchField } from '@/components/common/SearchField';
import { HeroDishShowcase } from '@/components/recipes/HeroDishShowcase';
import { MealCard } from '@/components/recipes/MealCard';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { RecipeSearchSuggestions } from '@/components/recipes/RecipeSearchSuggestions';
import { ShowcaseCarousel } from '@/components/recipes/ShowcaseCarousel';
import {
  createHomeMealSuggestions,
  readRecentHomeMealSuggestionKeys,
  rememberHomeMealSuggestions,
  selectHomeMealSuggestions,
} from '@/data/homeMealSuggestions';
import { seasonalWeight, seasonOf, weightedSeededShuffle } from '@/data/seasonalPicks';
import { useAuth } from '@/features/auth/AuthContext';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';

import './home-page.css';

// Chỉ ghi nhớ vài mâm đầu (phần người dùng thực sự thấy) để lần sau ưu tiên mâm mới.
const REMEMBERED_MEAL_COUNT = 12;

export function HomePage() {
  const [query, setQuery] = useState('');
  // Seed mới mỗi lần vào trang: thứ tự món và mâm cơm luôn khác, không cố định theo ngày.
  const [entrySeed] = useState(() => `${Date.now()}-${Math.random().toString(36).slice(2)}`);
  const [recentMealKeys] = useState(readRecentHomeMealSuggestionKeys);
  const navigate = useNavigate();
  const { t } = useI18n();
  const { user } = useAuth();
  const catalog = useRecipeCatalog();
  // Mùa theo giờ Việt Nam: mâm cơm gợi ý ưu tiên món hợp thời tiết, món trái mùa hiếm gặp.
  const [season] = useState(() => seasonOf(new Date()));
  const mealCandidates = useMemo(
    () => createHomeMealSuggestions(catalog, entrySeed, season),
    [catalog, entrySeed, season],
  );
  // Băng chuyền lặp vô tận trên mọi tổ hợp mâm (mỗi món làm "neo" một mâm), mâm chưa xem đứng trước.
  // Băng chuyền chỉ dựng vài thẻ đang hiện nên danh sách dài không tốn thêm khi render.
  const mealSuggestions = useMemo(
    () =>
      selectHomeMealSuggestions(mealCandidates, entrySeed, recentMealKeys, mealCandidates.length),
    [entrySeed, mealCandidates, recentMealKeys],
  );
  // Toàn bộ kho món, xáo ngẫu nhiên mỗi lần vào trang; món hợp mùa hay đứng trước hơn.
  const featuredRecipes = useMemo(
    () =>
      weightedSeededShuffle(
        catalog,
        `${entrySeed}:${user?.id ?? 'guest'}`,
        (recipe) => recipe.slug,
        (recipe) => seasonalWeight(recipe, season),
      ),
    [catalog, entrySeed, season, user?.id],
  );

  useEffect(() => {
    rememberHomeMealSuggestions(mealSuggestions.slice(0, REMEMBERED_MEAL_COUNT));
  }, [mealSuggestions]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void navigate(`/recipes?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="hero-kicker">
              <AppIcon name="sparkles" size={17} /> {t('Bữa nhà ngon hơn mỗi ngày')}
            </span>
            <h1>
              {t('Cùng Bếp Việt,')}
              <br />
              <em>{t('trọn vị cơm nhà')}</em>
            </h1>
            <p>
              {t(
                'Chọn món quen, ghép mâm cơm đủ vị và chuẩn bị đúng lượng cho cả gia đình — tất cả trong một căn bếp số.',
              )}
            </p>
            <form className="hero-search" onSubmit={submitSearch}>
              <SearchField
                actionLabel={t('Tìm món')}
                label={t('Tìm món ăn')}
                onChange={setQuery}
                placeholder={t('Tìm món ngon cho bữa cơm hôm nay…')}
                value={query}
              />
            </form>
            <RecipeSearchSuggestions />
          </div>
          <div className="home-hero__visual">
            <HeroDishShowcase />
          </div>
        </div>
      </section>

      <section className="quick-paths container" aria-label={t('Lối tắt')}>
        <Link to="/recipes">
          <span className="quick-paths__icon quick-paths__icon--orange">
            <AppIcon name="book" />
          </span>
          <span>
            <strong>{t('Kho món Việt')}</strong>
            <small>{t('Tìm theo vùng, thời gian')}</small>
          </span>
          <AppIcon name="arrow" />
        </Link>
        <Link to="/random-meal">
          <span className="quick-paths__icon quick-paths__icon--green">
            <AppIcon name="chef" />
          </span>
          <span>
            <strong>{t('Vòng quay mâm cơm')}</strong>
            <small>{t('Chọn ngẫu nhiên đủ vị')}</small>
          </span>
          <AppIcon name="arrow" />
        </Link>
        <Link to="/planner">
          <span className="quick-paths__icon quick-paths__icon--yellow">
            <AppIcon name="calendar" />
          </span>
          <span>
            <strong>{t('Kế hoạch tuần')}</strong>
            <small>{t('Chủ động từng bữa')}</small>
          </span>
          <AppIcon name="arrow" />
        </Link>
      </section>

      <section className="content-section home-today" aria-labelledby="home-today-title">
        <div className="container">
          <div className="section-heading home-heading">
            <div className="home-heading__copy">
              <span className="section-label">{t('Món nhà thân thuộc')}</span>
              <h2 id="home-today-title">{t('Hôm nay nấu gì?')}</h2>
              <p>
                {t(
                  'Công thức được chuẩn hóa theo khẩu phần, dễ theo dõi từ sơ chế đến lúc lên mâm.',
                )}
              </p>
            </div>
            <div className="home-heading__actions">
              <Link className="home-action" to="/recipes">
                {t('Xem tất cả')} <AppIcon name="arrow" size={17} />
              </Link>
            </div>
          </div>
        </div>
        {/* Slide món random mỗi lần vào, nút trượt giống "Mâm cơm gợi ý" bên dưới. */}
        <ShowcaseCarousel
          bleed
          getKey={(recipe) => recipe.slug}
          items={featuredRecipes}
          label={t('Món ăn')}
          renderItem={(recipe) => <RecipeCard eager recipe={recipe} />}
        />
      </section>

      <section className="content-section content-section--tint home-meals">
        <div className="container">
          <div className="section-heading home-heading">
            <div className="home-heading__copy">
              <span className="section-label">
                {season === 'cold'
                  ? t('Ấm bụng ngày se lạnh')
                  : season === 'hot'
                    ? t('Thanh mát ngày nắng')
                    : t('Không cần nghĩ nhiều')}
              </span>
              <h2>{t('Mâm cơm gợi ý hôm nay')}</h2>
              <p>{t('Cân bằng món mặn, món canh và rau cho một bữa ăn trọn vẹn.')}</p>
            </div>
            <div className="home-heading__actions">
              <Link className="home-action" to="/meals">
                {t('Xem mọi thực đơn')} <AppIcon name="arrow" size={17} />
              </Link>
            </div>
          </div>
        </div>
        <ShowcaseCarousel
          bleed
          getKey={(meal) => meal.id}
          items={mealSuggestions}
          label={t('Mâm cơm')}
          renderItem={(meal) => <MealCard meal={meal} />}
        />
      </section>

      <section className="story-band">
        <div className="container story-band__inner">
          <div>
            <span className="story-band__author">
              <img
                alt=""
                className="story-band__avatar"
                decoding="async"
                height={44}
                loading="lazy"
                src="/images/brand/bep-viet-logo.png"
                width={44}
              />
              <span className="section-label section-label--light">{t('Góc Bếp Việt')}</span>
            </span>
            <h2>{t('Mỗi bữa cơm là một lần nhà mình gần nhau hơn.')}</h2>
            <p>
              {t(
                'Bếp Việt giúp giữ lại những món quen, đồng thời làm việc chọn món và chuẩn bị bữa ăn nhẹ nhàng hơn.',
              )}
            </p>
          </div>
          <Link className="button button--cream" to="/articles">
            {t('Đọc chuyện căn bếp')} <AppIcon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
