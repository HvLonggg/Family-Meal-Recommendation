import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router';

import { KitchenHomeLogo } from '@/components/brand/KitchenHomeLogo';
import { AppIcon } from '@/components/common/AppIcon';
import { useAuth } from '@/features/auth/AuthContext';

export function PublicLayout() {
  const { isLoading, logout, user } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    await navigate('/');
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <div className="site-header__content">
          <Link className="brand" to="/" aria-label="Bếp Việt - Trang chủ">
            <KitchenHomeLogo compact />
          </Link>
          <button
            aria-expanded={menuOpen}
            aria-label="Mở trình đơn"
            className="mobile-menu-button"
            onClick={() => setMenuOpen((value) => !value)}
            type="button"
          >
            <AppIcon name="menu" />
          </button>
          <nav
            className={`site-nav${menuOpen ? ' is-open' : ''}`}
            aria-label="Điều hướng chính"
            onClick={() => setMenuOpen(false)}
          >
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              end
              to="/"
            >
              Trang chủ
            </NavLink>
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              to="/mon-an"
            >
              Món ăn
            </NavLink>
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              to="/bua-com"
            >
              Bữa cơm
            </NavLink>
            <NavLink
              className={({ isActive }) => `nav-link${isActive ? ' is-active' : ''}`}
              to="/ke-hoach"
            >
              Kế hoạch
            </NavLink>
            <NavLink
              className={({ isActive }) => `nav-link nav-link--more${isActive ? ' is-active' : ''}`}
              to="/bai-viet"
            >
              Khám phá
            </NavLink>
            {!isLoading && user ? (
              <>
                {user.role === 'admin' ? (
                  <Link className="nav-link" to="/quan-tri">
                    Quản trị
                  </Link>
                ) : null}
                <Link className="user-chip" to="/tai-khoan">
                  <span>{user.full_name.charAt(0).toUpperCase()}</span>
                  {user.full_name.split(' ').at(-1)}
                </Link>
                <button className="nav-logout" onClick={() => void handleLogout()} type="button">
                  Đăng xuất
                </button>
              </>
            ) : (
              <>
                <Link className="nav-link" to="/dang-nhap">
                  Đăng nhập
                </Link>
                <Link className="nav-signup" to="/dang-ky">
                  Tạo tài khoản
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main id="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="container footer-grid">
          <div>
            <KitchenHomeLogo />
            <p>
              Cùng Quyên, trọn vị cơm nhà. Chọn món và lên kế hoạch bữa ăn dễ dàng hơn mỗi ngày.
            </p>
          </div>
          <div>
            <strong>Khám phá</strong>
            <Link to="/mon-an">Kho món Việt</Link>
            <Link to="/bua-com">Bữa cơm gia đình</Link>
            <Link to="/dinh-duong">Nhu cầu dinh dưỡng</Link>
          </div>
          <div>
            <strong>Tiện ích</strong>
            <Link to="/ke-hoach">Kế hoạch nấu ăn</Link>
            <Link to="/yeu-thich">Món yêu thích</Link>
            <Link to="/de-xuat-mon">Đề xuất món mới</Link>
            <Link to="/bai-viet">Bài viết & sự kiện</Link>
          </div>
          <div>
            <strong>Về Bếp Việt</strong>
            <Link to="/bai-viet">Câu chuyện căn bếp</Link>
            <a href="mailto:hotro@bepviet.vn">Liên hệ hỗ trợ</a>
            <span>© 2026 Bếp Việt</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
