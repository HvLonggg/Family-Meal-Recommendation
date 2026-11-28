import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';

import { DEFAULT_PREFERENCES } from '@/features/account/preferences';
import type { UserPreferences } from '@/features/auth/types';
import { vietnamToday } from '@/lib/lunarCalendar';
import { PlannerPage } from '@/pages/PlannerPage';

const { authState, mockUser, updateUser } = vi.hoisted(() => ({
  authState: { guest: false },
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
    user: authState.guest ? null : mockUser,
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
    getRecipeCatalogSource: () => 'online',
    subscribeRecipeCatalog: () => () => undefined,
    setRecipeCatalogSource: () => undefined,
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
let itemRequests: Array<{ id: string; method: string; body?: unknown }> = [];

function planItem(id: string, slug: string, name: string, planDate: string, mealType = 'lunch') {
  return {
    id,
    plan_date: planDate,
    meal_type: mealType,
    servings: 2,
    completion_status: 'planned',
    created_at: '2026-10-07T08:00:00Z',
    updated_at: '2026-10-07T08:00:00Z',
    recipe: {
      slug,
      name,
      image_path: `/images/${slug}.jpg`,
      image_alt: name,
      base_servings: 4,
      ingredients: [],
    },
  };
}

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
  itemRequests = [];
  mockUser.preferences = undefined;
  authState.guest = false;
  window.localStorage.clear();
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
    const itemMatch = /\/planner\/items\/([^/]+)$/.exec(requestUrl.pathname);
    if (itemMatch && (init?.method === 'PATCH' || init?.method === 'DELETE')) {
      const id = decodeURIComponent(itemMatch[1]!);
      const body = init.body ? (JSON.parse(init.body as string) as unknown) : undefined;
      itemRequests.push({ id, method: init.method, body });
      if (init.method === 'DELETE') {
        plannedItems = plannedItems.filter((item) => item.id !== id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      const current = plannedItems.find((item) => item.id === id)!;
      const updated = { ...current, ...(body as Record<string, unknown>) };
      plannedItems = plannedItems.map((item) => (item.id === id ? updated : item));
      return Promise.resolve(jsonResponse(updated));
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
            {
              name: 'Mía',
              category: 'ingredient',
              amount: '0.50',
              unit: 'khúc 40 cm',
              notes: [],
              recipe_names: ['Sườn xào chua ngọt'],
            },
            {
              name: 'Chanh',
              category: 'seasoning',
              amount: '0.30',
              unit: 'quả',
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
  it('shows a read-only week overview that collapses busy meals and remembers the mode', async () => {
    const today = vietnamToday();
    plannedItems = [
      ...Array.from({ length: 5 }, (_, index) =>
        planItem(`lunch-${index}`, `mon-trua-${index}`, `Món trưa ${index + 1}`, today),
      ),
      planItem('dinner-1', 'canh-chua', 'Canh chua cá', today, 'dinner'),
    ];
    const view = renderPlanner();

    await screen.findByRole('button', { name: /^Mở bữa trưa .*: Món trưa 1$/ });
    const toggle = screen.getByRole('button', { name: 'Xem tổng quan tuần' });
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(window.localStorage.getItem('bep-viet:planner-view-mode')).toBe('overview');

    const overview = screen.getByRole('region', { name: 'Tổng quan tuần' });
    // Chỉ đọc: không còn nút thêm món ở ô hay thanh công cụ.
    expect(screen.queryByRole('button', { name: /^Thêm món vào / })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thêm bữa ăn' })).toBeNull();
    expect(within(overview).getByText('Tổng số món').nextSibling).toHaveTextContent('6');

    const lunch = within(overview).getByRole('button', { name: /^Xem bữa trưa .* · 5 món:/ });
    expect(lunch).toHaveAttribute('data-slot', `${today}:lunch`);
    expect(within(lunch).getByText('Món trưa 1')).toBeInTheDocument();
    expect(within(lunch).queryByText('Món trưa 3')).toBeNull();
    expect(within(lunch).getByText('+3 món')).toBeInTheDocument();
    const dinner = within(overview).getByRole('button', { name: /^Xem bữa tối .* · 1 món:/ });
    expect(within(dinner).queryByText(/^\+/)).toBeNull();

    // Bấm ô mở bảng chi tiết ở chế độ chỉ xem: đủ món, không có thao tác sửa.
    fireEvent.click(lunch);
    const panel = screen.getByRole('dialog', { name: 'Bữa trưa' });
    expect(
      within(panel).getByRole('link', { name: 'Xem chi tiết Món trưa 5' }),
    ).toBeInTheDocument();
    expect(within(panel).queryByRole('button', { name: /^Xóa / })).toBeNull();
    expect(within(panel).queryByRole('button', { name: /khẩu phần/ })).toBeNull();
    expect(within(panel).queryByRole('button', { name: 'Thêm món' })).toBeNull();
    fireEvent.keyDown(panel, { key: 'Escape' });
    expect(lunch).toHaveFocus();

    view.unmount();
    renderPlanner();
    expect(
      await screen.findByRole('button', { name: /^Xem bữa trưa .* · 5 món:/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xem tổng quan tuần' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('shows guests a friendly empty overview with a way back to editing', async () => {
    authState.guest = true;
    window.localStorage.setItem('bep-viet:planner-view-mode', 'overview');
    renderPlanner();

    expect(
      await screen.findByText('Tuần này chưa có bữa nào được lên kế hoạch'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Về lịch chỉnh sửa/ }));
    expect(screen.getByRole('button', { name: 'Xem tổng quan tuần' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getAllByRole('button', { name: /^Thêm món vào / }).length).toBeGreaterThan(0);
    expect(window.localStorage.getItem('bep-viet:planner-view-mode')).toBe('edit');
  });

  it('lets guests try the calendar and asks them to sign in only when saving a meal', async () => {
    authState.guest = true;
    renderPlanner();

    expect(await screen.findByText('Kế hoạch nấu ăn của bạn')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm bữa ăn' }));
    fireEvent.click(screen.getAllByRole('button', { name: /^Chọn / })[0]!);
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bữa ăn' }));

    const prompt = await screen.findByRole('dialog', { name: 'Đăng nhập để tiếp tục' });
    expect(within(prompt).getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      expect.stringContaining('/login'),
    );
    expect(savedMealPayloads).toHaveLength(0);
    fireEvent.click(within(prompt).getByRole('button', { name: 'Để sau, tiếp tục xem' }));
    expect(screen.queryByRole('dialog', { name: 'Đăng nhập để tiếp tục' })).toBeNull();
  });

  it('lists recipes in one scrolling list, saves selected dishes, and prints a categorized shopping list', async () => {
    renderPlanner();

    await screen.findByText('Tuần này');
    // Tuần chưa có món thì chưa có gì để mua.
    for (const button of screen.getAllByRole('button', { name: 'Danh sách mua sắm' })) {
      expect(button).toBeDisabled();
    }
    fireEvent.click(screen.getByRole('button', { name: 'Thêm bữa ăn' }));
    const dialog = screen.getByRole('dialog');
    // Một danh sách cuộn duy nhất, không còn phân trang.
    expect(screen.queryByRole('navigation', { name: 'Phân trang danh sách món' })).toBeNull();
    expect(within(dialog).getAllByRole('button', { name: /^Chọn / })).toHaveLength(24);
    fireEvent.click(screen.getAllByRole('button', { name: /^Chọn / })[0]!);
    expect(screen.getByText(/Đã chọn 1 món/)).toBeInTheDocument();
    // Nút lưu và số món đã chọn nằm ở thanh cố định ngoài vùng cuộn, không phải kéo hết danh sách.
    const results = within(dialog).getByLabelText('Kết quả tìm món');
    const saveBar = dialog.querySelector<HTMLElement>('.planner-add-dialog__bar')!;
    expect(results.contains(saveBar)).toBe(false);
    expect(within(saveBar).getByRole('button', { name: 'Lưu bữa ăn' })).toBeEnabled();
    expect(saveBar).toHaveTextContent('Đã chọn 1 món');
    fireEvent.click(screen.getAllByRole('button', { name: /^Chọn / })[10]!);
    expect(screen.getByText(/Đã chọn 2 món/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu bữa ăn' }));
    expect(await screen.findByText('Đã lưu bữa ăn!')).toBeInTheDocument();
    expect(savedMealPayloads).toHaveLength(1);
    expect(savedMealPayloads[0]?.recipe_slugs).toHaveLength(2);
    // Ô lưới chỉ hiện ảnh nhỏ + tên; thao tác từng món nằm trong bảng chi tiết bữa.
    const slotDishes = await screen.findAllByRole('button', {
      name: /^Mở bữa trưa .*: Sườn xào chua ngọt$/,
    });
    expect(slotDishes).toHaveLength(2);
    expect(screen.queryByRole('button', { name: /^Đánh dấu đã nấu / })).toBeNull();
    // Dữ liệu giả dùng ảnh món mặc định.
    expect(document.querySelector('.planner-dish__open img')).toHaveAttribute(
      'src',
      '/images/suon-xao.jpg',
    );
    expect(document.querySelector('.planner-dish__open img')).toHaveClass('dish-cutout');
    // Ô vừa lưu được làm nổi để người dùng thấy ngay món vừa thêm.
    const savedSlot = `${String(savedMealPayloads[0]?.plan_date)}:${String(savedMealPayloads[0]?.meal_type)}`;
    await waitFor(() =>
      expect(document.querySelector(`[data-slot="${savedSlot}"]`)).toHaveClass('is-highlighted'),
    );
    fireEvent.click(slotDishes[0]!);
    const panel = screen.getByRole('dialog', { name: 'Bữa trưa' });
    expect(
      within(panel).getAllByRole('link', { name: 'Xem chi tiết Sườn xào chua ngọt' }),
    ).toHaveLength(2);
    // Nhãn là hành động rõ nghĩa, không phải "✓ Chưa nấu".
    expect(
      within(panel).getAllByRole('button', { name: /^Đánh dấu đã nấu / })[0],
    ).toHaveTextContent('Đánh dấu đã nấu');
    fireEvent.click(within(panel).getByRole('button', { name: 'Đóng chi tiết bữa ăn' }));
    expect(screen.queryByRole('dialog', { name: 'Bữa trưa' })).toBeNull();

    const shoppingButtons = screen.getAllByRole('button', { name: 'Danh sách mua sắm' });
    expect(shoppingButtons).toHaveLength(2);
    expect(shoppingButtons[0]).toBeEnabled();
    fireEvent.click(shoppingButtons[0]!);
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
    // Đơn vị đếm nguyên chiếc được làm tròn lên thành số mua được.
    expect(screen.getByText('1 khúc 40 cm')).toBeInTheDocument();
    expect(screen.getByText('0,5 quả')).toBeInTheDocument();
    expect(dialog).not.toBeInTheDocument();
  });

  it('keeps the week grid compact and manages each dish from the meal detail panel', async () => {
    const today = vietnamToday();
    plannedItems = [
      planItem('item-1', 'canh-chua', 'Canh chua cá', today),
      planItem('item-2', 'rau-muong', 'Rau muống xào tỏi', today),
    ];
    renderPlanner();

    const slotDish = await screen.findByRole('button', { name: /^Mở bữa trưa .*: Canh chua cá$/ });
    const slot = slotDish.closest<HTMLElement>('[data-slot]')!;
    expect(slot).toHaveAttribute('data-slot', `${today}:lunch`);
    expect(within(slot).getByText('2 món')).toBeInTheDocument();
    // Lưới không còn nút xóa / khẩu phần chen vào tên món.
    expect(screen.queryByRole('button', { name: /^Xóa .* khỏi kế hoạch$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Tăng khẩu phần / })).toBeNull();

    fireEvent.click(slotDish);
    const panel = screen.getByRole('dialog', { name: 'Bữa trưa' });
    expect(within(panel).getByText('2 món · 4 khẩu phần')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'Đóng chi tiết bữa ăn' })).toHaveFocus();
    expect(within(panel).getByRole('link', { name: 'Vào bếp nấu Canh chua cá' })).toHaveAttribute(
      'href',
      expect.stringContaining('canh-chua'),
    );
    expect(within(panel).getByRole('link', { name: /Vào bếp cả bữa/ })).toBeInTheDocument();

    fireEvent.click(within(panel).getByRole('button', { name: 'Tăng khẩu phần Canh chua cá' }));
    await waitFor(() =>
      expect(itemRequests).toContainEqual({ id: 'item-1', method: 'PATCH', body: { servings: 3 } }),
    );
    expect(await within(panel).findByText('3 người')).toBeInTheDocument();

    fireEvent.click(
      within(panel).getByRole('button', { name: 'Xóa Rau muống xào tỏi khỏi kế hoạch' }),
    );
    // Hoàn tác hiện ngay trong bảng, không bị che phía sau hộp thoại.
    expect(
      await within(panel).findByText('Đã xóa Rau muống xào tỏi khỏi kế hoạch.'),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(
        within(panel).queryByRole('link', { name: 'Xem chi tiết Rau muống xào tỏi' }),
      ).toBeNull(),
    );

    // "Thêm món" chuyển sang hộp thoại chọn món đúng ngày và bữa đang xem.
    fireEvent.click(within(panel).getByRole('button', { name: 'Thêm món' }));
    expect(screen.queryByRole('dialog', { name: 'Bữa trưa' })).toBeNull();
    const addDialog = screen.getByRole('dialog', { name: 'Chọn món cho bữa ăn' });
    expect(within(addDialog).getByDisplayValue(today)).toBeInTheDocument();
    expect(within(addDialog).getByRole('combobox')).toHaveValue('lunch');
    fireEvent.keyDown(addDialog, { key: 'Escape' });

    // Esc đóng bảng và trả tiêu điểm về món đã bấm.
    const remaining = screen.getByRole('button', { name: /^Mở bữa trưa .*: Canh chua cá$/ });
    fireEvent.click(remaining);
    fireEvent.keyDown(screen.getByRole('dialog', { name: 'Bữa trưa' }), { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Bữa trưa' })).toBeNull();
    expect(remaining).toHaveFocus();
  });

  it('shows both calendars and marks vegetarian days on the Vietnamese lunar calendar', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 25/09/2026 là rằm tháng Tám âm lịch (Tết Trung thu) theo giờ Việt Nam.
    vi.setSystemTime(new Date('2026-09-25T03:00:00Z'));
    // Đang dùng âm lịch nên ngày rằm được tự đánh dấu (lịch dương sẽ đánh dấu ngày 1 và 15 dương).
    mockUser.preferences = {
      ...DEFAULT_PREFERENCES,
      vegetarian_lunar_days: true,
      calendar_mode: 'lunar',
    };
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
    // Đang xem âm lịch: nhãn tuần theo âm lịch.
    expect(screen.getByText('ÂL 11/8 – 17/8 · Bính Ngọ')).toBeInTheDocument();
    expect(screen.queryByText(/Theo giờ Việt Nam/)).toBeNull();
    const fullMoonToggle = screen.getByRole('button', {
      name: 'Bỏ đánh dấu ăn chay ngày Thứ Sáu, 25/09',
    });
    expect(fullMoonToggle.closest('article')).toHaveClass('is-vegetarian', 'is-today');
    expect(screen.getByText('Ăn chay · tự động')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Đánh dấu ăn chay ngày Thứ Tư, 23/09' }));
    const marked = await screen.findByRole('button', {
      name: 'Bỏ đánh dấu ăn chay ngày Thứ Tư, 23/09',
    });
    expect(marked.closest('article')).toHaveClass('is-vegetarian');
    fireEvent.click(fullMoonToggle);
    expect(
      await screen.findByRole('button', { name: 'Đánh dấu ăn chay ngày Thứ Sáu, 25/09' }),
    ).toHaveAttribute('aria-pressed', 'false');
    await waitFor(() =>
      expect(vegetarianPayloads).toEqual([
        { day: '2026-09-23', is_vegetarian: true },
        { day: '2026-09-25', is_vegetarian: false },
      ]),
    );
    expect(screen.getByText('1 ngày ăn chay trong tuần')).toBeInTheDocument();

    fireEvent.click(within(hero).getByRole('button', { name: 'Dương lịch' }));
    await waitFor(() => expect(preferencePayloads[0]?.calendar_mode).toBe('solar'));
    expect(updateUser).toHaveBeenCalled();
    expect(within(hero).getByRole('button', { name: 'Dương lịch' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByText('21/09 – 27/09 · 2026')).toBeInTheDocument();

    // Ô trống bấm được để thêm món, không lặp chữ "Chưa có món".
    expect(screen.queryByText('Chưa có món')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm món vào bữa trưa Thứ Tư, 23/09' }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('ÂL 13/8 · Bính Ngọ')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Chỉ món chay' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(dialog).getAllByRole('button', { name: /^Chọn / })).toHaveLength(1);
    expect(within(dialog).getByText('Món kiểm thử 4')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Chỉ món chay' }));
    expect(within(dialog).getAllByRole('button', { name: /^Chọn / })).toHaveLength(24);
  });
});
