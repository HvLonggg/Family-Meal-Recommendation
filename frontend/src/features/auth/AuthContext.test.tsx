import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
    localStorage.clear();
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

describe('AuthProvider session hint', () => {
  const HINT = 'bep-viet.auth.has-session';
  const session = {
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
  };
  const unauthorized = Object.assign(new Error('Unauthorized'), { status: 401 });

  function renderProbe() {
    return render(
      <AuthProvider>
        <SessionProbe />
      </AuthProvider>,
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  afterEach(() => {
    cleanup();
    window.history.replaceState(null, '', '/');
  });

  it('asks the server once on a browser without a hint and remembers a guest', async () => {
    vi.mocked(apiPost).mockRejectedValueOnce(unauthorized);
    renderProbe();
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(apiPost).toHaveBeenCalledWith('/auth/refresh');
    expect(localStorage.getItem(HINT)).toBe('0');
  });

  it('does not call /auth/refresh for a known guest', async () => {
    localStorage.setItem(HINT, '0');
    renderProbe();
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(apiPost).not.toHaveBeenCalled();
  });

  it('keeps the hint when the refresh fails because of the network', async () => {
    localStorage.setItem(HINT, '1');
    vi.mocked(apiPost).mockRejectedValueOnce(new TypeError('Failed to fetch'));
    renderProbe();
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    expect(localStorage.getItem(HINT)).toBe('1');
  });

  it('restores the session after a Google sign-in even for a known guest', async () => {
    localStorage.setItem(HINT, '0');
    window.history.replaceState(null, '', '/oauth-callback?status=success');
    vi.mocked(apiPost).mockResolvedValueOnce(session);
    renderProbe();
    expect(await screen.findByText('lan@example.com')).toBeInTheDocument();
    expect(localStorage.getItem(HINT)).toBe('1');
  });

  it('marks the browser after sign-in and clears it on sign-out', async () => {
    localStorage.setItem(HINT, '0');
    function Actions() {
      const { login, logout } = useAuth();
      return (
        <>
          <button
            onClick={() =>
              void login({ email: 'lan@example.com', password: 'secret', remember_me: false })
            }
            type="button"
          >
            login
          </button>
          <button onClick={() => void logout()} type="button">
            logout
          </button>
        </>
      );
    }
    render(
      <AuthProvider>
        <Actions />
        <SessionProbe />
      </AuthProvider>,
    );
    expect(await screen.findByText('signed-out')).toBeInTheDocument();
    vi.mocked(apiPost).mockResolvedValueOnce(session);
    fireEvent.click(screen.getByRole('button', { name: 'login' }));
    expect(await screen.findByText('lan@example.com')).toBeInTheDocument();
    expect(localStorage.getItem(HINT)).toBe('1');
    vi.mocked(apiPost).mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'logout' }));
    await waitFor(() => expect(screen.getByText('signed-out')).toBeInTheDocument());
    expect(localStorage.getItem(HINT)).toBe('0');
  });
});
