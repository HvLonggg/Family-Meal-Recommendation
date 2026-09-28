import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { getRecipe, recipes } from '@/data/recipes';
import { NotFoundPage } from '@/pages/NotFoundPage';

function formatAmount(value: number) {
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
}

export function RecipeDetailPage() {
  const { slug = '' } = useParams();
  const recipe = getRecipe(slug);
  const [servings, setServings] = useState(recipe?.servings ?? 4);
  const related = useMemo(() => recipes.filter((item) => item.slug !== slug).slice(0, 3), [slug]);
  if (!recipe) return <NotFoundPage />;
  const ratio = servings / recipe.servings;

  return (
    <div className="page-wrap recipe-detail">
      <div className="container breadcrumb">
        <Link to="/">Trang chủ</Link>
        <span>/</span>
        <Link to="/mon-an">Món ăn</Link>
        <span>/</span>
        <span>{recipe.name}</span>
      </div>
      <section className="container recipe-detail__hero">
        <div className="recipe-detail__image">
          <img alt={recipe.imageAlt} src={recipe.image} />
          <span className="recipe-detail__source">
            <strong>
              {recipe.imageKind === 'licensed'
                ? 'Ảnh chụp có giấy phép mở'
                : 'Ảnh minh họa của Bếp Việt'}
            </strong>
            {recipe.imageCredit && recipe.imageCreditUrl ? (
              <a href={recipe.imageCreditUrl} rel="noreferrer" target="_blank">
                Ảnh: {recipe.imageCredit} · {recipe.imageLicense}
              </a>
            ) : (
              <span>{recipe.imageCredit}</span>
            )}
          </span>
        </div>
        <div className="recipe-detail__intro">
          <div className="recipe-detail__tags">
            <span>{recipe.region}</span>
            <span>{recipe.category}</span>
          </div>
          <h1>{recipe.name}</h1>
          <p>{recipe.excerpt}</p>
          <div className="recipe-facts">
            <span>
              <AppIcon name="clock" />
              <strong>{recipe.prepMinutes + recipe.cookMinutes} phút</strong>
              <small>Tổng thời gian</small>
            </span>
            <span>
              <AppIcon name="chef" />
              <strong>{recipe.difficulty}</strong>
              <small>Độ khó</small>
            </span>
            <span>
              <AppIcon name="users" />
              <strong>{recipe.servings} người</strong>
              <small>Khẩu phần gốc</small>
            </span>
          </div>
          <div className="recipe-actions">
            <button className="button button--primary" type="button">
              <AppIcon name="heart" size={18} /> Lưu món
            </button>
            <button className="button button--outline" type="button">
              <AppIcon name="calendar" size={18} /> Thêm vào kế hoạch
            </button>
          </div>
          <div className="recipe-reference-note">
            <AppIcon name="external" size={18} />
            <div>
              <strong>Công thức tham khảo: {recipe.sourceName}</strong>
              <span>
                Nội dung đã được Bếp Việt biên soạn lại để dễ nấu tại nhà. Ảnh và nội dung gốc vẫn
                thuộc đơn vị phát hành.
              </span>
              <a href={recipe.sourceUrl} rel="noreferrer" target="_blank">
                Xem công thức và ảnh gốc <AppIcon name="arrow" size={14} />
              </a>
            </div>
          </div>
        </div>
      </section>
      <section className="content-section recipe-detail__content">
        <div className="container detail-grid">
          <article className="ingredients-panel">
            <div className="ingredients-panel__head">
              <div>
                <span className="section-label">Chuẩn bị</span>
                <h2>Nguyên liệu</h2>
              </div>
              <div className="serving-stepper">
                <button
                  aria-label="Giảm khẩu phần"
                  disabled={servings <= 1}
                  onClick={() => setServings((value) => Math.max(1, value - 1))}
                  type="button"
                >
                  <AppIcon name="minus" size={16} />
                </button>
                <strong>
                  {servings}
                  <small> người</small>
                </strong>
                <button
                  aria-label="Tăng khẩu phần"
                  disabled={servings >= 12}
                  onClick={() => setServings((value) => Math.min(12, value + 1))}
                  type="button"
                >
                  <AppIcon name="plus" size={16} />
                </button>
              </div>
            </div>
            {recipe.ingredients.map((group) => (
              <div className="ingredient-group" key={group.group}>
                <h3>{group.group}</h3>
                {group.items.map((item) => (
                  <label key={item.name}>
                    <input type="checkbox" />
                    <span>
                      {item.name}
                      {item.note ? <small> · {item.note}</small> : null}
                    </span>
                    <strong>
                      {item.amount == null
                        ? item.unit
                        : `${formatAmount(item.scalable === false ? item.amount : item.amount * ratio)} ${item.unit}`}
                    </strong>
                  </label>
                ))}
              </div>
            ))}
          </article>
          <aside className="kitchen-note">
            <AppIcon name="sparkles" size={25} />
            <h3>Mách nhỏ của bếp</h3>
            <p>{recipe.tip}</p>
            <div>
              <span>Sơ chế</span>
              <strong>{recipe.prepMinutes} phút</strong>
            </div>
            <div>
              <span>Nấu</span>
              <strong>{recipe.cookMinutes} phút</strong>
            </div>
          </aside>
        </div>
      </section>
      <section className="content-section content-section--tint">
        <div className="container cooking-layout">
          <div>
            <span className="section-label">Từng bước rõ ràng</span>
            <h2>Cách nấu</h2>
            <div className="method-section">
              <h3>Sơ chế</h3>
              {recipe.preparation.map((step, index) => (
                <div className="method-step" key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
            <div className="method-section">
              <h3>Thực hiện</h3>
              {recipe.cooking.map((step, index) => (
                <div className="method-step method-step--cooking" key={step}>
                  <span>{index + 1}</span>
                  <p>{step}</p>
                </div>
              ))}
            </div>
          </div>
          <aside className="serving-card">
            <span className="serving-card__icon">
              <AppIcon name="chef" size={28} />
            </span>
            <span className="section-label">Cách dùng</span>
            <h3>Lên mâm ngon nhất</h3>
            <p>{recipe.serving}</p>
            <a href={recipe.sourceUrl} rel="noreferrer" target="_blank">
              Xem nội dung gốc tại {recipe.sourceName} <AppIcon name="arrow" size={16} />
            </a>
          </aside>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">Nấu tiếp món ngon</span>
              <h2>Có thể bạn cũng thích</h2>
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
