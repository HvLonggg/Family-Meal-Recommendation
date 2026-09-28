import { useState } from 'react';

import { RecipeCard } from '@/components/recipes/RecipeCard';
import { recipes } from '@/data/recipes';

const options = ['Dưới 30 phút', 'Nhiều rau', 'Dễ nấu', 'Trẻ nhỏ thích', 'Cuối tuần'];

export function SuggestionsPage() {
  const [selected, setSelected] = useState('Dễ nấu');
  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--suggestions">
        <div className="container">
          <span className="section-label">Gợi ý cho nhà mình</span>
          <h1>Hôm nay bạn muốn ăn thế nào?</h1>
          <p>Chọn một ưu tiên, Bếp Việt sẽ rút gọn những món phù hợp nhất.</p>
          <div className="choice-chips">
            {options.map((item) => (
              <button
                className={selected === item ? 'is-active' : ''}
                key={item}
                onClick={() => setSelected(item)}
                type="button"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">Đề xuất theo lựa chọn</span>
              <h2>{selected}</h2>
              <p>Bộ gợi ý sẽ chính xác hơn khi bạn lưu món và sử dụng kế hoạch nấu ăn.</p>
            </div>
          </div>
          <div className="recipe-grid">
            {recipes.slice(0, 4).map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
