import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { getRecipe, type Recipe } from '@/data/recipes';
import { useAuth } from '@/features/auth/AuthContext';
import { favoriteRecipesQueryKey, type FavoriteRecipe } from '@/features/favorites/favoritesApi';
import { apiRequest } from '@/lib/api/client';
import { useI18n } from '@/features/i18n/I18nContext';

export function FavoritesPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const favoritesQuery = useQuery({
    queryKey: favoriteRecipesQueryKey(user?.id),
    queryFn: () => apiRequest<FavoriteRecipe[]>('/favorites'),
    enabled: Boolean(user),
  });
  const favoriteRecipes = (favoritesQuery.data ?? [])
    .map(({ slug }) => getRecipe(slug))
    .filter((recipe): recipe is Recipe => Boolean(recipe));
  return (
    <div className="page-wrap">
      <section className="page-hero">
        <div className="container">
          <span className="section-label">{t('Bộ sưu tập cá nhân')}</span>
          <h1>{t('Món yêu thích của bạn')}</h1>
          <p>
            {t(
              'Lưu lại món ngon để lần sau tìm nhanh, ghép mâm và thêm vào kế hoạch chỉ trong một chạm.',
            )}
          </p>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          {user ? (
            <>
              {favoritesQuery.isLoading ? (
                <div className="route-loading" role="status">
                  <span className="button__spinner" aria-hidden="true" />
                  {t('Đang tải món yêu thích của bạn…')}
                </div>
              ) : favoritesQuery.isError ? (
                <div className="saved-meals-empty" role="alert">
                  <h2>{t('Chưa tải được bộ sưu tập')}</h2>
                  <p>{t('Kiểm tra kết nối rồi thử tải lại danh sách món yêu thích.')}</p>
                  <button
                    className="button button--outline"
                    onClick={() => void favoritesQuery.refetch()}
                    type="button"
                  >
                    {t('Thử lại')}
                  </button>
                </div>
              ) : favoriteRecipes.length ? (
                <>
                  <div className="section-heading">
                    <div>
                      <h2>{t('{count} món đã lưu', { count: favoriteRecipes.length })}</h2>
                      <p>{t('Bộ sưu tập này được lưu riêng cho tài khoản của bạn.')}</p>
                    </div>
                  </div>
                  <div className="recipe-grid">
                    {favoriteRecipes.map((recipe) => (
                      <RecipeCard key={recipe.slug} recipe={recipe} />
                    ))}
                  </div>
                </>
              ) : (
                <div className="signin-prompt">
                  <span>
                    <AppIcon name="heart" size={30} />
                  </span>
                  <h2>{t('Bộ sưu tập đang chờ món đầu tiên')}</h2>
                  <p>{t('Nhấn biểu tượng trái tim trên món ăn để lưu vào tài khoản này.')}</p>
                  <Link className="button button--primary" to="/recipes">
                    {t('Khám phá món ăn')}
                  </Link>
                </div>
              )}
            </>
          ) : (
            <div className="signin-prompt">
              <span>
                <AppIcon name="heart" size={30} />
              </span>
              <h2>{t('Đăng nhập để giữ căn bếp của riêng bạn')}</h2>
              <p>
                {t('Món đã lưu sẽ được đồng bộ với tài khoản và luôn có sẵn trên mọi thiết bị.')}
              </p>
              <div>
                <Link className="button button--primary" to="/login">
                  {t('Đăng nhập')}
                </Link>
                <Link className="button button--outline" to="/register">
                  {t('Tạo tài khoản')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
