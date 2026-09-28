import { Link } from 'react-router';

import { useAuth } from '@/features/auth/AuthContext';

export function AccountPage() {
  const { user } = useAuth();
  if (!user) return null;

  return (
    <section className="account-page section">
      <div className="container account-layout">
        <aside className="profile-card">
          <span className="profile-card__avatar">{user.full_name.charAt(0).toUpperCase()}</span>
          <h1>{user.full_name}</h1>
          <p>{user.email ?? user.phone_e164}</p>
          <span className="role-badge">
            {user.role === 'admin' ? 'Quản trị viên' : 'Người dùng'}
          </span>
        </aside>
        <div className="account-content">
          <span className="auth-kicker">Không gian cá nhân</span>
          <h2>Chào {user.full_name.split(' ').at(-1)}, hôm nay mình nấu gì?</h2>
          <p>
            Tài khoản đã sẵn sàng để lưu công thức, khẩu phần mặc định và kế hoạch bữa ăn của riêng
            bạn.
          </p>
          <div className="account-stat-grid">
            <article>
              <strong>0</strong>
              <span>Món yêu thích</span>
            </article>
            <article>
              <strong>0</strong>
              <span>Kế hoạch tuần</span>
            </article>
            <article>
              <strong>4 người</strong>
              <span>Khẩu phần mặc định</span>
            </article>
          </div>
          {user.role === 'admin' ? (
            <Link className="button button--primary" to="/quan-tri">
              Đi tới trang quản trị
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}
