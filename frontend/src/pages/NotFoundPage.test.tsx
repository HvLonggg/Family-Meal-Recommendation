import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NotFoundPage } from '@/pages/NotFoundPage';

vi.mock('@/features/i18n/I18nContext', () => ({
  useI18n: () => ({ t: (text: string) => text }),
}));

afterEach(cleanup);

describe('NotFoundPage', () => {
  it('leads back to the recipe catalogue and home page', () => {
    render(
      <MemoryRouter>
        <NotFoundPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Xem kho món' })).toHaveAttribute('href', '/recipes');
    expect(screen.getByRole('link', { name: 'Về trang chủ' })).toHaveAttribute('href', '/');
  });

  it('names a missing recipe explicitly', () => {
    render(
      <MemoryRouter>
        <NotFoundPage kind="recipe" />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Không tìm thấy món ăn' })).toBeInTheDocument();
  });
});
