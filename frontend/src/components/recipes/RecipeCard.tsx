import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { CatalogSkeletonCard } from '@/components/recipes/CatalogGate';
import { formatMinutes, recipeMinutes, type Recipe } from '@/data/recipes';
import { useAuth } from '@/features/auth/AuthContext';
import { loginHref } from '@/features/auth/landing';
import { favoriteRecipesQueryKey, type FavoriteRecipe } from '@/features/favorites/favoritesApi';
import { apiPost, apiRequest } from '@/lib/api/client';
import { fitDishCutout } from '@/lib/fitDishCutout';
import { useI18n } from '@/features/i18n/I18nContext';
import { useRecipeCatalogReady } from '@/features/i18n/recipeContent';
import './recipe-card-rounded.css';

type RecipeCardProps = { recipe: Recipe; eager?: boolean };

/** Thẻ món; trong lúc kho món còn tải thì hiện thẻ giữ chỗ thay cho vài món đóng gói sẵn. */
export function RecipeCard(props: RecipeCardProps) {
  const ready = useRecipeCatalogReady();
  return ready ? <LoadedRecipeCard {...props} /> : <CatalogSkeletonCard />;
}

function LoadedRecipeCard({ recipe, eager = false }: RecipeCardProps) {
  const { user } = useAuth();
  const { t } = useI18n();
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
    mutationFn: async () => {
      if (isFavorite) {
        await apiRequest<void>(`/favorites/${encodeURIComponent(recipe.slug)}`, {
          method: 'DELETE',
        });
        return;
      }
      await apiPost<FavoriteRecipe>(`/favorites/${encodeURIComponent(recipe.slug)}`);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: favoriteRecipesQueryKey(user?.id) }),
  });

  return (
    <article className="recipe-card">
      <div className="recipe-card__media">
        <Link
          aria-label={t('Xem chi tiết {name}', { name: recipe.name })}
          className="recipe-card__media-link"
          to={`/recipes/${recipe.slug}`}
        >
          <img
            alt={recipe.imageAlt}
            decoding="async"
            fetchPriority={eager ? 'high' : undefined}
            height={400}
            onLoad={(event) => fitDishCutout(event.currentTarget)}
            loading={eager ? 'eager' : 'lazy'}
            sizes="(min-width: 1320px) 390px, (min-width: 960px) 30vw, (min-width: 680px) 45vw, 90vw"
            src={recipe.image}
            srcSet={recipe.imageSrcSet}
            width={568}
          />
          <span className="recipe-card__region">{t(recipe.region)}</span>
        </Link>
        <button
          aria-label={
            isFavorite
              ? t('Bỏ lưu món {name}', { name: recipe.name })
              : t('Lưu món {name}', { name: recipe.name })
          }
          aria-pressed={isFavorite}
          className={`icon-button recipe-card__save${isFavorite ? ' is-saved' : ''}`}
          disabled={toggleFavorite.isPending}
          type="button"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            if (!user) {
              void navigate(loginHref(`${window.location.pathname}${window.location.search}`));
              return;
            }
            toggleFavorite.mutate();
          }}
        >
          <AppIcon name="heart" size={18} />
        </button>
      </div>
      <div className="recipe-card__body">
        <div className="recipe-card__meta">
          <span>
            <AppIcon name="clock" size={16} /> {formatMinutes(recipeMinutes(recipe), t)}
          </span>
          <span>
            <AppIcon name="chef" size={16} /> {t(recipe.difficulty)}
          </span>
        </div>
        <h3>
          <Link to={`/recipes/${recipe.slug}`}>{recipe.name}</Link>
        </h3>
        <p>{recipe.excerpt}</p>
        <Link className="text-link recipe-card__details-link" to={`/recipes/${recipe.slug}`}>
          {t('Xem chi tiết')} <AppIcon name="arrow" size={16} />
        </Link>
      </div>
    </article>
  );
}
