import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { acceptTerms } from '@/features/account/accountApi';
import { I18nProvider } from '@/features/i18n/I18nContext';
import { TermsGate } from '@/features/legal/TermsGate';
import { LEGAL_VERSION } from '@/pages/legal/legalTypes';

const { auth } = vi.hoisted(() => ({
  auth: {
    user: { id: 'u1', full_name: 'Lan', terms_version: null as string | null },
    updateUser: vi.fn(),
    logout: vi.fn(),
  },
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ ...auth, isLoading: false }),
}));
vi.mock('@/features/account/accountApi', () => ({ acceptTerms: vi.fn() }));

function renderGate() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter>
          <TermsGate />
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('TermsGate', () => {
  it('blocks until the current version is accepted and records it', async () => {
    auth.user.terms_version = null;
    vi.mocked(acceptTerms).mockResolvedValue({ terms_version: LEGAL_VERSION } as never);
    renderGate();
    const dialog = screen.getByRole('alertdialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('link', { name: 'Điều khoản sử dụng' }).getAttribute('href')).toBe(
      '/terms',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Tôi đồng ý' }));
    await waitFor(() => expect(acceptTerms).toHaveBeenCalledWith(LEGAL_VERSION));
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalled());
  });

  it('stays hidden once the current version is accepted', () => {
    auth.user.terms_version = LEGAL_VERSION;
    renderGate();
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });
});
