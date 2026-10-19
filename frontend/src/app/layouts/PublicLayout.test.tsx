import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PublicLayout } from '@/app/layouts/PublicLayout';
import { I18nProvider } from '@/features/i18n/I18nContext';

const { authState } = vi.hoisted(() => ({
  authState: {
    user: {
      id: 'user-1',
      email: 'lan@example.com',
      phone_e164: null,
      full_name: 'Nguyễn Ngọc Lan',
      role: 'user',
      created_at: '2026-10-01T00:00:00Z',
    },
  },
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: authState.user,
    isLoading: false,
    logout: vi.fn().mockResolvedValue(undefined),
    updateUser: vi.fn(),
  }),
}));

function renderLayout(path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<p>Trang chủ thử nghiệm</p>} />
              <Route element={<p>Chi tiết món thử nghiệm</p>} path="recipes/:slug" />
              <Route element={<p>Trang kế hoạch thử nghiệm</p>} path="planner" />
            </Route>
            <Route element={<p>Bảng quản trị thử nghiệm</p>} path="admin" />
            <Route element={<p>Quản lý kế hoạch thử nghiệm</p>} path="admin/plans" />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  authState.user.role = 'user';
});

describe('PublicLayout header', () => {
  it('uses the official Bếp Việt logo image in shared brand placements', () => {
    renderLayout();
    const logos = screen.getAllByRole('img', { name: 'Bếp Việt' });
    expect(logos.length).toBeGreaterThanOrEqual(2);
    expect(logos[0]).toHaveAttribute('src', '/images/brand/bep-viet-logo.png');
  });

  it('keeps sign-out, settings and password inside the account menu', () => {
    renderLayout();
    const header = screen.getByRole('banner');
    expect(within(header).queryByRole('button', { name: 'Đăng xuất' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Mở menu tài khoản' }));

    expect(screen.getByRole('link', { name: 'Cài đặt' })).toHaveAttribute(
      'href',
      '/account/settings',
    );
    expect(screen.getByRole('link', { name: 'Đổi mật khẩu & bảo mật' })).toHaveAttribute(
      'href',
      '/account/security',
    );
    expect(screen.getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Trang quản trị' })).not.toBeInTheDocument();
  });

  it('sends administrators from public pages to the admin console', () => {
    authState.user.role = 'admin';
    renderLayout('/');
    expect(screen.getByText('Bảng quản trị thử nghiệm')).toBeInTheDocument();
    expect(screen.queryByText('Trang chủ thử nghiệm')).not.toBeInTheDocument();
    cleanup();

    renderLayout('/planner');
    expect(screen.getByText('Quản lý kế hoạch thử nghiệm')).toBeInTheDocument();
  });

  it('lets administrators preview recipe pages without the member navigation', () => {
    authState.user.role = 'admin';
    renderLayout('/recipes/pho-bo');
    expect(screen.getByText('Chi tiết món thử nghiệm')).toBeInTheDocument();
    expect(screen.getByText('Chế độ xem trước')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Về trang quản trị/ })).toHaveAttribute(
      'href',
      '/admin',
    );
    expect(screen.queryByRole('navigation', { name: 'Điều hướng chính' })).not.toBeInTheDocument();
    expect(screen.queryByRole('contentinfo')).not.toBeInTheDocument();
  });

  it('keeps important destinations outside the explore menu', () => {
    renderLayout();
    const header = screen.getByRole('banner');
    const navigation = within(header).getByRole('navigation', { name: 'Điều hướng chính' });
    const articleLink = within(navigation).getByRole('link', { name: 'Bài viết' });
    const submitLink = within(navigation).getByRole('link', { name: 'Đăng món' });
    const supportLink = within(navigation).getByRole('link', { name: 'Liên hệ hỗ trợ' });

    expect(articleLink).toHaveAttribute('href', '/articles');
    expect(submitLink).toHaveAttribute('href', '/submit-recipe');
    expect(supportLink).toHaveAttribute('href', '/contact');
    expect(within(navigation).getAllByRole('link').at(-1)).toBe(supportLink);

    fireEvent.click(within(navigation).getByRole('button', { name: 'Khám phá thêm' }));
    const exploreMenu = header.querySelector('.menu-list--explore');
    expect(exploreMenu).not.toBeNull();
    const menu = within(exploreMenu as HTMLElement);
    expect(menu.getByRole('link', { name: /Nhu cầu dinh dưỡng/ })).toBeInTheDocument();
    expect(menu.getByRole('link', { name: /Món yêu thích/ })).toBeInTheDocument();
    for (const name of [/Bài viết/, /Đăng món/, /Liên hệ hỗ trợ/]) {
      expect(menu.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('switches the whole interface to English', async () => {
    renderLayout();
    fireEvent.click(within(screen.getByRole('banner')).getByRole('button', { name: 'English' }));
    const nav = await screen.findByRole('navigation', { name: 'Main navigation' });
    expect(within(nav).getByRole('link', { name: 'Recipes' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Planner' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('bep-viet-language')).toBe('en');
  });
});
