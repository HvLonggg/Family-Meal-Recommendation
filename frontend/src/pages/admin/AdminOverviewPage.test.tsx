import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AdminOverviewPage } from '@/pages/admin/AdminOverviewPage';
import type * as AdminApi from '@/features/admin/adminApi';

const api = vi.hoisted(() => ({ getAdminOverview: vi.fn(), getAdminInsights: vi.fn() }));

vi.mock('@/features/admin/adminApi', async () => ({
  ...(await vi.importActual<typeof AdminApi>('@/features/admin/adminApi')),
  ...api,
}));

const series = (values: number[]) =>
  values.map((count, index) => ({ day: `2026-11-${String(index + 1).padStart(2, '0')}`, count }));

const counts = {
  users: 12,
  active_users: 11,
  admins: 1,
  new_users_7d: 3,
  recipes_published: 40,
  recipes_hidden: 2,
  plan_items: 30,
  planners: 5,
  articles_published: 4,
  articles_pending: 1,
  submissions_pending: 2,
  tickets_open: 3,
  tickets_unviewed: 1,
  locked_logins: 1,
};

function renderPage() {
  api.getAdminOverview.mockResolvedValue({ counts, recent_users: [] });
  api.getAdminInsights.mockImplementation((_signal: AbortSignal | undefined, days: number) =>
    Promise.resolve({
      activity: series([1, 2]),
      signups: series([1, 0]),
      top_recipes: [],
      period_days: days,
      metrics: [
        { key: 'signups', total: 6, previous_total: 3, series: series([2, 4]) },
        { key: 'active_users', total: 4, previous_total: 8, series: series([1, 3]) },
        { key: 'plans_created', total: 5, previous_total: 0, series: series([5, 0]) },
        { key: 'recipes_cooked', total: 0, previous_total: 0, series: series([0, 0]) },
        { key: 'favorites', total: 2, previous_total: 2, series: series([1, 1]) },
      ],
      activity_mix: [{ label: 'Thêm vào kế hoạch', count: 3 }],
      meal_types: [],
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/admin']}>
        <AdminOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('AdminOverviewPage', () => {
  it('shows actionable queue, KPI deltas and an accessible trend chart', async () => {
    renderPage();
    const support = await screen.findByRole('link', { name: /Yêu cầu hỗ trợ chưa xong/ });
    expect(support.getAttribute('href')).toBe('/admin/support');
    expect(screen.getByText('7 việc đang chờ')).toBeTruthy();

    const signups = await screen.findByRole('button', { name: /Người dùng mới/ });
    expect(within(signups).getByText('▲ 100%')).toBeTruthy();
    const active = screen.getByRole('button', { name: /Người dùng hoạt động/ });
    expect(active.getAttribute('aria-pressed')).toBe('true');
    expect(within(active).getByText('▼ 50%')).toBeTruthy();

    fireEvent.click(signups);
    expect(signups.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('img', { name: /Người dùng mới: tổng 6 trong 2 ngày/ })).toBeTruthy();
    expect(screen.getByText('Xem bảng số liệu')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '90 ngày' }));
    expect(api.getAdminInsights).toHaveBeenLastCalledWith(expect.anything(), 90);
  });
});
