import { useState } from 'react';
import { Link, useNavigate } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { getMealRecipes, mealSets, recipes } from '@/data/recipes';

export function HomePage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    void navigate(`/mon-an?q=${encodeURIComponent(query)}`);
  };

  return (
    <>
      <section className="home-hero">
        <div className="container home-hero__inner">
          <div className="home-hero__copy">
            <span className="hero-kicker">
              <AppIcon name="sparkles" size={17} /> Bữa nhà ngon hơn mỗi ngày
            </span>
            <h1>
              Cùng Quyên,
              <br />
              <em>trọn vị cơm nhà</em>
            </h1>
            <p>
              Chọn món quen, ghép mâm cơm đủ vị và chuẩn bị đúng lượng cho cả gia đình — tất cả
              trong một căn bếp số.
            </p>
            <form className="hero-search" onSubmit={submitSearch}>
              <AppIcon name="search" size={21} />
              <input
                aria-label="Tìm món ăn"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Hôm nay nhà mình ăn gì?"
                value={query}
              />
              <button type="submit">Tìm món</button>
            </form>
            <div className="hero-suggestions">
              <span>Gợi ý:</span>
              <Link to="/mon-an?q=cá kho">cá kho</Link>
              <Link to="/mon-an?q=canh">món canh</Link>
              <Link to="/mon-an?q=15 phút">15 phút</Link>
            </div>
          </div>
          <div className="home-hero__visual">
            <img alt="Mâm cơm gia đình Việt ấm cúng" src={recipes[0]!.image} />
            <div className="hero-float hero-float--top">
              <span>Hôm nay</span>
              <strong>Mâm cơm 4 người</strong>
            </div>
            <div className="hero-float hero-float--bottom">
              <span className="hero-float__icon">
                <AppIcon name="clock" />
              </span>
              <div>
                <strong>45 phút</strong>
                <small>3 món đủ vị</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="quick-paths container" aria-label="Lối tắt">
        <Link to="/mon-an">
          <span className="quick-paths__icon quick-paths__icon--orange">
            <AppIcon name="book" />
          </span>
          <span>
            <strong>Kho món Việt</strong>
            <small>Tìm theo vùng, thời gian</small>
          </span>
          <AppIcon name="arrow" />
        </Link>
        <Link to="/bua-com">
          <span className="quick-paths__icon quick-paths__icon--green">
            <AppIcon name="chef" />
          </span>
          <span>
            <strong>Bữa cơm gia đình</strong>
            <small>Ghép mâm đủ món</small>
          </span>
          <AppIcon name="arrow" />
        </Link>
        <Link to="/ke-hoach">
          <span className="quick-paths__icon quick-paths__icon--yellow">
            <AppIcon name="calendar" />
          </span>
          <span>
            <strong>Kế hoạch tuần</strong>
            <small>Chủ động từng bữa</small>
          </span>
          <AppIcon name="arrow" />
        </Link>
      </section>

      <section className="content-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">Món nhà thân thuộc</span>
              <h2>Hôm nay nấu gì?</h2>
              <p>Công thức được chuẩn hóa theo khẩu phần, dễ theo dõi từ sơ chế đến lúc lên mâm.</p>
            </div>
            <Link className="view-all" to="/mon-an">
              Xem tất cả <AppIcon name="arrow" size={17} />
            </Link>
          </div>
          <div className="recipe-grid">
            {recipes.slice(0, 4).map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} />
            ))}
          </div>
        </div>
      </section>

      <section className="content-section content-section--tint">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">Không cần nghĩ nhiều</span>
              <h2>Mâm cơm gợi ý hôm nay</h2>
              <p>Cân bằng món mặn, món canh và rau cho một bữa ăn trọn vẹn.</p>
            </div>
            <Link className="view-all" to="/bua-com">
              Xem mọi thực đơn <AppIcon name="arrow" size={17} />
            </Link>
          </div>
          <div className="meal-set-grid">
            {mealSets.map((meal) => {
              const mealRecipes = getMealRecipes(meal.recipeSlugs);
              return (
                <article className="meal-card" key={meal.id}>
                  <div className="meal-card__collage">
                    {mealRecipes.map((recipe) => (
                      <img alt="" key={recipe.slug} src={recipe.image} />
                    ))}
                    <span>{mealRecipes.length} món</span>
                  </div>
                  <div className="meal-card__body">
                    <div className="recipe-card__meta">
                      <span>
                        <AppIcon name="clock" size={16} /> {meal.time}
                      </span>
                      <span>
                        <AppIcon name="users" size={16} /> {meal.servings} người
                      </span>
                    </div>
                    <h3>{meal.title}</h3>
                    <p>{meal.description}</p>
                    <ul>
                      {mealRecipes.map((recipe) => (
                        <li key={recipe.slug}>{recipe.name}</li>
                      ))}
                    </ul>
                    <Link className="button button--outline" to={`/bua-com#${meal.id}`}>
                      Xem mâm cơm
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="story-band">
        <div className="container story-band__inner">
          <div>
            <span className="section-label section-label--light">Góc của Quyên</span>
            <h2>Mỗi bữa cơm là một lần nhà mình gần nhau hơn.</h2>
            <p>
              Bếp Việt giúp giữ lại những món quen, đồng thời làm việc chọn món và chuẩn bị bữa ăn
              nhẹ nhàng hơn.
            </p>
          </div>
          <Link className="button button--cream" to="/bai-viet">
            Đọc chuyện căn bếp <AppIcon name="arrow" size={17} />
          </Link>
        </div>
      </section>
    </>
  );
}
