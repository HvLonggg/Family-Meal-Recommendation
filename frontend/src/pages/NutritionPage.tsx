import { useState } from 'react';

import { AppIcon } from '@/components/common/AppIcon';
import { RecipeCard } from '@/components/recipes/RecipeCard';
import { recipes } from '@/data/recipes';

const needs = [
  {
    name: 'Bữa ăn cân bằng',
    icon: '🥗',
    text: 'Kết hợp món đạm, rau, canh và tinh bột với khẩu phần vừa đủ.',
  },
  {
    name: 'Nhẹ bụng',
    icon: '🌿',
    text: 'Ưu tiên món canh, rau xanh, cách chế biến ít dầu và vị thanh.',
  },
  {
    name: 'Nấu cho trẻ nhỏ',
    icon: '🍳',
    text: 'Món mềm, màu sắc vui mắt, hương vị dịu và dễ chia phần.',
  },
  {
    name: 'Bữa ăn nhanh',
    icon: '⏱️',
    text: 'Công thức dưới 30 phút cho ngày bận nhưng vẫn đủ món nhà.',
  },
];

export function NutritionPage() {
  const [active, setActive] = useState(needs[0]!.name);
  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--nutrition">
        <div className="container">
          <span className="section-label">Nhu cầu dinh dưỡng</span>
          <h1>Ăn ngon và cân bằng hơn mỗi ngày</h1>
          <p>Gợi ý món theo mục tiêu bữa ăn phổ thông, dễ áp dụng cho căn bếp gia đình Việt.</p>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="need-grid">
            {needs.map((need) => (
              <button
                className={active === need.name ? 'is-active' : ''}
                key={need.name}
                onClick={() => setActive(need.name)}
                type="button"
              >
                <span>{need.icon}</span>
                <strong>{need.name}</strong>
                <small>{need.text}</small>
              </button>
            ))}
          </div>
          <div className="nutrition-note">
            <AppIcon name="sparkles" />
            <p>
              <strong>Lưu ý:</strong> Gợi ý trên Bếp Việt phục vụ lập kế hoạch bữa ăn thông thường,
              không thay thế tư vấn dinh dưỡng hoặc chẩn đoán y khoa.
            </p>
          </div>
        </div>
      </section>
      <section className="content-section content-section--tint">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="section-label">Đang xem</span>
              <h2>{active}</h2>
              <p>Những món quen thuộc, nguyên liệu dễ tìm và có thể điều chỉnh theo số người.</p>
            </div>
          </div>
          <div className="recipe-grid">
            {recipes.slice(2, 6).map((recipe) => (
              <RecipeCard key={recipe.slug} recipe={recipe} />
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
