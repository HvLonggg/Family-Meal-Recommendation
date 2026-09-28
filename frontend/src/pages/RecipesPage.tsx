import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { recipes } from '@/data/recipes';

export function RecipesPage() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') ?? '');
  const [category, setCategory] = useState('Tất cả');
  const [region, setRegion] = useState('Tất cả');
  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('vi');
    return recipes.filter(
      (recipe) =>
        (!search ||
          [recipe.name, recipe.excerpt, ...recipe.tags]
            .join(' ')
            .toLocaleLowerCase('vi')
            .includes(search)) &&
        (category === 'Tất cả' || recipe.category === category) &&
        (region === 'Tất cả' || recipe.region === region),
    );
  }, [category, query, region]);

  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--recipes">
        <div className="container">
          <span className="section-label">Kho món Việt</span>
          <h1>Món ngon cho mỗi bữa nhà</h1>
          <p>Tìm công thức theo loại món, vùng miền và thời gian bạn có.</p>
          <form
            className="catalog-search"
            onSubmit={(event) => {
              event.preventDefault();
              setParams(query ? { q: query } : {});
            }}
          >
            <AppIcon name="search" />
            <input
              aria-label="Tìm trong kho món"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm tên món hoặc nguyên liệu..."
              value={query}
            />
            <button type="submit">Tìm kiếm</button>
          </form>
        </div>
      </section>
      <section className="content-section">
        <div className="container catalog-layout">
          <aside className="filter-panel">
            <div>
              <strong>Loại món</strong>
              {['Tất cả', 'Món mặn', 'Món canh', 'Món rau', 'Món chay', 'Món nước'].map((item) => (
                <button
                  className={category === item ? 'is-active' : ''}
                  key={item}
                  onClick={() => setCategory(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
            <div>
              <strong>Vùng miền</strong>
              {['Tất cả', 'Bắc', 'Trung', 'Nam', 'Ba miền'].map((item) => (
                <button
                  className={region === item ? 'is-active' : ''}
                  key={item}
                  onClick={() => setRegion(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </aside>
          <div>
            <div className="catalog-results">
              <div>
                <span>{filtered.length} công thức</span>
                <h2>{query ? `Kết quả cho “${query}”` : 'Tất cả món ăn'}</h2>
              </div>
              <select aria-label="Sắp xếp">
                <option>Phù hợp nhất</option>
                <option>Nấu nhanh nhất</option>
                <option>Mới nhất</option>
              </select>
            </div>
            {filtered.length ? (
              <div className="recipe-grid recipe-grid--catalog">
                {filtered.map((recipe) => (
                  <RecipeCard key={recipe.slug} recipe={recipe} />
                ))}
              </div>
            ) : (
              <div className="empty-state">
                <AppIcon name="search" size={36} />
                <h3>Chưa tìm thấy món phù hợp</h3>
                <p>Thử một từ khóa ngắn hơn hoặc bỏ bớt bộ lọc.</p>
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
