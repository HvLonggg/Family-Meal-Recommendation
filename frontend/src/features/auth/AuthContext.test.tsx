import { act, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiPost, setAccessToken } from '@/lib/api/client';

import { AuthProvider, useAuth } from './AuthContext';

vi.mock('@/lib/api/client', () => ({
  apiPost: vi.fn(),
  setAccessToken: vi.fn(),
  setSessionHandlers: vi.fn(),
}));

function SessionProbe() {
  const { isLoading, user } = useAuth();
  return <div>{isLoading ? 'loading' : (user?.email ?? 'signed-out')}</div>;
}

describe('AuthProvider browser history restoration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('revalidates the server session before revealing a page restored from BFCache', async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({
        access_token: 'session-access-token',
        token_type: 'bearer',
        expires_in: 900,
        user: {
          id: 'user-1',
          email: 'lan@example.com',
          phone_e164: null,
          full_name: 'Nguyễn Ngọc Lan',
          role: 'user',
          created_at: '2026-10-06T00:00:00Z',
        },
      })
      .mockRejectedValueOnce(new Error('Session expired'));

    render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );

    expect(await screen.findByText('lan@example.com')).toBeInTheDocument();

    const backNavigation = new Event('popstate');
    const restored = new Event('pageshow');
    Object.defineProperty(restored, 'persisted', { value: true });
    act(() => {
      window.dispatchEvent(backNavigation);
      window.dispatchEvent(restored);
    });

    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
    expect(apiPost).toHaveBeenCalledTimes(2);
    expect(setAccessToken).toHaveBeenLastCalledWith(null);
  });
});
