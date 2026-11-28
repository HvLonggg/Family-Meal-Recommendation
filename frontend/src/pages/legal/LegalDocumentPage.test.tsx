import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider, useI18n } from '@/features/i18n/I18nContext';
import { LEGAL_UPDATED_DATE, LEGAL_VERSION } from '@/pages/legal/legalTypes';
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
    expect(screen.getByText(`Cập nhật lần cuối: ${LEGAL_UPDATED_DATE.vi}`)).toBeTruthy();

    const toc = screen.getByRole('navigation', { name: 'Mục lục' });
    const links = within(toc).getAllByRole('link');
    expect(links).toHaveLength(privacyVi.sections.length);
    const rights = within(toc).getByRole('link', { name: /Quyền của bạn/ });
    expect(rights.getAttribute('href')).toBe('#quyen');

    // Nút thu gọn mục lục (dùng trên điện thoại) mở ra, rồi tự đóng khi chọn một mục.
    const toggle = within(toc).getByRole('button', { name: /Mục lục/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');

    fireEvent.click(rights);
    expect(document.activeElement?.id).toBe('quyen');
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
  });

  it('keeps the rewritten documents free of vendor-specific configuration details', () => {
    const text = JSON.stringify([privacyVi, privacyEn, termsVi, termsEn]);
    expect(text).not.toMatch(/Vercel|Render|Neon|Anthropic|Gemini|Argon2|SameSite/);
    expect(termsVi.sections.map((section) => section.id)).toContain('an-toan-thuc-pham');
    expect(privacyVi.sections.some((section) => section.title.includes('Chia sẻ dữ liệu'))).toBe(
      true,
    );
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
