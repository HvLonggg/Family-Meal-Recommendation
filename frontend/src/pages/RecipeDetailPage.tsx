import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { RecipeNarrator } from '@/components/recipes/RecipeNarrator';
import {
  formatMinutes,
  getRecipe,
  ingredientAmount,
  recipeMinutes,
  recipes,
  type Recipe,
} from '@/data/recipes';
import {
  dietaryConflicts,
  dietaryTagLabels,
  useUserPreferences,
} from '@/features/account/preferences';
import { favoriteRecipesQueryKey, type FavoriteRecipe } from '@/features/favorites/favoritesApi';
import { buildRecipeScript } from '@/features/narration/recipeScript';
import { useNarration } from '@/features/narration/useNarration';
import { useRecipeCatalog } from '@/features/i18n/recipeContent';
import { apiDelete, apiPost, apiRequest } from '@/lib/api/client';
import { NotFoundPage } from '@/pages/NotFoundPage';
import { useI18n } from '@/features/i18n/I18nContext';

export function RecipeDetailPage() {
  const { slug = '' } = useParams();
  // Theo dõi danh mục để món hiển thị đổi theo ngôn ngữ đang chọn.
  const recipe = useRecipeCatalog().find((item) => item.slug === slug);
  if (!recipe) return <NotFoundPage />;
  return <RecipeDetails key={slug} recipe={recipe} />;
}

function RecipeDetails({ recipe }: { recipe: Recipe }) {
  const { formatNumber, language, t } = useI18n();
  const { isPersonal, preferences, user } = useUserPreferences();
  const householdServings = isPersonal ? preferences.computed_servings : null;
  // Chỉ lưu giá trị khi người dùng tự chỉnh; còn lại đi theo khẩu phần gia đình (có thể tải sau).
  const [chosenServings, setServings] = useState<number | null>(null);
  const servings = chosenServings ?? householdServings ?? recipe.servings;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const favoritesQuery = useQuery({
    queryKey: favoriteRecipesQueryKey(user?.id),
    queryFn: () => apiRequest<FavoriteRecipe[]>('/favorites'),
    enabled: Boolean(user),
  });
  const isFavorite =
    favoritesQuery.data?.some((favorite) => favorite.slug === recipe.slug) ?? false;
  const toggleFavorite = useMutation({
    mutationFn: () =>
      isFavorite
        ? apiDelete(`/favorites/${encodeURIComponent(recipe.slug)}`)
        : apiPost(`/favorites/${encodeURIComponent(recipe.slug)}`),
    onSettled: () => queryClient.invalidateQueries({ queryKey: favoriteRecipesQueryKey(user?.id) }),
  });
  const conflicts = isPersonal ? dietaryConflicts(recipe, preferences.dietary_tags) : [];
  const formatAmount = (value: number) => formatNumber(value, { maximumFractionDigits: 2 });
  const heroRef = useRef<HTMLElement>(null);
  const related = useMemo(() => {
    const pairings = (recipe.pairingSlugs ?? []).flatMap((slug) => getRecipe(slug) ?? []);
    return [
      ...pairings,
      ...recipes.filter((item) => item.slug !== recipe.slug && !pairings.includes(item)),
    ].slice(0, 3);
  }, [recipe]);
  const narrationScript = useMemo(
    () => buildRecipeScript(recipe, servings, language),
    [language, recipe, servings],
  );
  const narration = useNarration(narrationScript, language);
  const narratingClass = (anchor: string) =>
    narration.current?.anchor === anchor ? ' is-narrating' : '';

  useEffect(() => {
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const scrollToRecipe = () => {
      heroRef.current?.scrollIntoView?.({
        behavior: reducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    };
    const frame = window.requestAnimationFrame?.(scrollToRecipe);
    if (frame === undefined) window.setTimeout(scrollToRecipe, 0);
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame?.(frame);
    };
  }, [recipe.slug]);

  return (
    <div className="page-wrap recipe-detail">
      <div className="container breadcrumb">
        <Link to="/">{t('Trang chủ')}</Link>
        <span>/</span>
        <Link to="/recipes">{t('Món ăn')}</Link>
        <span>/</span>
        <span>{recipe.name}</span>
      </div>
      <section className="container recipe-detail__hero" ref={heroRef}>
        <figure className="recipe-detail__image">
          <img
            alt={recipe.imageAlt}
            decoding="async"
            sizes="(min-width: 1320px) 640px, (min-width: 960px) 55vw, 90vw"
            src={recipe.image}
            srcSet={recipe.imageSrcSet}
          />
          <figcaption className="recipe-detail__source">
            <strong>
              {recipe.imageKind === 'project'
                ? t('Ảnh minh họa của Bếp Việt được biên tập bởi tác giả')
                : recipe.imageKind === 'reference'
                  ? t('Ảnh món tham khảo')
                  : recipe.imageKind === 'licensed'
                    ? t('Ảnh chụp có giấy phép mở')
                    : t('Ảnh minh họa của Bếp Việt')}
            </strong>
            {recipe.imageKind === 'project' ? null : recipe.imageCredit && recipe.imageCreditUrl ? (
              <a href={recipe.imageCreditUrl} rel="noreferrer" target="_blank">
                {t('Ảnh')}: {recipe.imageCredit}
                {recipe.imageLicense ? ` · ${recipe.imageLicense}` : ''}
              </a>
            ) : recipe.imageCredit ? (
              <span>{recipe.imageCredit}</span>
            ) : null}
          </figcaption>
        </figure>
        <div className={`recipe-detail__intro${narratingClass('intro')}`} data-narration="intro">
          <div className="recipe-detail__tags">
            <span>{t(recipe.region)}</span>
            <span>{t(recipe.category)}</span>
          </div>
          <h1>{recipe.name}</h1>
          <p>{recipe.excerpt}</p>
          <div className="recipe-facts">
            <span>
              <AppIcon name="clock" />
              <strong>{formatMinutes(recipeMinutes(recipe), t)}</strong>
              <small>{t('Tổng thời gian')}</small>
            </span>
            <span>
              <AppIcon name="chef" />
              <strong>{t(recipe.difficulty)}</strong>
              <small>{t('Độ khó')}</small>
            </span>
            <span>
              <AppIcon name="users" />
              <strong>{t('{count} người', { count: recipe.servings })}</strong>
              <small>{t('Khẩu phần gốc')}</small>
            </span>
          </div>
          <div className="recipe-actions">
            <button
              aria-pressed={isFavorite}
              className="button button--primary"
              disabled={toggleFavorite.isPending}
              onClick={() => {
                if (!user) {
                  void navigate('/login', { state: { from: `/recipes/${recipe.slug}` } });
                  return;
                }
                toggleFavorite.mutate();
              }}
              type="button"
            >
              <AppIcon name={isFavorite ? 'check' : 'heart'} size={18} />{' '}
              {isFavorite ? t('Đã lưu món') : t('Lưu món')}
            </button>
            <Link
              className="button button--outline"
              to={`/planner?add=${encodeURIComponent(recipe.slug)}`}
            >
              <AppIcon name="calendar" size={18} /> {t('Thêm vào kế hoạch')}
            </Link>
            <RecipeNarrator narration={narration} segments={narrationScript} />
          </div>
          {conflicts.length ? (
            <p className="diet-warning" role="note">
              <AppIcon name="leaf" size={18} />
              <span>
                {t('Lưu ý theo chế độ ăn của bạn: món này có thể không phù hợp ({tags}).', {
                  tags: conflicts.map((tag) => t(dietaryTagLabels[tag])).join(', '),
                })}
              </span>
            </p>
          ) : null}
          <div className="recipe-reference-note">
            <AppIcon name="chef" size={18} />
            <div>
              <strong>{t('Bếp Việt biên soạn')}</strong>
              <span>
                {t(
                  'Hướng dẫn nấu tại nhà với nguyên liệu rõ ràng, các bước dễ theo dõi và gợi ý lên mâm.',
                )}
              </span>
            </div>
          </div>
        </div>
      </section>
      <section className="content-section recipe-detail__content">
        <div className="container detail-grid">
          <article
            className={`ingredients-panel${narratingClass('ingredients')}`}
            data-narration="ingredients"
          >
            <div className="ingredients-panel__head">
              <div>
                <span className="section-label">{t('Chuẩn bị')}</span>
                <h2>{t('Nguyên liệu')}</h2>
              </div>
              <div className="serving-stepper">
                <button
                  aria-label={t('Giảm khẩu phần')}
                  disabled={servings <= 1}
                  onClick={() => setServings(Math.max(1, servings - 1))}
                  type="button"
                >
                  <AppIcon name="minus" size={16} />
                </button>
                <strong>
                  {servings}
                  <small> {t('người')}</small>
                </strong>
                <button
                  aria-label={t('Tăng khẩu phần')}
                  disabled={servings >= 12}
                  onClick={() => setServings(Math.min(12, servings + 1))}
                  type="button"
                >
                  <AppIcon name="plus" size={16} />
                </button>
              </div>
            </div>
            {householdServings ? (
              <p className="household-hint">
                <AppIcon name="users" size={15} />
                {servings === householdServings
                  ? t('Đã tự điều chỉnh theo gia đình bạn ({count} suất).', {
                      count: householdServings,
                    })
                  : t('Gia đình bạn: {count} suất.', { count: householdServings })}{' '}
                {servings !== householdServings ? (
                  <button onClick={() => setServings(householdServings)} type="button">
                    {t('Dùng khẩu phần gia đình')}
                  </button>
                ) : servings !== recipe.servings ? (
                  <button onClick={() => setServings(recipe.servings)} type="button">
                    {t('Xem khẩu phần gốc')}
                  </button>
                ) : null}
              </p>
            ) : null}
            {recipe.servingBasis && <p className="recipe-serving-basis">{recipe.servingBasis}</p>}
            {recipe.ingredients.map((group) => (
              <div className="ingredient-group" key={group.group}>
                <h3>{t(group.group)}</h3>
                {group.items.map((item) => (
                  <label key={`${group.group}:${item.name}`}>
                    <input type="checkbox" />
                    <span>
                      {item.name}
                      {item.note ? <small> · {item.note}</small> : null}
                    </span>
                    <strong>
                      {item.amount == null
                        ? item.unit
                        : `${formatAmount(ingredientAmount(item, recipe, servings)!)} ${item.unit}`}
                    </strong>
                  </label>
                ))}
              </div>
            ))}
            <p className="recipe-scaling-note">
              {t(
                'Gia vị là lượng nêm khởi điểm; nếm lại sau khi món chín. Khi tăng khẩu phần, chia mẻ nếu cần và giữ thời gian nấu theo độ chín của nguyên liệu.',
              )}
            </p>
          </article>
          <aside className={`kitchen-note${narratingClass('tips')}`} data-narration="tips">
            <AppIcon name="sparkles" size={25} />
            <h3>{t('Mách nhỏ của bếp')}</h3>
            <ul className="recipe-tip-list">
              {(recipe.tips ?? [recipe.tip]).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
            <div>
              <span>{t('Sơ chế')}</span>
              <strong>{formatMinutes(recipe.prepMinutes, t)}</strong>
            </div>
            <div>
              <span>{t('Nấu')}</span>
              <strong>{formatMinutes(recipe.cookMinutes, t)}</strong>
            </div>
            {!!recipe.passiveMinutes && (
              <div>
                <span>{t('Ướp, ngâm hoặc chờ')}</span>
                <strong>{formatMinutes(recipe.passiveMinutes, t)}</strong>
              </div>
            )}
          </aside>
        </div>
      </section>
      <section className="content-section content-section--tint">
        <div className="container cooking-layout">
          <div>
            <span className="section-label">{t('Từng bước rõ ràng')}</span>
            <h2>{t('Cách nấu')}</h2>
            <div className="method-section">
              <h3>{t('Sơ chế')}</h3>
              {recipe.preparation.map((step, index) => (
                <div
                  className={`method-step${narratingClass(`preparation-${index}`)}`}
                  data-narration={`preparation-${index}`}
                  key={step}
                >
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
            <div className="method-section">
              <h3>{t('Thực hiện')}</h3>
              {recipe.cooking.map((step, index) => (
                <div
                  className={`method-step method-step--cooking${narratingClass(`cooking-${index}`)}`}
                  data-narration={`cooking-${index}`}
                  key={step}
                >
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
            {recipe.finishedDish && (
              <div
                className={`finished-dish${narratingClass('finished')}`}
                data-narration="finished"
              >
                <AppIcon name="check" size={22} />
                <div>
                  <h3>{t('Thành phẩm đạt chuẩn')}</h3>
                  <p>{recipe.finishedDish}</p>
                </div>
              </div>
            )}
          </div>
          <aside className={`serving-card${narratingClass('serving')}`} data-narration="serving">
            <span className="serving-card__icon">
              <AppIcon name="chef" size={28} />
            </span>
            <span className="section-label">{t('Cách dùng')}</span>
            <h3>{t('Lên mâm ngon nhất')}</h3>
            <p>{recipe.serving}</p>
            <div className="serving-card__signature">
              <AppIcon name="chef" size={16} />
              <span>{t('Gợi ý từ Bếp Việt')}</span>
            </div>
          </aside>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">{t('Nấu tiếp món ngon')}</span>
              <h2>{t('Có thể bạn cũng thích')}</h2>
            </div>
          </div>
          <div className="recipe-grid">
            {related.map((item) => (
              <RecipeCard key={item.slug} recipe={item} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
