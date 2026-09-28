import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { getMealRecipes, mealSets, recipes } from '@/data/recipes';

export function MealSetsPage() {
  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--meals">
        <div className="container">
          <span className="section-label">Bữa cơm gia đình</span>
          <h1>Mâm cơm đủ vị, đỡ phải nghĩ</h1>
          <p>Gợi ý linh hoạt gồm món mặn, canh và rau; thay món theo khẩu vị của nhà mình.</p>
        </div>
      </section>
      <section className="content-section">
        <div className="container meal-list">
          {mealSets.map((meal, index) => {
            const items = getMealRecipes(meal.recipeSlugs);
            return (
              <article className="meal-plan" id={meal.id} key={meal.id}>
                <div className="meal-plan__visual">
                  <img alt={`Minh họa ${meal.title}`} src={items[0]?.image ?? recipes[0]!.image} />
                  <span>Gợi ý {String(index + 1).padStart(2, '0')}</span>
                </div>
                <div className="meal-plan__body">
                  <div className="recipe-card__meta">
                    <span>
                      <AppIcon name="clock" size={16} /> {meal.time}
                    </span>
                    <span>
                      <AppIcon name="users" size={16} /> {meal.servings} người
                    </span>
                  </div>
                  <h2>{meal.title}</h2>
                  <p>{meal.description}</p>
                  <div className="meal-plan__dishes">
                    {items.map((recipe, dishIndex) => (
                      <Link key={recipe.slug} to={`/mon-an/${recipe.slug}`}>
                        <span>
                          {dishIndex === 0 ? 'Món chính' : dishIndex === 1 ? 'Món canh' : 'Món rau'}
                        </span>
                        <strong>{recipe.name}</strong>
                        <AppIcon name="arrow" size={17} />
                      </Link>
                    ))}
                  </div>
                  <div className="meal-plan__actions">
                    <Link className="button button--primary" to="/ke-hoach">
                      Thêm cả mâm vào kế hoạch
                    </Link>
                    <button className="button button--outline" type="button">
                      Đổi món
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
