import { Link } from 'react-router';

import { AppIcon } from '@/components/common/AppIcon';
import { recipes } from '@/data/recipes';

const articles = [
  {
    category: 'Mẹo vào bếp',
    title: 'Chuẩn bị bữa cơm 4 người trong 45 phút',
    description:
      'Cách chọn một món kho, một món canh và một món rau để dùng chung nguyên liệu, tiết kiệm thời gian.',
    image: recipes[0]!.image,
  },
  {
    category: 'Nguyên liệu',
    title: 'Chọn rau tươi bằng 5 dấu hiệu dễ nhớ',
    description: 'Quan sát màu lá, thân, độ ẩm và mùi để chọn được bó rau tươi cho bữa nhà.',
    image: recipes[4]!.image,
  },
  {
    category: 'Văn hóa ẩm thực',
    title: 'Vị cơm nhà trong gian bếp ba miền',
    description: 'Cùng tìm hiểu cách vị mặn, ngọt, cay và chua tạo nên nét riêng của mỗi miền.',
    image: recipes[2]!.image,
  },
];

export function ArticlesPage() {
  return (
    <div className="page-wrap">
      <section className="page-hero">
        <div className="container">
          <span className="section-label">Bài viết & sự kiện</span>
          <h1>Chuyện hay từ căn bếp Việt</h1>
          <p>Mẹo thực tế, câu chuyện món nhà và cảm hứng để mỗi lần vào bếp đều nhẹ nhàng.</p>
        </div>
      </section>
      <section className="content-section">
        <div className="container">
          <article className="featured-article">
            <img alt="Nồi cá kho trong bữa cơm gia đình" src={recipes[0]!.image} />
            <div>
              <span className="section-label">Chuyện bếp · Nổi bật</span>
              <h2>Một mâm cơm đủ vị bắt đầu từ đâu?</h2>
              <p>
                Không cần quá nhiều món. Chỉ cần chọn đúng vai trò của từng món và sắp thứ tự nấu
                hợp lý, bữa cơm ngày thường cũng có thể trọn vẹn.
              </p>
              <Link className="button button--primary" to="/bua-com">
                Xem mâm cơm mẫu <AppIcon name="arrow" size={17} />
              </Link>
            </div>
          </article>
          <div className="article-list">
            {articles.map((article) => (
              <article key={article.title}>
                <img alt="" src={article.image} />
                <div>
                  <small>{article.category}</small>
                  <h3>{article.title}</h3>
                  <p>{article.description}</p>
                  <Link className="text-link" to="#">
                    Đọc trong 5 phút <AppIcon name="arrow" size={16} />
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
