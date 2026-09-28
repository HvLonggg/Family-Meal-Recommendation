import { useAuth } from '@/features/auth/AuthContext';

const adminModules = [
  { title: 'Công thức', detail: 'Tạo nháp, kiểm tra và xuất bản món ăn.', count: '0 bản nháp' },
  {
    title: 'Người dùng',
    detail: 'Theo dõi tài khoản và vai trò truy cập.',
    count: 'Đang hoạt động',
  },
  { title: 'Nội dung', detail: 'Quản lý nguyên liệu, đơn vị và danh mục.', count: 'Sẵn sàng' },
];

export function AdminPage() {
  const { user } = useAuth();

  return (
    <section className="admin-page section">
      <div className="container">
        <div className="admin-hero">
          <div>
            <span className="auth-kicker">Bếp điều hành</span>
            <h1>Xin chào, {user?.full_name}</h1>
            <p>Quản lý nội dung và trải nghiệm Bếp Việt từ một không gian tập trung.</p>
          </div>
          <span className="admin-hero__secure">✓ Quyền quản trị đã xác minh</span>
        </div>
        <div className="admin-grid">
          {adminModules.map((module) => (
            <article className="admin-module" key={module.title}>
              <span className="admin-module__icon" aria-hidden="true">
                {module.title.charAt(0)}
              </span>
              <div>
                <h2>{module.title}</h2>
                <p>{module.detail}</p>
                <small>{module.count}</small>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
