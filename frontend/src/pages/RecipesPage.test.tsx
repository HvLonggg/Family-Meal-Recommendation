import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRecipe, type Recipe } from '@/data/recipes';
import { favoriteRecipesQueryKey } from '@/features/favorites/favoritesApi';
import { seededShuffle } from '@/lib/seededShuffle';
import { RecipesPage } from '@/pages/RecipesPage';

const mocks = vi.hoisted(() => ({
  user: null as { id: string } | null,
  loading: false,
  personal: false,
  maxMinutes: 0,
  catalog: [] as Recipe[],
  request: vi.fn(),
}));
vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: mocks.user, isLoading: mocks.loading }),
}));
vi.mock('@/features/account/preferences', () => ({
  useUserPreferences: () => ({
    isPersonal: mocks.personal,
    preferences: { dietary_tags: [], max_cooking_minutes: mocks.maxMinutes },
  }),
  dietaryConflicts: () => [],
}));
vi.mock('@/features/i18n/recipeContent', () => ({
  useRecipeCatalog: () => mocks.catalog,
  useRecipeCatalogReady: () => true,
}));
vi.mock('@/lib/api/client', () => ({ apiRequest: mocks.request }));
vi.mock('@/components/recipes/RecipeCard', () => ({
  RecipeCard: ({ recipe }: { recipe: Recipe }) => (
    <article data-testid="dish">
      <h3>{recipe.name}</h3>
    </article>
  ),
}));

const base = getRecipe('ca-chep-kho-rieng')!;
function fixture(
  slug: string,
  name: string,
  ingredient: string,
  minutes: number,
  category: Recipe['category'] = 'Món mặn',
): Recipe {
  return {
    ...base,
    slug,
    name,
    category,
    aliases: [],
    tags: [],
    prepMinutes: 0,
    cookMinutes: minutes,
    ingredients: [
      { group: 'Nguyên liệu chính', items: [{ name: ingredient, amount: 200, unit: 'g' }] },
    ],
  };
}
function Location() {
  const location = useLocation();
  const navigate = useNavigate();
  return (
    <>
      <div data-testid="location">{location.search}</div>
      <button onClick={() => void navigate(-1)} type="button">
        Back in test
      </button>
      <button onClick={() => void navigate(1)} type="button">
        Forward in test
      </button>
    </>
  );
}
function renderCatalog(url = '/recipes') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const tree = () => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[url]}>
        <RecipesPage />
        <Location />
      </MemoryRouter>
    </QueryClientProvider>
  );
  const rendered = render(tree());
  return { client, refresh: () => rendered.rerender(tree()) };
}
const names = () => screen.queryAllByTestId('dish').map((card) => card.textContent);
const currentParams = () => new URLSearchParams(screen.getByTestId('location').textContent ?? '');
function openFilters() {
  const toggle = screen.queryByRole('button', { name: /^Bộ lọc/ });
  if (toggle) fireEvent.click(toggle);
}
beforeEach(() => {
  mocks.user = null;
  mocks.loading = false;
  mocks.personal = false;
  mocks.maxMinutes = 0;
  mocks.request.mockReset();
  mocks.catalog = [
    fixture('thit-lon-kho', 'Thịt lợn kho', 'Thịt lợn', 35),
    fixture('ga-luoc', 'Gà luộc', 'Thịt gà', 20),
    fixture('ca-hap', 'Cá hấp', 'Cá chép', 45),
    fixture('rau-muong-luoc', 'Rau muống luộc', 'Rau muống', 5, 'Món rau'),
    fixture('canh-bi-do', 'Canh bí đỏ', 'Bí đỏ', 15, 'Món canh'),
  ];
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query: string) => ({
      matches: query.includes('min-width'),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('catalog browsing workflow', () => {
  it('preserves the savoury tab when sorting and excludes vegetables and soups', () => {
    renderCatalog();
    fireEvent.click(screen.getByRole('button', { name: 'Món mặn' }));
    expect(names()).toEqual(['Gà luộc', 'Thịt lợn kho', 'Cá hấp']);
    fireEvent.change(screen.getByRole('combobox', { name: 'Sắp xếp' }), {
      target: { value: 'name' },
    });
    expect(new URLSearchParams(screen.getByTestId('location').textContent).get('category')).toBe(
      'Món mặn',
    );
    expect(names()).toEqual(['Cá hấp', 'Gà luộc', 'Thịt lợn kho']);
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quick' } });
    expect(names()).toEqual(['Gà luộc', 'Thịt lợn kho', 'Cá hấp']);
  });
  it('combines multi-select ingredients with cooking methods and clears stale selections on tab change', () => {
    renderCatalog('/recipes?category=Món%20mặn');
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Thịt lợn' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gà' }));
    expect(names()).toEqual(['Gà luộc', 'Thịt lợn kho']);
    fireEvent.click(screen.getByRole('button', { name: 'Kho, rim' }));
    expect(names()).toEqual(['Thịt lợn kho']);
    fireEvent.click(screen.getByRole('button', { name: 'Luộc' }));
    expect(names()).toEqual(['Gà luộc', 'Thịt lợn kho']);
    fireEvent.click(screen.getByRole('button', { name: 'Món rau' }));
    expect(names()).toEqual(['Rau muống luộc']);
    expect(screen.getByTestId('location').textContent).not.toMatch(/ingredients|methods/);
  });
  it('applies keyword search and sorting inside the selected tab', async () => {
    renderCatalog('/recipes?category=Món%20mặn');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gà' } });
    // Ô nhập nhận chữ ngay; danh sách lọc sau khi ngừng gõ.
    expect(screen.getByRole('searchbox')).toHaveValue('gà');
    await waitFor(() => expect(names()).toEqual(['Gà luộc']));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'easy' } });
    expect(names()).toEqual(['Gà luộc']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'chicken' } });
    expect(screen.getByRole('searchbox')).toHaveValue('chicken');
    await waitFor(() => expect(names()).toEqual(['Gà luộc']));
  });
  it('keeps desktop pagination to twelve dishes and resets page after a filter', () => {
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog('/recipes?page=2');
    expect(names()).toHaveLength(11);
    expect(names()[0]).toBe('Gà luộc 12');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } });
    expect(screen.getByTestId('location').textContent).not.toContain('page=');
    expect(names()).toHaveLength(12);
  });
  it.each([
    [true, true, 12],
    [false, true, 8],
    [false, false, 6],
  ])('sizes a page for desktop=%s tablet=%s as %i dishes', (desktop, tablet, size) => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('960px') ? desktop : query.includes('680px') ? tablet : false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog('/recipes?sort=quick');
    expect(names()).toHaveLength(size);
  });
  it('shuffles the default catalog per visit seed, shows three rows and reveals more on demand', () => {
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.123456);
    const seed = (0.123456).toString(36).slice(2);
    const expected = seededShuffle(mocks.catalog, seed, (recipe) => recipe.slug).map(
      (recipe) => recipe.name,
    );
    renderCatalog();
    random.mockRestore();
    // Máy tính: lưới 3 cột → 3 hàng = 9 món đầu theo thứ tự xáo của seed.
    expect(names()).toEqual(expected.slice(0, 9));
    expect(expected.slice(0, 9)).not.toEqual(mocks.catalog.slice(0, 9).map(({ name }) => name));
    expect(screen.queryByRole('button', { name: 'Trang tiếp' })).not.toBeInTheDocument();
    expect(screen.getByRole('combobox')).toHaveValue('random');
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm món' }));
    expect(names()).toEqual(expected.slice(0, 18));
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm món' }));
    expect(names()).toEqual(expected);
    expect(screen.queryByRole('button', { name: 'Xem thêm món' })).not.toBeInTheDocument();
    // Chọn sắp xếp cụ thể thì quay lại thứ tự và phân trang như cũ.
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'quick' } });
    expect(currentParams().get('sort')).toBe('quick');
    expect(names()).toHaveLength(12);
    expect(names()[0]).toBe('Gà luộc 0');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'random' } });
    expect(currentParams().has('sort')).toBe(false);
    expect(names()).toEqual(expected.slice(0, 9));
  });
  it('limits the default catalog to three rows of the two-column phone grid', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: query.includes('max-width: 600px'),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    );
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog();
    expect(names()).toHaveLength(6);
  });
  it('names the active category and region in the results heading', () => {
    mocks.catalog = mocks.catalog.map((recipe) => ({ ...recipe, region: 'Trung' }));
    renderCatalog('/recipes?category=Món%20rau&region=Trung');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Món rau · Miền Trung');
  });
  it('centres the empty state and offers to clear filters', () => {
    renderCatalog('/recipes?region=Trung');
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc' }));
    expect(currentParams().has('region')).toBe(false);
    expect(names()).toHaveLength(5);
  });
  it.each(['0', '-1', '1.5', 'NaN', 'Infinity'])('uses page one for invalid page %s', (page) => {
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog(`/recipes?page=${page}`);
    expect(names()).toHaveLength(12);
    expect(names()[0]).toBe('Gà luộc 0');
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang 1' })).toHaveAttribute('aria-current', 'page');
  });
  it('clamps out-of-range pages and preserves filters when moving between pages', () => {
    mocks.catalog = Array.from({ length: 29 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog('/recipes?category=Món%20mặn&ingredients=chicken&methods=boil&page=999');
    expect(names()).toHaveLength(5);
    expect(names()[0]).toBe('Gà luộc 24');
    expect(screen.getByRole('button', { name: 'Trang tiếp' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(names()[0]).toBe('Gà luộc 12');
    expect(currentParams().get('category')).toBe('Món mặn');
    expect(currentParams().get('ingredients')).toBe('chicken');
    expect(currentParams().get('methods')).toBe('boil');
    expect(currentParams().get('page')).toBe('2');
    fireEvent.click(screen.getByRole('button', { name: 'Trang trước' }));
    expect(currentParams().has('page')).toBe(false);
    expect(names()[0]).toBe('Gà luộc 0');
  });
  it('resets pagination for a tab change and an ingredient change', () => {
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog('/recipes?page=2');
    fireEvent.click(screen.getByRole('button', { name: 'Món mặn' }));
    expect(currentParams().has('page')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Trang tiếp' }));
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Gà' }));
    expect(currentParams().has('page')).toBe(false);
    expect(currentParams().get('category')).toBe('Món mặn');
  });
  it('restores tab, sorting, page and selected facets with browser back and forward', () => {
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog('/recipes?category=Món%20mặn&ingredients=chicken&page=2');
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'name' } });
    expect(currentParams().get('sort')).toBe('name');
    expect(currentParams().has('page')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Back in test' }));
    expect(currentParams().get('page')).toBe('2');
    expect(currentParams().get('ingredients')).toBe('chicken');
    expect(screen.getByRole('combobox')).toHaveValue('quick');
    expect(names()[0]).toBe('Gà luộc 12');
    fireEvent.click(screen.getByRole('button', { name: 'Forward in test' }));
    expect(screen.getByRole('combobox')).toHaveValue('name');
    expect(currentParams().has('page')).toBe(false);
  });
  it('ignores unknown URL filter values instead of hiding the catalog', () => {
    renderCatalog(
      '/recipes?category=unknown&region=unknown&ingredients=unknown&methods=unknown&sort=unknown',
    );
    expect(names()).toEqual(['Rau muống luộc', 'Canh bí đỏ', 'Gà luộc', 'Thịt lợn kho', 'Cá hấp']);
    expect(screen.getByRole('combobox')).toHaveValue('quick');
  });
  it('cancels pending keyword changes when browser history restores the same search', async () => {
    vi.useFakeTimers();
    renderCatalog('/recipes?q=gà');
    fireEvent.click(screen.getByRole('button', { name: 'Món mặn' }));
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'cá' } });
    fireEvent.click(screen.getByRole('button', { name: 'Back in test' }));
    expect(screen.getByRole('searchbox')).toHaveValue('gà');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(currentParams().get('q')).toBe('gà');
    expect(currentParams().has('category')).toBe(false);
    expect(names()).toEqual(['Gà luộc']);
  });
  it('flushes submitted search once and keeps the tab while resetting pagination', async () => {
    vi.useFakeTimers();
    renderCatalog('/recipes?category=Món%20mặn&page=2');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '  gà  ' } });
    fireEvent.submit(screen.getByRole('searchbox').closest('form')!);
    expect(screen.getByRole('searchbox')).toHaveValue('gà');
    expect(currentParams().get('q')).toBe('gà');
    expect(currentParams().get('category')).toBe('Món mặn');
    expect(currentParams().has('page')).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(currentParams().get('q')).toBe('gà');
    fireEvent.click(screen.getByRole('button', { name: 'Back in test' }));
    expect(currentParams().get('q')).toBeNull();
    expect(currentParams().get('page')).toBe('2');
  });
  it('applies the latest typed keyword when changing tabs before debounce completes', async () => {
    vi.useFakeTimers();
    renderCatalog();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gà' } });
    fireEvent.click(screen.getByRole('button', { name: 'Món mặn' }));
    expect(currentParams().get('q')).toBe('gà');
    expect(names()).toEqual(['Gà luộc']);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(currentParams().get('category')).toBe('Món mặn');
    expect(currentParams().get('q')).toBe('gà');
    expect(screen.getByRole('searchbox')).toHaveValue('gà');
  });
  it('does not resurrect an old draft when returning to the history entry where typing began', async () => {
    vi.useFakeTimers();
    renderCatalog();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'gà' } });
    fireEvent.click(screen.getByRole('button', { name: 'Món mặn' }));
    expect(currentParams().get('q')).toBe('gà');
    fireEvent.click(screen.getByRole('button', { name: 'Back in test' }));
    expect(currentParams().has('q')).toBe(false);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(currentParams().has('q')).toBe(false);
    expect(names()).toHaveLength(5);
    fireEvent.click(screen.getByRole('button', { name: 'Forward in test' }));
    expect(screen.getByRole('searchbox')).toHaveValue('gà');
    expect(currentParams().get('category')).toBe('Món mặn');
    expect(names()).toEqual(['Gà luộc']);
  });
  it('applies a pending keyword instead of losing it when pagination is clicked', async () => {
    vi.useFakeTimers();
    mocks.catalog = Array.from({ length: 23 }, (_, index) =>
      fixture(`ga-luoc-${index}`, `Gà luộc ${index}`, 'Gà', 20 + index),
    );
    renderCatalog('/recipes?sort=quick');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'Gà luộc 22' } });
    fireEvent.click(screen.getByRole('button', { name: 'Trang tiếp' }));
    expect(screen.getByRole('searchbox')).toHaveValue('Gà luộc 22');
    expect(currentParams().get('q')).toBe('Gà luộc 22');
    expect(currentParams().has('page')).toBe(false);
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(names()).toContain('Gà luộc 22');
    expect(names()).not.toContain('Gà luộc 0');
  });
  it('lets a keyword-only empty search recover without leaving its tab', () => {
    renderCatalog('/recipes?category=Món%20mặn&q=khongtimthay&sort=name');
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole('button', { name: 'Xóa tìm kiếm' }));
    expect(names()).toEqual(['Cá hấp', 'Gà luộc', 'Thịt lợn kho']);
    expect(screen.getByRole('searchbox')).toHaveValue('');
    expect(currentParams().get('category')).toBe('Món mặn');
    expect(currentParams().get('sort')).toBe('name');
  });
  it('keeps advanced filters collapsed and allows removing selections without opening them', () => {
    renderCatalog('/recipes?ingredients=chicken&methods=boil&page=2');
    const toggle = screen.getByRole('button', { name: /^Bộ lọc/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('group', { name: 'Nguyên liệu chính' })).not.toBeInTheDocument();
    expect(names()).toEqual(['Gà luộc']);
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lọc Gà' }));
    expect(currentParams().has('ingredients')).toBe(false);
    expect(currentParams().get('methods')).toBe('boil');
    expect(currentParams().has('page')).toBe(false);
    expect(names()).toEqual(['Rau muống luộc', 'Gà luộc']);
    openFilters();
    expect(screen.getByRole('button', { name: /^Ẩn bộ lọc/ })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByRole('group', { name: 'Cách chế biến' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Ẩn bộ lọc/ }));
    expect(screen.queryByRole('group', { name: 'Cách chế biến' })).not.toBeInTheDocument();
    expect(currentParams().get('methods')).toBe('boil');
  });
  it('reveals extra ingredient choices on demand while keeping URL selections visible', () => {
    mocks.catalog = [
      fixture('lon', 'Thịt lợn kho', 'Thịt lợn', 30),
      fixture('ga', 'Gà luộc', 'Gà', 30),
      fixture('vit', 'Vịt luộc', 'Vịt', 30),
      fixture('ngan', 'Ngan luộc', 'Ngan', 30),
      fixture('ngong', 'Ngỗng luộc', 'Ngỗng', 30),
      fixture('bo', 'Bò luộc', 'Thịt bò', 30),
      fixture('ca', 'Cá hấp', 'Cá chép', 30),
      fixture('tom', 'Tôm hấp', 'Tôm', 30),
    ];
    renderCatalog('/recipes?ingredients=fish');
    openFilters();
    const group = screen.getByRole('group', { name: 'Nguyên liệu chính' });
    expect(within(group).getByRole('button', { name: 'Cá' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(group).queryByRole('button', { name: 'Tôm' })).not.toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Xem thêm Nguyên liệu chính' }));
    expect(within(group).getByRole('button', { name: 'Tôm' })).toBeInTheDocument();
    fireEvent.click(within(group).getByRole('button', { name: 'Thu gọn Nguyên liệu chính' }));
    expect(within(group).queryByRole('button', { name: 'Tôm' })).not.toBeInTheDocument();
    expect(within(group).getByRole('button', { name: 'Cá' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
  it('expands a long selected-filter summary and clears all refinements while preserving tab and sort', () => {
    renderCatalog(
      '/recipes?category=Món%20mặn&sort=name&ingredients=pork,chicken,fish&methods=boil&region=Bắc',
    );
    expect(screen.queryByRole('button', { name: 'Bỏ lọc Luộc' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem thêm bộ lọc đã chọn' }));
    expect(screen.getByRole('button', { name: 'Bỏ lọc Luộc' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bỏ lọc Bắc' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ lọc Luộc' }));
    expect(currentParams().has('methods')).toBe(false);
    expect(currentParams().get('ingredients')).toBe('pork,chicken,fish');
    fireEvent.click(screen.getByRole('button', { name: 'Thu gọn bộ lọc đã chọn' }));
    expect(screen.queryByRole('button', { name: 'Bỏ lọc Bắc' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc (4)' }));
    expect(currentParams().has('ingredients')).toBe(false);
    expect(currentParams().has('methods')).toBe(false);
    expect(currentParams().has('region')).toBe(false);
    expect(currentParams().get('category')).toBe('Món mặn');
    expect(currentParams().get('sort')).toBe('name');
    expect(names()).toEqual(['Cá hấp', 'Gà luộc', 'Thịt lợn kho']);
    expect(screen.queryByRole('button', { name: /^Bỏ lọc/ })).not.toBeInTheDocument();
  });
  it('combines region and personal cooking-time preferences and clears both together', () => {
    mocks.user = { id: 'account-a' };
    mocks.personal = true;
    mocks.maxMinutes = 20;
    mocks.catalog = mocks.catalog.map((recipe, index) => ({
      ...recipe,
      region: index < 2 ? 'Bắc' : 'Nam',
    }));
    renderCatalog();
    openFilters();
    fireEvent.click(screen.getByRole('button', { name: 'Bắc' }));
    expect(names()).toEqual(['Gà luộc', 'Thịt lợn kho']);
    fireEvent.click(screen.getByRole('button', { name: 'Hợp chế độ ăn của tôi' }));
    expect(names()).toEqual(['Gà luộc']);
    expect(currentParams().get('fit')).toBe('1');
    expect(currentParams().get('region')).toBe('Bắc');
    fireEvent.click(screen.getByRole('button', { name: /^Ẩn bộ lọc/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Xóa bộ lọc (2)' }));
    expect(currentParams().has('fit')).toBe(false);
    expect(currentParams().has('region')).toBe(false);
    expect(names()).toHaveLength(5);
  });
  it('requires login for favourites and does not request guest data', () => {
    renderCatalog('/recipes?category=favorites');
    expect(
      screen.getByRole('heading', { name: 'Đăng nhập để xem món yêu thích' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute('href', '/login');
    expect(names()).toEqual([]);
    expect(mocks.request).not.toHaveBeenCalled();
  });
  it('isolates favourites when accounts change, including a late response from the old account', async () => {
    mocks.user = { id: 'account-a' };
    let resolveA!: (value: { slug: string }[]) => void;
    mocks.request.mockImplementation(() =>
      mocks.user?.id === 'account-a'
        ? new Promise((resolve) => {
            resolveA = resolve;
          })
        : Promise.resolve([{ slug: 'ca-hap' }]),
    );
    const { refresh } = renderCatalog('/recipes?category=favorites');
    expect(screen.getByRole('status')).toHaveTextContent('Đang tải món yêu thích');
    mocks.user = { id: 'account-b' };
    refresh();
    await waitFor(() => expect(names()).toEqual(['Cá hấp']));
    await act(async () => {
      resolveA([{ slug: 'ga-luoc' }]);
      await Promise.resolve();
    });
    expect(names()).toEqual(['Cá hấp']);
    mocks.user = null;
    refresh();
    expect(names()).toEqual([]);
  });
  it('reflects removal from the signed-in account collection without falling back to all dishes', async () => {
    mocks.user = { id: 'account-a' };
    mocks.request.mockResolvedValue([{ slug: 'ga-luoc' }]);
    const { client } = renderCatalog('/recipes?category=favorites');
    await waitFor(() => expect(names()).toEqual(['Gà luộc']));
    act(() => {
      client.setQueryData(favoriteRecipesQueryKey('account-a'), []);
    });
    await waitFor(() =>
      expect(screen.getByText('Bộ sưu tập đang chờ món đầu tiên')).toBeInTheDocument(),
    );
    expect(names()).toEqual([]);
  });
  it('shows a safe retry state when favourites fail', async () => {
    mocks.user = { id: 'account-a' };
    mocks.request
      .mockRejectedValueOnce(new Error('internal-token-must-not-leak'))
      .mockResolvedValue([{ slug: 'ga-luoc' }]);
    renderCatalog('/recipes?category=favorites');
    const alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('internal-token');
    expect(names()).toEqual([]);
    fireEvent.click(within(alert).getByRole('button', { name: 'Thử lại' }));
    await waitFor(() => expect(names()).toEqual(['Gà luộc']));
  });
});
