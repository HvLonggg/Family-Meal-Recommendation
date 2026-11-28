import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { getRecipe, setRecipeDictionary } from '@/data/recipes';
import { I18nProvider, useI18n } from '@/features/i18n/I18nContext';
import { applyRecipeLanguage } from '@/features/i18n/recipeContent';
import { HomePage } from '@/pages/HomePage';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, updateUser: vi.fn() }),
}));

function LanguageButtons() {
  const { setLanguage } = useI18n();
  return (
    <>
      <button onClick={() => setLanguage('en')} type="button">
        to-en
      </button>
      <button onClick={() => setLanguage('vi')} type="button">
        to-vi
      </button>
    </>
  );
}

function renderHome() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <I18nProvider>
        <LanguageButtons />
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

// Nhãn băng chuyền cũng được dịch nên chọn theo thứ tự: 0 là món ăn, 1 là mâm cơm.
const carousel = (index: 0 | 1) => document.querySelectorAll('section.showcase-carousel')[index]!;

function headings(index: 0 | 1) {
  return [...carousel(index).querySelectorAll('h3')].map((heading) => heading.textContent ?? '');
}

function recipeLinks(index: 0 | 1) {
  return [...carousel(index).querySelectorAll('a[href^="/recipes/"]')]
    .map((link) => link.getAttribute('href'))
    .filter((href, index, all) => all.indexOf(href) === index);
}

afterEach(async () => {
  cleanup();
  localStorage.clear();
  await applyRecipeLanguage('vi');
  setRecipeDictionary(null);
});

describe('HomePage carousels', () => {
  it('re-renders both carousels in the new language without reshuffling them', async () => {
    renderHome();
    const recipeOrder = recipeLinks(0);
    const mealOrder = recipeLinks(1);
    const firstRecipeVi = headings(0)[0]!;
    expect(firstRecipeVi).toBeTruthy();
    expect(headings(1)[0]).toMatch(/^Mâm cơm cùng /);

    fireEvent.click(screen.getByRole('button', { name: 'to-en' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('en'));

    // Cùng thứ tự món sau khi đổi ngôn ngữ, nhưng chữ đã được dịch.
    expect(recipeLinks(0)).toEqual(recipeOrder);
    expect(recipeLinks(1)).toEqual(mealOrder);
    const firstName = getRecipe(recipeOrder[0]!.replace('/recipes/', ''))!.name;
    expect(firstName).not.toBe(firstRecipeVi);
    expect(headings(0)[0]).toBe(firstName);
    expect(headings(1)[0]).toMatch(/^A meal with /);

    // Quay lại tiếng Việt thì cả hai băng chuyền về chữ gốc.
    fireEvent.click(screen.getByRole('button', { name: 'to-vi' }));
    await waitFor(() => expect(document.documentElement.lang).toBe('vi'));
    expect(headings(0)[0]).toBe(firstRecipeVi);
    expect(headings(1)[0]).toMatch(/^Mâm cơm cùng /);
  });
});
