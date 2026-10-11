import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { PlannerPage } from '@/pages/PlannerPage';

const { mockUser } = vi.hoisted(() => ({
  mockUser: { id: 'user-1', full_name: 'Nguyễn An', email: 'an@example.com', role: 'user' },
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: mockUser, isLoading: false, login: vi.fn(), logout: vi.fn() }),
}));

vi.mock('@/data/recipes', () => ({
  recipeMinutes: () => 40,
  recipes: Array.from({ length: 24 }, (_, index) => ({
    slug: `test-dish-${index}`,
    name: `Món kiểm thử ${index + 1}`,
    excerpt: 'Món ăn gia đình',
    category: 'Món mặn',
    region: 'Bắc',
    prepMinutes: 20,
    cookMinutes: 20,
    image: '/images/test-dish.jpg',
    imageAlt: `Món kiểm thử ${index + 1}`,
    tags: [],
    ingredients: [],
  })),
}));

let plannedItems: Array<Record<string, unknown>> = [];
let shoppingRequests: string[] = [];
let savedMealPayloads: Array<Record<string, unknown>> = [];

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
  vi.stubGlobal('fetch', (input: string | URL, init?: RequestInit) => {
    const requestUrl = new URL(typeof input === 'string' ? input : input.href, 'http://localhost');
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
  vi.unstubAllGlobals();
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
    expect(document.querySelector('.planner-dish__link img')).toHaveAttribute(
      'src',
      '/images/suon-xao.jpg',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Danh sách mua sắm' }));
    expect(await screen.findByText('Sườn non')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Nguyên liệu' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Gia vị' })).toBeInTheDocument();
    expect(document.querySelector('.planner-shopping__dishes img')).toHaveAttribute(
      'src',
      '/images/suon-xao.jpg',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Theo tháng' }));
    await waitFor(() =>
      expect(shoppingRequests.some((request) => request.includes('period=month'))).toBe(true),
    );
    expect(await screen.findByText('400 g')).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });
});
