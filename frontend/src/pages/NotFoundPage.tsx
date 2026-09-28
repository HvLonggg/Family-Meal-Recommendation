import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <section className="section">
      <div className="container empty-page">
        <p className="eyebrow">Lỗi 404</p>
        <h1>Không tìm thấy trang</h1>
        <p>Đường dẫn có thể đã thay đổi hoặc không còn tồn tại.</p>
        <Link className="button button--primary" to="/">
          Về trang chủ
        </Link>
      </div>
    </section>
  );
}
