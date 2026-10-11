import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { formatMinutes, recipeMinutes, type Recipe } from '@/data/recipes';
import { useAuth } from '@/features/auth/AuthContext';
import { favoriteRecipesQueryKey, type FavoriteRecipe } from '@/features/favorites/favoritesApi';
import { apiPost, apiRequest } from '@/lib/api/client';
import { useI18n } from '@/features/i18n/I18nContext';

export function RecipeCard({ recipe, eager = false }: { recipe: Recipe; eager?: boolean }) {
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
            loading={eager ? 'eager' : 'lazy'}
            sizes="(min-width: 1320px) 390px, (min-width: 960px) 30vw, (min-width: 680px) 45vw, 90vw"
            src={recipe.image}
            srcSet={recipe.imageSrcSet}
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
              void navigate('/login');
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
