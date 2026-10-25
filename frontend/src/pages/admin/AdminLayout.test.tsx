import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '@/features/i18n/I18nContext';
import { AdminLayout } from '@/pages/admin/AdminLayout';

const { logout } = vi.hoisted(() => ({ logout: vi.fn().mockResolvedValue(undefined) }));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'admin-1',
      email: 'quantri@example.com',
      phone_e164: null,
      full_name: 'Trần Quản Trị',
      role: 'admin',
      created_at: '2026-10-01T00:00:00Z',
    },
    isLoading: false,
    logout,
    updateUser: vi.fn(),
  }),
}));

vi.mock('@/features/admin/adminApi', () => ({
  adminKeys: { overview: () => ['admin', 'overview'] },
  getAdminOverview: () =>
    Promise.resolve({
      counts: {
        users: 12,
        active_users: 10,
        admins: 1,
        new_users_7d: 2,
        recipes_published: 300,
        recipes_hidden: 4,
        plan_items: 40,
        planners: 6,
        articles_published: 8,
        articles_pending: 3,
        submissions_pending: 1,
        tickets_open: 2,
      },
      recent_users: [],
    }),
}));

function renderAdmin(path: string) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<AdminLayout />} path="admin">
              <Route element={<p>Nội dung bảng điều khiển</p>} index />
              <Route element={<p>Danh sách người dùng</p>} path="users" />
              <Route element={<p>Hồ sơ chi tiết</p>} path="users/:userId" />
              <Route element={<p>Trình soạn bài</p>} path="articles/new" />
            </Route>
            <Route element={<p>Trang đăng nhập</p>} path="login" />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

describe('AdminLayout', () => {
  it('shows only management navigation, grouped like an admin console', async () => {
    renderAdmin('/admin/users');

    const nav = screen.getByRole('navigation', { name: 'Khu vực quản trị' });
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.getAttribute('href'));
    expect(links).toEqual([
      '/admin',
      '/admin/users',
      '/admin/plans',
      '/admin/recipes',
      '/admin/articles',
      '/admin/submissions',
      '/admin/support',
      '/admin/assistant',
      '/admin/settings',
      '/admin/security',
    ]);
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Quay mâm' })).not.toBeInTheDocument();
    for (const group of ['Tổng quan', 'Vận hành', 'Nội dung & cộng đồng', 'Hệ thống']) {
      expect(within(nav).getByText(group)).toBeInTheDocument();
    }

    expect(screen.getByRole('heading', { level: 1, name: 'Người dùng' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: /Người dùng/ })).toHaveClass('is-active');
    expect(await screen.findByLabelText('3 mục chờ xử lý')).toBeInTheDocument();
    expect(screen.getByText('6 việc chờ xử lý')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Viết bài mới' })).not.toBeInTheDocument();
    expect(document.title).toBe('Người dùng · Quản trị Bếp Việt');
  });

  it('titles nested pages and links the breadcrumb back to their section', () => {
    renderAdmin('/admin/users/user-9');
    expect(screen.getByRole('heading', { level: 1, name: 'Hồ sơ người dùng' })).toBeInTheDocument();
    const breadcrumb = screen.getByRole('navigation', { name: 'Đường dẫn' });
    expect(within(breadcrumb).getByRole('link', { name: 'Người dùng' })).toHaveAttribute(
      'href',
      '/admin/users',
    );
    expect(screen.getByText('Hồ sơ chi tiết')).toBeInTheDocument();
  });

  it('offers the write shortcut on the dashboard and toggles the mobile menu', () => {
    renderAdmin('/admin');
    expect(screen.getByRole('heading', { level: 1, name: 'Bảng điều khiển' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Viết bài mới' })).toHaveAttribute(
      'href',
      '/admin/articles/new',
    );

    const toggle = screen.getByRole('button', { name: 'Mở trình đơn' });
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.querySelector('.admin-shell')).toHaveClass('is-nav-open');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.querySelector('.admin-shell')).not.toHaveClass('is-nav-open');
  });

  it('signs out from the sidebar', async () => {
    renderAdmin('/admin');
    fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
    expect(await screen.findByText('Trang đăng nhập')).toBeInTheDocument();
    expect(logout).toHaveBeenCalled();
  });
});
