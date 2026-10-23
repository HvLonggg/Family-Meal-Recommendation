import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import fixture from '@/data/__fixtures__/apiRecipe.json';
import { AppProviders } from '@/app/providers/AppProviders';
import { getCandidates, calculateMealStats } from '@/data/randomMeals';
import { adaptRecipe, loadRecipeCatalog, type ApiRecipe } from '@/data/recipeApi';
import { ingredientAmount, recipes, replaceRecipeCatalog, recipeMinutes } from '@/data/recipes';
import { matchesRecipeSearch } from '@/data/recipeSearch';
import { apiPost, apiRequest } from '@/lib/api/client';
import { RecipeDetailPage } from '@/pages/RecipeDetailPage';
import { RecipesPage } from '@/pages/RecipesPage';

vi.mock('@/lib/api/client', () => ({
  apiRequest: vi.fn(),
  apiPost: vi.fn().mockRejectedValue(new Error('Unauthenticated')),
  setAccessToken: vi.fn(),
  setSessionHandlers: vi.fn(),
}));
const originalCatalog = [...recipes];
const apiRecipe = fixture as ApiRecipe;

afterEach(() => {
  cleanup();
  replaceRecipeCatalog(originalCatalog);
  vi.resetAllMocks();
  vi.unstubAllGlobals();
});

beforeEach(() => {
  vi.mocked(apiPost).mockRejectedValue(new Error('Unauthenticated'));
});

describe('database recipe catalog', () => {
  it('keeps recipe details, source photo credit and ingredient scaling rules', () => {
    const recipe = adaptRecipe(apiRecipe, new Map([['BV141', 'canh-rau-ngot-thit-bam']]));
    expect(recipe.imageKind).toBe('reference');
    expect(recipe.imageCredit).toBe('Cookbeo');
    expect(recipe.preparation).toHaveLength(2);
    expect(recipe.cooking).toHaveLength(3);
    expect(recipe.pairingSlugs).toContain('canh-rau-ngot-thit-bam');
    expect(recipeMinutes(recipe)).toBe(35);
    expect(matchesRecipeSearch(recipe, 'THIT ba chi')).toBe(true);
    const meat = recipe.ingredients
      .flatMap((group) => group.items)
      .find((item) => item.name === 'Thịt ba chỉ')!;
    const sauce = recipe.ingredients
      .flatMap((group) => group.items)
      .find((item) => item.name === 'Nước mắm')!;
    expect(ingredientAmount(meat, recipe, 6)).toBe(750);
    expect(ingredientAmount(sauce, recipe, 6)).toBe(25);
  });

  it('uses Bếp Việt edited food photography for API recipes when an owned asset exists', () => {
    const recipe = adaptRecipe(
      { ...apiRecipe, slug: 'ca-chep-kho-rieng', image_path: '/images/recipes/old-carp.jpg' },
      new Map(),
    );
    expect(recipe.image).toContain('/images/recipes/edited/ca-chep-kho-rieng-');
    expect(recipe.imageSrcSet).toContain('3840.webp');
    expect(recipe.imageKind).toBe('project');
  });

  it('loads every API page and exposes the new recipes to search and the meal wheel', async () => {
    const catalog = Array.from({ length: 205 }, (_, index): ApiRecipe => ({
      ...apiRecipe,
      catalog_id: `BV${String(index + 1).padStart(3, '0')}`,
      slug: `catalog-${index}`,
      name: `Món thử ${index}`,
    }));
    vi.mocked(apiRequest).mockImplementation((path) => {
      const offset = Number(new URL(path, 'http://localhost').searchParams.get('offset') ?? 0);
      return Promise.resolve({ total: catalog.length, data: catalog.slice(offset, offset + 100) });
    });
    const loadingProgress: number[] = [];
    await loadRecipeCatalog((progress) => loadingProgress.push(progress));
    expect(recipes).toHaveLength(205);
    expect(apiRequest).toHaveBeenCalledTimes(3);
    expect(loadingProgress.at(-1)).toBe(92);
    expect(loadingProgress).toEqual([...loadingProgress].sort((left, right) => left - right));
    expect(recipes[204]?.cooking).toHaveLength(3);
    const candidate = getCandidates('main', 'balanced').find(
      (dish) => dish.sourceKey === 'catalog-204',
    )!;
    expect(candidate.href).toBe('/recipes/catalog-204');
    // Món từ kho được ước tính dinh dưỡng theo định lượng nguyên liệu.
    expect(calculateMealStats([{ role: 'main', dish: candidate }]).hasNutrition).toBe(true);

    const { container } = render(
      <AppProviders>
        <MemoryRouter>
          <RecipesPage />
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.getByText('205 món ăn tại 3 miền Việt Nam')).toBeInTheDocument();
    expect(container.querySelectorAll('.recipe-card')).toHaveLength(9);
    const firstPageTitle = container.querySelector('.recipe-card h3')!.textContent;
    fireEvent.click(screen.getByRole('button', { name: 'Trang tiếp' }));
    expect(container.querySelectorAll('.recipe-card')).toHaveLength(9);
    expect(container.querySelector('.recipe-card h3')!.textContent).not.toBe(firstPageTitle);
    expect(screen.getByRole('button', { name: 'Trang 2' })).toHaveAttribute('aria-current', 'page');
    fireEvent.click(screen.getByRole('button', { name: 'Trang 23' }));
    expect(container.querySelectorAll('.recipe-card')).toHaveLength(7);
    expect(screen.getByRole('button', { name: 'Trang tiếp' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Món canh' }));
    expect(screen.queryByRole('button', { name: 'Trang 23' })).not.toBeInTheDocument();
  });

  it('shows the complete serving guide on the recipe page with Bếp Việt branding', () => {
    replaceRecipeCatalog([adaptRecipe(apiRecipe, new Map())]);
    const { container } = render(
      <AppProviders>
        <MemoryRouter initialEntries={['/recipes/thit-rang-chay-canh']}>
          <Routes>
            <Route path="/recipes/:slug" element={<RecipeDetailPage />} />
          </Routes>
        </MemoryRouter>
      </AppProviders>,
    );
    expect(screen.getByText('Bếp Việt biên soạn')).toBeInTheDocument();
    expect(container.querySelector('.serving-card')).toHaveTextContent(apiRecipe.serving);
    expect(screen.getByText(apiRecipe.content.finished_dish!)).toBeInTheDocument();
    expect(screen.queryByText(/Xem nội dung gốc/)).not.toBeInTheDocument();
  });

  it('scrolls a selected recipe to the main image and cooking content', () => {
    replaceRecipeCatalog([adaptRecipe(apiRecipe, new Map())]);
    const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
    const originalAnimationFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
    const scrollIntoView = vi.fn();
    Object.defineProperty(window, 'requestAnimationFrame', {
      configurable: true,
      value: (callback: FrameRequestCallback) => {
        callback(0);
        return 1;
      },
    });
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: scrollIntoView,
    });

    try {
      render(
        <AppProviders>
          <MemoryRouter initialEntries={['/recipes/thit-rang-chay-canh']}>
            <Routes>
              <Route path="/recipes/:slug" element={<RecipeDetailPage />} />
            </Routes>
          </MemoryRouter>
        </AppProviders>,
      );
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    } finally {
      if (originalScroll) {
        Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
      if (originalAnimationFrame) {
        Object.defineProperty(window, 'requestAnimationFrame', originalAnimationFrame);
      } else {
        delete (window as Partial<Window>).requestAnimationFrame;
      }
    }
  });

  it('keeps the previous catalog if a later API page fails', async () => {
    vi.mocked(apiRequest)
      .mockResolvedValueOnce({ total: 101, data: [apiRecipe] })
      .mockRejectedValueOnce(new Error('offline'));
    await expect(loadRecipeCatalog()).rejects.toThrow('offline');
    expect(recipes).toEqual(originalCatalog);
  });

  it('loads the complete bundled snapshot when the API is unavailable', async () => {
    vi.mocked(apiRequest).mockRejectedValue(new Error('offline'));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(JSON.stringify({ total: 1, data: [apiRecipe] }))),
    );
    await expect(loadRecipeCatalog()).resolves.toBe('offline');
    expect(recipes).toHaveLength(1);
    expect(recipes[0]?.slug).toBe(apiRecipe.slug);
    expect(recipes[0]?.ingredients).not.toHaveLength(0);
  });
});
