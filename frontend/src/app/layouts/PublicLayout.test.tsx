import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useSearchParams } from 'react-router';
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
      terms_version: '1.0',
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

function FilterNavigationProbe() {
  const [, setParams] = useSearchParams();
  return <button onClick={() => setParams({ sort: 'quick' })}>Đổi cách sắp xếp</button>;
}

function renderLayout(path = '/') {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={<PublicLayout />}>
              <Route index element={<p>Trang chủ thử nghiệm</p>} />
              <Route element={<FilterNavigationProbe />} path="recipes" />
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

const memberUser = authState.user;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  localStorage.clear();
  authState.user = memberUser;
  authState.user.role = 'user';
});

function openMobileMenu() {
  fireEvent.click(screen.getByRole('button', { name: 'Mở trình đơn' }));
  return screen.getByRole('navigation', { name: 'Điều hướng chính' });
}

describe('PublicLayout header', () => {
  it('keeps the viewport when changing filters and scrolls to the new page from the footer', () => {
    const scroll = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    renderLayout('/recipes');
    fireEvent.click(screen.getByRole('button', { name: 'Đổi cách sắp xếp' }));
    expect(scroll).not.toHaveBeenCalled();
    fireEvent.click(
      within(screen.getByRole('contentinfo')).getByRole('link', { name: 'Kế hoạch nấu ăn' }),
    );
    expect(screen.getByText('Trang kế hoạch thử nghiệm')).toBeInTheDocument();
    expect(scroll).toHaveBeenCalledWith({ top: 0, left: 0, behavior: 'auto' });
  });

  it('marks the footer as secondary outside the home page so phones can hide it', () => {
    renderLayout('/');
    expect(screen.getByRole('contentinfo')).not.toHaveClass('site-footer--secondary');
    cleanup();
    renderLayout('/planner');
    expect(screen.getByRole('contentinfo')).toHaveClass('site-footer', 'site-footer--secondary');
  });

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
    // Trang chủ mở ở chế độ xem trước để đăng nhập xong vẫn về trang chủ.
    renderLayout('/');
    expect(screen.getByText('Trang chủ thử nghiệm')).toBeInTheDocument();
    expect(screen.getByText('Chế độ xem trước')).toBeInTheDocument();
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
    const submitLink = within(navigation).getByRole('link', { name: 'Đề xuất món' });
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
    for (const name of [/Bài viết/, /Đề xuất món/, /Liên hệ hỗ trợ/]) {
      expect(menu.queryByRole('link', { name })).not.toBeInTheDocument();
    }
  });

  it('switches the whole interface to English', async () => {
    renderLayout();
    const navigation = screen.getByRole('navigation', { name: 'Điều hướng chính' });
    fireEvent.click(within(navigation).getByRole('button', { name: 'English' }));
    const nav = await screen.findByRole(
      'navigation',
      { name: 'Main navigation' },
      { timeout: 5000 },
    );
    expect(within(nav).getByRole('link', { name: 'Recipes' })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Planner' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en');
    expect(localStorage.getItem('bep-viet-language')).toBe('en');
  });

  it('puts a compact VI/EN switcher on the header bar next to the menu button', async () => {
    renderLayout();
    const header = screen.getByRole('banner');
    const groups = within(header).getAllByRole('group', { name: 'Ngôn ngữ' });
    const headerSwitcher = groups.find(
      (group) => !group.closest('nav') && group.classList.contains('language-switcher--compact'),
    );
    expect(headerSwitcher).toBeDefined();
    expect(headerSwitcher?.nextElementSibling).toBe(
      screen.getByRole('button', { name: 'Mở trình đơn' }),
    );

    fireEvent.click(within(headerSwitcher as HTMLElement).getByRole('button', { name: 'English' }));
    await waitFor(() => expect(localStorage.getItem('bep-viet-language')).toBe('en'), {
      timeout: 5000,
    });
  });

  it('shows account links, settings and sign-out directly in the open mobile menu', () => {
    renderLayout();
    const navigation = openMobileMenu();

    expect(
      within(navigation).queryByRole('button', { name: 'Mở menu tài khoản' }),
    ).not.toBeInTheDocument();
    const account = within(navigation).getByRole('region', { name: 'Nguyễn Ngọc Lan' });
    expect(within(account).getByRole('link', { name: 'Cài đặt' })).toHaveAttribute(
      'href',
      '/account/settings',
    );
    expect(within(account).getByRole('link', { name: 'Đổi mật khẩu & bảo mật' })).toHaveAttribute(
      'href',
      '/account/security',
    );
    expect(within(account).getByRole('link', { name: 'Tài khoản của tôi' })).toHaveAttribute(
      'href',
      '/account',
    );
    expect(within(account).getByRole('button', { name: 'Đăng xuất' })).toBeInTheDocument();

    const explore = within(navigation).getByRole('region', { name: 'Khám phá' });
    expect(within(explore).getByRole('link', { name: 'Món yêu thích' })).toHaveAttribute(
      'href',
      '/favorites',
    );
    expect(within(navigation).getAllByRole('link', { name: 'Món yêu thích' })).toHaveLength(1);
  });

  it('offers sign-in and sign-up at the bottom of the mobile menu for guests', () => {
    authState.user = null as unknown as typeof memberUser;
    renderLayout();
    const navigation = openMobileMenu();

    expect(within(navigation).getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(within(navigation).getByRole('link', { name: 'Tạo tài khoản' })).toHaveAttribute(
      'href',
      '/register',
    );
    expect(within(navigation).queryByRole('link', { name: 'Cài đặt' })).not.toBeInTheDocument();
  });
});
