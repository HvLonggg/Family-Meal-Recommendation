import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { recipes } from '@/data/recipes';

const days = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

export function PlannerPage() {
  return (
    <div className="page-wrap">
      <section className="page-hero page-hero--planner">
        <div className="container">
          <span className="section-label">Kế hoạch nấu ăn</span>
          <h1>Một tuần chủ động, mỗi bữa thảnh thơi</h1>
          <p>Kéo món vào từng ngày, đổi khẩu phần và chuẩn bị danh sách mua sắm.</p>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <div className="planner-toolbar">
            <div>
              <button className="icon-button" type="button">
                ‹
              </button>
              <strong>Tuần này · 28/09 – 04/10</strong>
              <button className="icon-button" type="button">
                ›
              </button>
            </div>
            <button className="button button--primary" type="button">
              <AppIcon name="plus" size={18} /> Thêm bữa ăn
            </button>
          </div>
          <div className="planner-grid">
            {days.map((day, index) => {
              const lunchRecipe = recipes[index];
              const dinnerRecipe = recipes[4]!;
              return (
                <article className={index === 0 ? 'is-today' : ''} key={day}>
                  <header>
                    <span>{day}</span>
                    <strong>{28 + index > 30 ? index - 2 : 28 + index}</strong>
                  </header>
                  <div className="planner-slot">
                    <small>Bữa trưa</small>
                    {index < 3 && lunchRecipe ? (
                      <Link to={`/mon-an/${lunchRecipe.slug}`}>
                        <img alt="" src={lunchRecipe.image} />
                        <span>{lunchRecipe.name}</span>
                      </Link>
                    ) : (
                      <button type="button">
                        <AppIcon name="plus" size={16} /> Thêm món
                      </button>
                    )}
                  </div>
                  <div className="planner-slot">
                    <small>Bữa tối</small>
                    {index === 0 ? (
                      <Link to={`/mon-an/${dinnerRecipe.slug}`}>
                        <img alt="" src={dinnerRecipe.image} />
                        <span>{dinnerRecipe.name}</span>
                      </Link>
                    ) : (
                      <button type="button">
                        <AppIcon name="plus" size={16} /> Thêm món
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          <div className="planner-summary">
            <div>
              <AppIcon name="calendar" size={25} />
              <span>
                <strong>4 món đã lên lịch</strong>
                <small>Ước tính cho 4 người</small>
              </span>
            </div>
            <button className="button button--outline" type="button">
              Tạo danh sách mua sắm
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
