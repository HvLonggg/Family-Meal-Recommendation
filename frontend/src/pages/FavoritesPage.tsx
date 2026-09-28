import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { useAuth } from '@/features/auth/AuthContext';
import { recipes } from '@/data/recipes';

export function FavoritesPage() {
  const { user } = useAuth();
  return (
    <div className="page-wrap">
      <section className="page-hero">
        <div className="container">
          <span className="section-label">Bộ sưu tập cá nhân</span>
          <h1>Món yêu thích của bạn</h1>
          <p>
            Lưu lại món ngon để lần sau tìm nhanh, ghép mâm và thêm vào kế hoạch chỉ trong một chạm.
          </p>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          {user ? (
            <>
              <div className="section-heading">
                <div>
                  <h2>Món đã lưu gần đây</h2>
                  <p>Khung dữ liệu yêu thích đã sẵn sàng để nối với tài khoản.</p>
                </div>
              </div>
              <div className="recipe-grid">
                {recipes.slice(0, 3).map((recipe) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} />
                ))}
              </div>
            </>
          ) : (
            <div className="signin-prompt">
              <span>
                <AppIcon name="heart" size={30} />
              </span>
              <h2>Đăng nhập để giữ căn bếp của riêng bạn</h2>
              <p>Món đã lưu sẽ được đồng bộ với tài khoản và luôn có sẵn trên mọi thiết bị.</p>
              <div>
                <Link className="button button--primary" to="/dang-nhap">
                  Đăng nhập
                </Link>
                <Link className="button button--outline" to="/dang-ky">
                  Tạo tài khoản
                </Link>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
