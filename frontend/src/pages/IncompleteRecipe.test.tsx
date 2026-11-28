import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { adaptRecipe, type ApiRecipe } from '@/data/recipeApi';
import {
  formatMinutes,
  getRecipeCatalog,
  hasRecipeSteps,
  isQuickRecipe,
  RECIPE_PLACEHOLDER_IMAGE,
  replaceRecipeCatalog,
} from '@/data/recipes';
import { I18nProvider } from '@/features/i18n/I18nContext';
import { CookModePage } from '@/pages/CookModePage';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: null }) }));
vi.mock('@/features/account/preferences', async (importActual) => ({
  ...(await importActual<object>()),
  useUserPreferences: () => ({ isPersonal: false, preferences: {}, user: null }),
}));

/** Món cộng đồng vừa duyệt từ đề xuất chỉ có tên (đúng dạng API /recipes/catalog trả về). */
const minimalApiRecipe: ApiRecipe = {
  catalog_id: null,
  slug: 'mon-thu-nghiem-cong-dong',
  name: 'Món thử nghiệm cộng đồng',
  excerpt: 'Món ăn do thành viên cộng đồng Bếp Việt đề xuất.',
  region: 'Ba miền',
  category: 'Món mặn',
  difficulty: 'Dễ',
  prep_minutes: 0,
  cook_minutes: 0,
  base_servings: 4,
  image_path: '',
  image_alt: 'Món thử nghiệm cộng đồng',
  serving: '',
  tip: '',
  source_name: 'Cộng đồng Bếp Việt',
  source_url: '',
  ingredients: [],
  steps: [],
  content: {},
};

const original = getRecipeCatalog();

function renderAt(path: string, element: ReactNode, route: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route element={element} path={route} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  replaceRecipeCatalog([...original, adaptRecipe(minimalApiRecipe, new Map())]);
});

afterEach(() => {
  cleanup();
  replaceRecipeCatalog(original);
});

describe('món thiếu dữ liệu (đề xuất cộng đồng)', () => {
  it('dùng ảnh minh họa, không bị coi là món nhanh và hiện "—" cho thời gian', () => {
    const recipe = adaptRecipe(minimalApiRecipe, new Map());
    expect(recipe.image).toBe(RECIPE_PLACEHOLDER_IMAGE);
    expect(recipe.community).toBe(true);
    expect(recipe.tips).toEqual([]);
    expect(hasRecipeSteps(recipe)).toBe(false);
    expect(isQuickRecipe(recipe)).toBe(false);
    expect(formatMinutes(0)).toBe('—');
    expect(formatMinutes(45)).toBe('45 phút');
  });

  it('trang món ẩn "Vào bếp", đọc hướng dẫn và bộ chỉnh khẩu phần khi chưa có bước/nguyên liệu', () => {
    renderAt('/recipes/mon-thu-nghiem-cong-dong', <RecipeDetailPage />, '/recipes/:slug');

    expect(
      screen.getByRole('heading', { level: 1, name: 'Món thử nghiệm cộng đồng' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Vào bếp/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Tăng khẩu phần' })).not.toBeInTheDocument();
    expect(screen.getByText(/chưa có các bước nấu chi tiết/)).toBeInTheDocument();
    expect(screen.getByText(/chưa có danh sách nguyên liệu/)).toBeInTheDocument();
    expect(screen.getByText('Món do cộng đồng đề xuất')).toBeInTheDocument();
    expect(screen.getByText('Món chưa có ảnh, đang dùng hình minh họa')).toBeInTheDocument();
  });

  it('món đầy đủ vẫn có nút "Vào bếp" và bộ chỉnh khẩu phần như cũ', () => {
    renderAt('/recipes/canh-chua-ca', <RecipeDetailPage />, '/recipes/:slug');

    expect(screen.getByRole('link', { name: /Vào bếp/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/cook?dish=canh-chua-ca'),
    );
    expect(screen.getByRole('button', { name: 'Tăng khẩu phần' })).toBeInTheDocument();
    expect(screen.queryByText(/chưa có các bước nấu chi tiết/)).not.toBeInTheDocument();
  });

  it('mở thẳng chế độ nấu cho món chưa có bước thì báo thân thiện', () => {
    renderAt('/cook?dish=mon-thu-nghiem-cong-dong', <CookModePage />, '/cook');

    expect(
      screen.getByRole('heading', { name: 'Món này chưa có hướng dẫn từng bước' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem thông tin món' })).toHaveAttribute(
      'href',
      '/recipes/mon-thu-nghiem-cong-dong',
    );
  });
});
