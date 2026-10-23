import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CookedMark } from '@/components/recipes/CookedMark';
import type { CookLog } from '@/features/cooking/cookingApi';
import { I18nProvider } from '@/features/i18n/I18nContext';
import { CookHistoryPage } from '@/pages/account/CookHistoryPage';

const api = vi.hoisted(() => ({
  getCookLogs: vi.fn(),
  deleteCookLog: vi.fn(),
  getRecipeCookSummary: vi.fn(),
  logCooked: vi.fn(),
}));
vi.mock('@/features/cooking/cookingApi', async (importActual) => ({
  ...(await importActual<object>()),
  ...api,
}));
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));

const log = (overrides: Partial<CookLog>): CookLog => ({
  id: 'log-1',
  recipe_slug: 'canh-chua-ca',
  recipe_name: 'Canh chua cá',
  image_path: '/images/canh-chua.jpg',
  servings: 4,
  source: 'cook_mode',
  plan_item_id: null,
  started_at: null,
  cooked_at: '2026-10-21T11:30:00Z',
  duration_seconds: 1800,
  note: null,
  ...overrides,
});

function renderWithProviders(node: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter>{node}</MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('CookHistoryPage', () => {
  it('shows stats, cooked dishes with their source and lets the user remove one', async () => {
    api.getCookLogs.mockResolvedValue({
      data: [
        log({}),
        log({ id: 'log-2', recipe_slug: 'bun-cha', recipe_name: 'Bún chả', source: 'planner' }),
      ],
      total: 2,
      stats: { total: 2, dishes: 2, last_7_days: 2, total_minutes: 30 },
    });
    api.deleteCookLog.mockResolvedValue(undefined);
    renderWithProviders(<CookHistoryPage />);

    expect(await screen.findByText('Canh chua cá')).toBeInTheDocument();
    expect(screen.getByText('Nấu cùng Chú Rồng')).toBeInTheDocument();
    expect(screen.getByText('Theo kế hoạch')).toBeInTheDocument();
    expect(screen.getByText('Phút đứng bếp').nextElementSibling).toHaveTextContent('30');
    expect(screen.getByRole('link', { name: 'Nấu lại Canh chua cá' })).toHaveAttribute(
      'href',
      '/cook?dish=canh-chua-ca%3A4',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Xóa lần nấu Bún chả' }));
    await waitFor(() => expect(api.deleteCookLog).toHaveBeenCalledWith('log-2'));
  });

  it('invites the user to cook when the history is empty', async () => {
    api.getCookLogs.mockResolvedValue({
      data: [],
      total: 0,
      stats: { total: 0, dishes: 0, last_7_days: 0, total_minutes: 0 },
    });
    renderWithProviders(<CookHistoryPage />);
    expect(await screen.findByText('Chưa có món nào được ghi nhận')).toBeInTheDocument();
  });
});

describe('CookedMark', () => {
  it('marks a dish as cooked, shows the count and can undo', async () => {
    api.getRecipeCookSummary.mockResolvedValue({
      recipe_slug: 'canh-chua-ca',
      count: 2,
      last_cooked_at: '2026-10-20T10:00:00Z',
      last_log_id: 'log-0',
    });
    api.logCooked.mockResolvedValue(log({ id: 'log-9', source: 'manual' }));
    api.deleteCookLog.mockResolvedValue(undefined);
    renderWithProviders(<CookedMark servings={3} slug="canh-chua-ca" />);

    const group = screen.getByRole('group', { name: 'Ghi nhận đã nấu' });
    expect(await within(group).findByRole('link', { name: /Đã nấu 2 lần/ })).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: /Đánh dấu đã nấu/ }));
    await waitFor(() =>
      expect(api.logCooked).toHaveBeenCalledWith({
        recipe_slug: 'canh-chua-ca',
        servings: 3,
        source: 'manual',
      }),
    );
    fireEvent.click(await within(group).findByRole('button', { name: 'Hoàn tác' }));
    await waitFor(() => expect(api.deleteCookLog).toHaveBeenCalledWith('log-9'));
    expect(await within(group).findByRole('button', { name: /Đánh dấu đã nấu/ })).toBeVisible();
  });
});
