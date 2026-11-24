import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n } from '@/features/i18n/I18nContext';
import { LEGAL_VERSION } from '@/pages/legal/legalTypes';
import { PrivacyPage, TermsPage } from '@/pages/legal/LegalDocumentPage';
import { privacyEn, privacyVi } from '@/pages/legal/privacyContent';
import { termsEn, termsVi } from '@/pages/legal/termsContent';

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, updateUser: vi.fn() }),
}));

function SwitchLanguage({ to }: { to: 'vi' | 'en' }) {
  const { language, setLanguage } = useI18n();
  return language === to ? null : (
    <button onClick={() => setLanguage(to)} type="button">
      switch
    </button>
  );
}

function renderAt(path: string) {
  return render(
    <I18nProvider>
      <SwitchLanguage to="en" />
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route element={<PrivacyPage />} path="privacy" />
          <Route element={<TermsPage />} path="terms" />
          <Route element={<p>Trang chủ</p>} path="/" />
        </Routes>
      </MemoryRouter>
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('Legal pages', () => {
  it('renders the privacy policy with version, effective date and anchored contents', () => {
    renderAt('/privacy');
    expect(
      screen.getByRole('heading', { level: 1, name: 'Chính sách quyền riêng tư' }),
    ).toBeTruthy();
    expect(screen.getByText(`Phiên bản: ${LEGAL_VERSION}`)).toBeTruthy();
    expect(screen.getByText(/Ngày hiệu lực:/)).toBeTruthy();

    const toc = screen.getByRole('navigation', { name: 'Mục lục' });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(privacyVi.sections.length);
    const rights = within(toc).getByRole('link', { name: /Quyền của bạn/ });
    expect(rights.getAttribute('href')).toBe('#quyen');

    fireEvent.click(rights);
    expect(document.activeElement?.id).toBe('quyen');
  });

  it('names the operator and leaves no unfilled placeholders', () => {
    const text = JSON.stringify([privacyVi, privacyEn, termsVi, termsEn]);
    expect(text).toContain('Hoàng Văn Long');
    expect(text).toContain('Hoang Van Long');
    expect(text).not.toMatch(
      /\[(Tên|Địa chỉ|Email|Thời hạn|Số ngày|Khu vực|Operator|Registered|Privacy|Legal|Database)[^\]]*\]/,
    );
  });

  it('has matching sections in both languages', () => {
    expect(privacyEn.sections.map((section) => section.id)).toEqual(
      privacyVi.sections.map((section) => section.id),
    );
    expect(termsEn.sections.map((section) => section.id)).toEqual(
      termsVi.sections.map((section) => section.id),
    );
  });

  it('links between terms and privacy and shows English when chosen', async () => {
    renderAt('/terms');
    fireEvent.click(screen.getByRole('button', { name: 'switch' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Terms of Use' }, { timeout: 5000 }),
    ).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Legal documents' });
    expect(within(nav).getByRole('link', { name: 'Privacy Policy' }).getAttribute('href')).toBe(
      '/privacy',
    );
    expect(
      within(nav).getByRole('link', { name: 'Terms of Use' }).getAttribute('aria-current'),
    ).toBe('page');
  });
});
