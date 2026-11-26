import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LoginPage } from '@/pages/auth/LoginPage';
import { ResetPasswordPage } from '@/pages/auth/ResetPasswordPage';

const authState = vi.hoisted(() => ({ user: null as null | { role: string } }));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ isLoading: false, login: vi.fn(), user: authState.user }),
}));

function renderAt(entry: string | { pathname: string; search?: string; state?: unknown }) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route element={<LoginPage />} path="/login" />
        <Route element={<ResetPasswordPage />} path="/reset-password" />
        <Route element={<p>Trang chủ</p>} path="/" />
        <Route element={<p>Tài khoản</p>} path="/account" />
        <Route element={<p>Kế hoạch</p>} path="/planner" />
      </Routes>
    </MemoryRouter>,
  );
}

afterEach(() => {
  cleanup();
  authState.user = null;
  document.title = '';
});

describe('LoginPage', () => {
  it('đưa người đã đăng nhập (kể cả quản trị viên) về trang chủ khi không có đường quay lại', () => {
    for (const role of ['user', 'admin']) {
      authState.user = { role };
      renderAt('/login');
      expect(screen.getByText('Trang chủ')).toBeInTheDocument();
      cleanup();
    }
  });

  it('quay lại đúng trang đã yêu cầu sau khi đăng nhập', () => {
    authState.user = { role: 'user' };
    renderAt('/login?next=%2Fplanner');
    expect(screen.getByText('Kế hoạch')).toBeInTheDocument();
  });

  it('giải thích lý do và chào khách mới khi bị chuyển tới từ trang cần đăng nhập', () => {
    renderAt('/login?next=%2Frecipes%2Fbun-bo-hue');

    expect(document.title).toBe('Đăng nhập · Bếp Việt');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Đăng nhập hoặc tạo tài khoản' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Đăng nhập để lưu món và lên kế hoạch bữa ăn.')).toBeInTheDocument();
    for (const link of screen.getAllByRole('link', { name: 'Tạo tài khoản miễn phí' })) {
      expect(link).toHaveAttribute('href', '/register?next=%2Frecipes%2Fbun-bo-hue');
    }
  });

  it('vẫn nhận đường quay lại qua state và bỏ qua ?next= trỏ ra ngoài', () => {
    renderAt({ pathname: '/login', search: '?next=//evil.example', state: { from: '/planner' } });

    expect(screen.getByText('Đăng nhập để lên kế hoạch bữa ăn cho cả tuần.')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Tạo tài khoản miễn phí' })[0]).toHaveAttribute(
      'href',
      '/register?next=%2Fplanner',
    );
  });

  it('giữ lời chào quen thuộc khi mở trực tiếp', () => {
    renderAt('/login');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Đăng nhập Bếp Việt' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Tạo tài khoản miễn phí' })).toHaveAttribute(
      'href',
      '/register',
    );
  });
});

describe('ResetPasswordPage', () => {
  it('thiếu liên kết hợp lệ thì ẩn form và mời gửi lại liên kết', () => {
    renderAt('/reset-password');

    expect(document.title).toBe('Đặt lại mật khẩu · Bếp Việt');
    expect(
      screen.getByText('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Mật khẩu mới')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Gửi lại liên kết đặt lại mật khẩu' })).toHaveAttribute(
      'href',
      '/forgot-password',
    );
    expect(document.body.textContent).not.toMatch(/token/i);
  });
});
