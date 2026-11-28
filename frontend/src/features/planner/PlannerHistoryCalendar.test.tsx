import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getPlanDays, getPlanItems, type PlanItem } from '@/data/plannerApi';
import { PlannerHistoryCalendar } from '@/features/planner/PlannerHistoryCalendar';

vi.mock('@/data/plannerApi', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getPlanDays: vi.fn(),
  getPlanItems: vi.fn(),
}));

function item(
  id: string,
  planDate: string,
  mealType: PlanItem['meal_type'],
  name: string,
  status: PlanItem['completion_status'] = 'planned',
): PlanItem {
  return {
    id,
    plan_date: planDate,
    meal_type: mealType,
    servings: 3,
    completion_status: status,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    recipe: {
      slug: `mon-${id}`,
      name,
      image_path: '/images/test.jpg',
      image_alt: name,
      base_servings: 2,
      ingredients: [],
    },
  };
}

function renderCalendar() {
  return render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <MemoryRouter>
        <PlannerHistoryCalendar today="2026-11-28" userId="user-1" />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('PlannerHistoryCalendar', () => {
  it('marks days with meals and shows the meals of the picked day', async () => {
    vi.mocked(getPlanDays).mockResolvedValue([
      {
        plan_date: '2026-11-10',
        meal_types: ['lunch', 'dinner'],
        item_count: 2,
        completed_count: 1,
      },
    ]);
    vi.mocked(getPlanItems).mockImplementation((from) =>
      Promise.resolve(
        from === '2026-11-10'
          ? [
              item('a', from, 'lunch', 'Bún chả', 'completed'),
              item('b', from, 'dinner', 'Canh chua'),
            ]
          : [],
      ),
    );
    renderCalendar();

    expect(await screen.findByText('Ngày này chưa có bữa nào.')).toBeInTheDocument();
    expect(getPlanDays).toHaveBeenCalledWith('2026-11-01', '2026-11-30', expect.anything());

    const marked = await screen.findByRole('button', { name: /2 bữa, 1\/2 món đã nấu/ });
    fireEvent.click(marked);
    expect(marked).toHaveAttribute('aria-pressed', 'true');

    const detail = (await screen.findByText('Bún chả')).closest('article')!;
    expect(within(detail).getByText('Canh chua')).toBeInTheDocument();
    expect(within(detail).getByText('Bữa trưa')).toBeInTheDocument();
    expect(within(detail).getByText('Bữa tối')).toBeInTheDocument();
    expect(within(detail).getByText('Đã nấu')).toBeInTheDocument();
    expect(getPlanItems).toHaveBeenCalledWith('2026-11-10', '2026-11-10', expect.anything());

    fireEvent.click(screen.getByRole('button', { name: 'Tháng sau' }));
    expect(getPlanDays).toHaveBeenLastCalledWith('2026-12-01', '2026-12-31', expect.anything());
    fireEvent.click(screen.getByRole('button', { name: 'Hôm nay' }));
    expect(await screen.findByText('Ngày này chưa có bữa nào.')).toBeInTheDocument();
  });
});
