import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { RandomMealPage } from '@/pages/RandomMealPage';

vi.mock('@/features/i18n/I18nContext', () => ({
  useI18n: () => ({
    language: 'vi',
    locale: 'vi-VN',
    t: (text: string, values?: Record<string, string | number>) =>
      text.replace(/\{(\w+)\}/g, (_, key: string) => String(values?.[key] ?? `{${key}}`)),
  }),
}));
vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

const savedMeal = {
  id: 'meal-1',
  createdAt: '2026-11-20T11:30:00.000Z',
  profile: 'balanced',
  dishIds: [
    'main:ca-chep-kho-rieng',
    'soup:canh-chua-ca',
    'vegetable:rau-muong-xao-toi',
    'dessert:seasonal-fruit',
  ],
};

function renderPage() {
  return render(
    <MemoryRouter>
      <RandomMealPage />
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.setItem('bep-viet-random-meal-history-v1:guest', JSON.stringify([savedMeal]));
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('RandomMealPage saved trays', () => {
  it('shows a compact card that opens an accessible detail dialog with dishes and nutrition', () => {
    renderPage();
    const card = screen.getByRole('button', { name: /Mâm cân bằng/ });
    expect(card).toHaveTextContent('4 món');
    expect(card).toHaveTextContent('Trái cây theo mùa');

    card.focus();
    fireEvent.click(card);
    const dialog = screen.getByRole('dialog', { name: 'Mâm cân bằng' });
    const view = within(dialog);
    expect(view.getByText('1. Món chính')).toBeInTheDocument();
    expect(view.getByText('4. Tráng miệng')).toBeInTheDocument();
    expect(view.getByRole('link', { name: /Cá chép kho riềng/i })).toHaveAttribute(
      'href',
      '/recipes/ca-chep-kho-rieng',
    );
    // 310 + 115 + 85 + 95 kcal, 28 + 13 + 3 + 1 g đạm.
    expect(view.getByText('605 kcal')).toBeInTheDocument();
    expect(view.getByText('45 g')).toBeInTheDocument();
    expect(view.getAllByRole('button', { name: 'Đóng' })[0]).toHaveFocus();

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(card).toHaveFocus();
  });

  it('reuses the saved tray from the dialog', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Mâm cân bằng/ }));
    fireEvent.click(screen.getByRole('button', { name: /Dùng lại mâm này/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '4/4 món đã chọn' })).toBeInTheDocument();
  });

  it('gives the fruit platter photo the same uniform plate size as cutout dishes', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /Mâm cân bằng/ }));
    fireEvent.click(screen.getByRole('button', { name: /Dùng lại mâm này/ }));
    const plates = [...document.querySelectorAll<HTMLElement>('.tray-slot .dish-plate')];
    expect(plates).toHaveLength(4);
    const fruit = plates.find((plate) => plate.dataset.dishKind === 'photo');
    expect(fruit?.querySelector('img')?.getAttribute('alt')).toMatch(/trái cây/i);
    for (const plate of plates) expect(plate).toHaveClass('dish-plate--uniform');
  });
});
