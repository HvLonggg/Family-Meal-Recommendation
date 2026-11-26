import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  consumeOAuthReturnPath,
  landingPath,
  rememberOAuthReturnPath,
  safeReturnPath,
} from '@/features/auth/landing';
import { ProtectedRoute } from '@/features/auth/ProtectedRoute';
import { apiRequest, setAccessToken, setSessionHandlers } from '@/lib/api/client';

const authState = vi.hoisted(() => ({
  isLoading: false,
  sessionExpired: false,
  user: null as null | { role: string },
}));

vi.mock('@/features/auth/AuthContext', () => ({ useAuth: () => authState }));

function LoginProbe() {
  const location = useLocation();
  const state = location.state as { from?: string; notice?: string } | null;
  return (
    <>
      <p>
        login from={state?.from} notice={state?.notice ?? 'none'}
      </p>
      <p>search={location.search}</p>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<LoginProbe />} path="/login" />
        <Route
          element={
            <ProtectedRoute>
              <p>trang công thức</p>
            </ProtectedRoute>
          }
          path="/recipes"
        />
      </Routes>
    </MemoryRouter>,
  );
}

const jsonResponse = (status: number, body: unknown = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  setSessionHandlers(null);
  setAccessToken(null);
  authState.user = null;
  authState.sessionExpired = false;
});

describe('ProtectedRoute', () => {
  it('sends visitors opening a link directly to the login page and remembers the link', () => {
    renderAt('/recipes?q=canh#top');
    expect(screen.getByText('login from=/recipes?q=canh#top notice=none')).toBeInTheDocument();
    // Đường quay lại cũng nằm trong URL để tải lại trang đăng nhập không bị mất.
    expect(screen.getByText('search=?next=%2Frecipes%3Fq%3Dcanh%23top')).toBeInTheDocument();
  });

  it('explains when the session expired', () => {
    authState.sessionExpired = true;
    renderAt('/recipes');
    expect(screen.getByText(/notice=Phiên đăng nhập đã hết hạn/)).toBeInTheDocument();
  });

  it('shows the page once signed in', () => {
    authState.user = { role: 'user' };
    renderAt('/recipes');
    expect(screen.getByText('trang công thức')).toBeInTheDocument();
  });
});

describe('landing after sign-in', () => {
  it('only returns to internal pages', () => {
    expect(safeReturnPath('/recipes?q=canh')).toBe('/recipes?q=canh');
    expect(safeReturnPath('//evil.example.com')).toBeNull();
    expect(safeReturnPath('/\\evil.example.com')).toBeNull();
    expect(safeReturnPath('https://evil.example.com')).toBeNull();
    expect(safeReturnPath('/\t/evil.example.com')).toBeNull();
    expect(safeReturnPath('/\n/evil.example.com')).toBeNull();
    expect(safeReturnPath('/login')).toBeNull();
    expect(safeReturnPath(undefined)).toBeNull();
  });

  it('lands on the home page unless a safe return path was requested', () => {
    expect(landingPath('/planner')).toBe('/planner');
    expect(landingPath('/admin/users')).toBe('/admin/users');
    expect(landingPath(undefined)).toBe('/');
    expect(landingPath(null)).toBe('/');
    expect(landingPath('/login')).toBe('/');
    expect(landingPath('//evil.example')).toBe('/');
  });

  it('remembers the return path across the social sign-in round trip once', () => {
    rememberOAuthReturnPath('/recipes/pho-bo');
    expect(consumeOAuthReturnPath()).toBe('/recipes/pho-bo');
    expect(consumeOAuthReturnPath()).toBeNull();
    rememberOAuthReturnPath('https://evil.example');
    expect(consumeOAuthReturnPath()).toBeNull();
  });
});

describe('apiRequest session renewal', () => {
  it('renews an expired access token once and retries the request', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { code: 'INVALID_TOKEN', message: 'expired' }))
      .mockResolvedValueOnce(jsonResponse(200, { ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old-token');
    const expired = vi.fn();
    setSessionHandlers({
      refresh: () => {
        setAccessToken('new-token');
        return Promise.resolve(true);
      },
      expired,
    });

    await expect(apiRequest('/planner/items')).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const retryHeaders = (fetchMock.mock.calls[1]?.[1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(retryHeaders.Authorization).toBe('Bearer new-token');
    expect(expired).not.toHaveBeenCalled();
  });

  it('ends the session when it cannot be renewed', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(jsonResponse(401, { code: 'INVALID_TOKEN', message: 'expired' })),
    );
    setAccessToken('old-token');
    const expired = vi.fn();
    setSessionHandlers({ refresh: () => Promise.resolve(false), expired });

    await expect(apiRequest('/planner/items')).rejects.toMatchObject({ status: 401 });
    expect(expired).toHaveBeenCalledTimes(1);
  });

  it('does not renew on sign-in errors such as a wrong password', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { code: 'INVALID_CREDENTIALS', message: 'wrong' }));
    vi.stubGlobal('fetch', fetchMock);
    setAccessToken('old-token');
    const refresh = vi.fn().mockResolvedValue(true);
    setSessionHandlers({ refresh, expired: vi.fn() });

    await expect(apiRequest('/auth/change-password')).rejects.toMatchObject({ status: 401 });
    expect(refresh).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
