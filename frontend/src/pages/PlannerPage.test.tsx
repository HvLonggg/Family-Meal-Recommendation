import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { DEFAULT_PREFERENCES } from '@/features/account/preferences';
import type { UserPreferences } from '@/features/auth/types';
import { PlannerPage } from '@/pages/PlannerPage';

const { mockUser, updateUser } = vi.hoisted(() => ({
  mockUser: {
    id: 'user-1',
    full_name: 'Nguyễn An',
    email: 'an@example.com',
    role: 'user',
    preferences: undefined as UserPreferences | undefined,
  },
  updateUser: vi.fn(),
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: mockUser,
    isLoading: false,
    login: vi.fn(),
    logout: vi.fn(),
    updateUser,
  }),
}));

vi.mock('@/data/recipes', () => {
  const recipes = Array.from({ length: 24 }, (_, index) => ({
    slug: `test-dish-${index}`,
    name: `Món kiểm thử ${index + 1}`,
    excerpt: 'Món ăn gia đình',
    category: index === 3 ? 'Món chay' : 'Món mặn',
    region: 'Bắc',
    prepMinutes: 20,
    cookMinutes: 20,
    image: '/images/test-dish.jpg',
    imageAlt: `Món kiểm thử ${index + 1}`,
    tags: [],
    ingredients: [],
  }));
  return {
    recipeMinutes: () => 40,
    recipes,
    getRecipeCatalog: () => recipes,
    recipeText: (text: string) => text,
    setRecipeDictionary: () => undefined,
  };
});

let plannedItems: Array<Record<string, unknown>> = [];
let shoppingRequests: string[] = [];
let savedMealPayloads: Array<Record<string, unknown>> = [];
let vegetarianMarks = new Map<string, boolean>();
let vegetarianPayloads: Array<{ day: string; is_vegetarian: boolean }> = [];
let preferencePayloads: UserPreferences[] = [];

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPlanner() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <PlannerPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  plannedItems = [];
  shoppingRequests = [];
  savedMealPayloads = [];
  vegetarianMarks = new Map();
  vegetarianPayloads = [];
  preferencePayloads = [];
  mockUser.preferences = undefined;
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input.href, 'http://localhost');
    const vegetarianMatch = /\/planner\/vegetarian-days\/(\d{4}-\d{2}-\d{2})$/.exec(
      requestUrl.pathname,
    );
    if (vegetarianMatch && init?.method === 'PUT') {
      const { is_vegetarian } = JSON.parse(init.body as string) as { is_vegetarian: boolean };
      const day = vegetarianMatch[1]!;
      vegetarianMarks.set(day, is_vegetarian);
      vegetarianPayloads.push({ day, is_vegetarian });
      return Promise.resolve(jsonResponse({ day, is_vegetarian }));
    }
    if (requestUrl.pathname.endsWith('/planner/vegetarian-days')) {
      const from = requestUrl.searchParams.get('from')!;
      const to = requestUrl.searchParams.get('to')!;
      return Promise.resolve(
        jsonResponse(
          [...vegetarianMarks]
            .filter(([day]) => day >= from && day <= to)
            .map(([day, value]) => ({ day, is_vegetarian: value })),
        ),
      );
    }
    if (requestUrl.pathname.endsWith('/account/preferences') && init?.method === 'PUT') {
      const payload = JSON.parse(init.body as string) as UserPreferences;
      preferencePayloads.push(payload);
      return Promise.resolve(jsonResponse(payload));
    }
    if (requestUrl.pathname.endsWith('/planner/meals') && init?.method === 'POST') {
      const payload = JSON.parse(init.body as string) as {
        recipe_slugs: string[];
        plan_date: string;
        meal_type: string;
        servings: number;
      };
      savedMealPayloads.push(payload);
      const items = payload.recipe_slugs.map((slug, index) => ({
        id: `plan-item-${index + 1}`,
        plan_date: payload.plan_date,
        meal_type: payload.meal_type,
        servings: payload.servings,
        completion_status: 'planned',
        created_at: '2026-10-07T08:00:00Z',
        updated_at: '2026-10-07T08:00:00Z',
        recipe: {
          slug,
          name: 'Sườn xào chua ngọt',
          image_path: '/images/suon-xao.jpg',
          image_alt: 'Sườn xào chua ngọt',
          base_servings: 4,
          ingredients: [],
        },
      }));
      plannedItems = items;
      return Promise.resolve(jsonResponse({ items, already_planned: 0 }, 201));
    }
    if (requestUrl.pathname.endsWith('/planner/items')) {
      return Promise.resolve(jsonResponse(plannedItems));
    }
    if (requestUrl.pathname.endsWith('/planner/shopping-list')) {
      shoppingRequests.push(requestUrl.search);
      return Promise.resolve(
        jsonResponse({
          period: requestUrl.searchParams.get('period'),
          from_date: '2026-10-01',
          to_date: '2026-10-31',
          recipe_count: plannedItems.length,
          dishes: [
            {
              slug: 'suon-xao-chua-ngot',
              name: 'Sườn xào chua ngọt',
              image_path: '/images/suon-xao.jpg',
              image_alt: 'Sườn xào chua ngọt',
              plan_date: '2026-10-07',
              meal_type: 'dinner',
              servings: 4,
            },
          ],
          items: [
            {
              name: 'Sườn non',
              category: 'ingredient',
              amount: '400.00',
              unit: 'g',
              notes: [],
              recipe_names: ['Sườn xào chua ngọt'],
            },
          ],
        }),
      );
    }
    if (requestUrl.pathname.endsWith('/planner/history/meals')) {
      return Promise.resolve(jsonResponse({ data: [], total: 0 }));
    }
    if (requestUrl.pathname.endsWith('/planner/history')) {
      return Promise.resolve(jsonResponse({ data: [], total: 0 }));
    }
    return Promise.resolve(jsonResponse({ detail: 'Unexpected request' }, 404));
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe('planner page', () => {
  it('paginates all recipes, saves selected dishes, and prints a categorized shopping list', async () => {
    renderPlanner();

    await screen.findByText('Tuần này');
    fireEvent.click(screen.getByRole('button', { name: 'Thêm bữa ăn' }));
    const dialog = screen.getByRole('dialog');
    expect(screen.getByText(/Trang 1\//)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^Chọn / })[0]!);
    expect(screen.getByText(/1 món đã chọn/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Trang món tiếp theo' }));
    expect(await screen.findByText(/Trang 2\//)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: /^Chọn / })[0]!);
    expect(screen.getByText(/2 món đã chọn/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bữa ăn' }));
    expect(await screen.findByText('Đã lưu bữa ăn!')).toBeInTheDocument();
    expect(savedMealPayloads).toHaveLength(1);
    expect(savedMealPayloads[0]?.recipe_slugs).toHaveLength(2);
    expect(
      await screen.findAllByRole('link', { name: 'Xem chi tiết Sườn xào chua ngọt' }),
    ).toHaveLength(2);
// Dữ liệu giả dùng ảnh món mặc định.
    expect(document.querySelector('.planner-dish__link img')).toHaveAttribute(
      'src',
      '/images/suon-xao.jpg',
    );
    expect(document.querySelector('.planner-dish__link img')).toHaveClass('dish-cutout');

    fireEvent.click(screen.getByRole('button', { name: 'Danh sách mua sắm' }));
    expect(await screen.findByText('Sườn non')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nguyên liệu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gia vị' })).toBeInTheDocument();
    // Ảnh món luôn là bản đã tách nền, không dùng ảnh chụp gốc trong kho.
    expect(document.querySelector('.planner-shopping__dishes img')).toHaveAttribute(
      'src',
      '/images/recipes/edited/suon-xao-chua-ngot-960.webp',
    );
    expect(document.querySelector('.planner-shopping__dishes img')).toHaveClass('dish-cutout');
    fireEvent.click(screen.getByRole('button', { name: 'Theo tháng' }));
    await waitFor(() =>
      expect(shoppingRequests.some((request) => request.includes('period=month'))).toBe(true),
    );
    expect(await screen.findByText('400 g')).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  it('shows both calendars and marks vegetarian days on the Vietnamese lunar calendar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 25/09/2026 là rằm tháng Tám âm lịch (Tết Trung thu) theo giờ Việt Nam.
    vi.setSystemTime(new Date('2026-09-25T03:00:00Z'));
    mockUser.preferences = { ...DEFAULT_PREFERENCES, vegetarian_lunar_days: true };
    renderPlanner();

    const hero = await screen.findByRole('region', { name: 'Lịch hôm nay' });
    // Mỗi lịch xuất hiện ở thẻ ngày và ở nút chuyển lịch chính.
    expect(within(hero).getAllByText('Dương lịch')).toHaveLength(2);
    expect(within(hero).getAllByText('Âm lịch')).toHaveLength(2);
    expect(within(hero).getByText('Tháng 8 · năm Bính Ngọ')).toBeInTheDocument();
    expect(within(hero).getByText('Rằm')).toBeInTheDocument();
    expect(within(hero).getByRole('button', { name: 'Hôm nay ăn chay' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await screen.findByText('Tuần này');
    expect(screen.getByText('ÂL 11/8 – 17/8 · Bính Ngọ')).toBeInTheDocument();
    const fullMoonToggle = screen.getByRole('button', {
      name: 'Bỏ đánh dấu ăn chay ngày 2026-09-25',
    });
    expect(fullMoonToggle.closest('article')).toHaveClass('is-vegetarian', 'is-today');
    expect(screen.getByText('Ăn chay · tự động')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu ăn chay ngày 2026-09-23' }));
    const marked = await screen.findByRole('button', {
      name: 'Bỏ đánh dấu ăn chay ngày 2026-09-23',
    });
    expect(marked.closest('article')).toHaveClass('is-vegetarian');
    fireEvent.click(fullMoonToggle);
    expect(
      await screen.findByRole('button', { name: 'Đánh dấu ăn chay ngày 2026-09-25' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() =>
      expect(vegetarianPayloads).toEqual([
        { day: '2026-09-23', is_vegetarian: true },
        { day: '2026-09-25', is_vegetarian: false },
      ]),
    );
    expect(screen.getByText('1 ngày ăn chay trong tuần')).toBeInTheDocument();

    fireEvent.click(within(hero).getByRole('button', { name: 'Âm lịch' }));
    await waitFor(() => expect(preferencePayloads[0]?.calendar_mode).toBe('lunar'));
    expect(updateUser).toHaveBeenCalled();
    expect(within(hero).getByRole('button', { name: 'Âm lịch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('DL 25/09')).toBeInTheDocument();
    expect(screen.getByText(/^DL 21\/09 – 27\/09 · 2026$/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Thêm món vào bữa trưa 2026-09-23' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('ÂL 13/8 · Bính Ngọ')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Chỉ món chay' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getAllByRole('button', { name: /^Chọn / })).toHaveLength(1);
    expect(within(dialog).getByText('Món kiểm thử 4')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chỉ món chay' }));
    expect(within(dialog).getAllByRole('button', { name: /^Chọn / })).toHaveLength(8);
  });
});
