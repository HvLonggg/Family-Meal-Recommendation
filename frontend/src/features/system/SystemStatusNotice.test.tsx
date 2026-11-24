import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SystemStatusNotice } from '@/features/system/SystemStatusNotice';
import {
  getSystemStatus,
  reportBusy,
  reportMaintenance,
  reportReachable,
  reportUnreachable,
  resetSystemStatusForTest,
} from '@/features/system/systemStatus';
import { apiRequest, READ_TIMEOUT_MS } from '@/lib/api/client';
import { shouldRetryQuery } from '@/lib/api/retryPolicy';

vi.mock('@/features/i18n/I18nContext', () => ({ useI18n: () => ({ language: 'vi' }) }));

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

const overloaded = (retryAfter = '20') =>
  jsonResponse(
    503,
    { code: 'OVERLOADED', message: 'Đông khách.', field_errors: {}, trace_id: 'x' },
    { 'Retry-After': retryAfter },
  );

describe('system status', () => {
  beforeEach(() => {
    resetSystemStatusForTest();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('only reports an outage after repeated failures and clears it when the server answers', () => {
    reportUnreachable();
    expect(getSystemStatus().kind).toBe('ok');
    reportUnreachable();
    expect(getSystemStatus().kind).toBe('outage');
    reportReachable();
    expect(getSystemStatus().kind).toBe('ok');
  });

  it('switches to maintenance when the API answers 503 MAINTENANCE', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(503, {
            code: 'MAINTENANCE',
            message: 'Nâng cấp kho món.',
            field_errors: {},
            trace_id: 'x',
          }),
        ),
      ),
    );

    await expect(apiRequest('/recipes/catalog')).rejects.toMatchObject({ code: 'MAINTENANCE' });
    expect(getSystemStatus()).toMatchObject({ kind: 'maintenance', message: 'Nâng cấp kho món.' });
  });

  it('shows the maintenance screen with the expected end time and reassurance', () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(200, {
            data: {
              maintenance: true,
              message: 'Nâng cấp kho món.',
              ends_at: '2030-01-01T03:00:00Z',
            },
          }),
        ),
      ),
    );
    render(
      <>
        <SystemStatusNotice />
      </>,
    );
    act(() => reportMaintenance('Nâng cấp kho món.', '2030-01-01T03:00:00Z'));

    const dialog = screen.getByRole('alertdialog', { name: 'Bếp Việt đang được nâng cấp' });
    expect(dialog).toHaveTextContent('Nâng cấp kho món.');
    expect(dialog).toHaveTextContent('10:00');
    expect(dialog).toHaveTextContent('01/01/2030');
    expect(dialog).toHaveTextContent('vẫn được giữ nguyên');
  });

  it('shows a retry banner during an outage', async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        jsonResponse(200, { data: { maintenance: false, message: null, ends_at: null } }),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);
    render(
      <>
        <SystemStatusNotice />
      </>,
    );
    await act(async () => {
      await Promise.resolve();
    });
    act(() => {
      reportUnreachable();
      reportUnreachable();
    });

    expect(screen.getByRole('status')).toHaveTextContent('Chưa kết nối được máy chủ');
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra lại' }));
      await Promise.resolve();
    });
    expect(getSystemStatus().kind).toBe('ok');
    expect(screen.queryByText(/Chưa kết nối được máy chủ/)).not.toBeInTheDocument();
  });

  it('reports busy on 503 OVERLOADED, honours Retry-After and clears on the next success', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(overloaded('20'))
      .mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    vi.stubGlobal('fetch', fetchMock);

    const error = await apiRequest('/recipes').catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: 'OVERLOADED', status: 503 });
    const status = getSystemStatus();
    expect(status.kind).toBe('busy');
    expect(status.retryAt! - Date.now()).toBeGreaterThan(19_000);
    // Không thử lại ngay khi máy chủ đang quá tải.
    expect(shouldRetryQuery(0, error)).toBe(false);

    await apiRequest('/recipes');
    expect(getSystemStatus().kind).toBe('ok');
  });

  it('treats generic 429 as busy but leaves feature and auth rate limits to their screens', async () => {
    const limited = (code: string) =>
      jsonResponse(429, { code, message: 'Chậm lại.', field_errors: {}, trace_id: 'x' });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(limited('LOGIN_RATE_LIMITED'))
        .mockResolvedValueOnce(limited('ASSISTANT_RATE_LIMITED'))
        .mockResolvedValueOnce(new Response('Too Many Requests', { status: 429 })),
    );

    await expect(apiRequest('/auth/login', { method: 'POST' })).rejects.toBeTruthy();
    await expect(apiRequest('/assistant/chat', { method: 'POST' })).rejects.toBeTruthy();
    expect(getSystemStatus().kind).toBe('ok');
    const error = await apiRequest('/recipes').catch((caught: unknown) => caught);
    expect(getSystemStatus().kind).toBe('busy');
    expect(shouldRetryQuery(0, error)).toBe(false);
  });

  it('times out a hanging request instead of waiting forever', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener('abort', () =>
              reject(new DOMException('aborted', 'AbortError')),
            );
          }),
      ),
    );

    const pending = apiRequest('/recipes').catch((caught: unknown) => caught);
    await vi.advanceTimersByTimeAsync(READ_TIMEOUT_MS + 1);
    expect(await pending).toMatchObject({ code: 'REQUEST_TIMEOUT' });
    expect(getSystemStatus().kind).toBe('busy');
  });

  it('shows a busy banner with a countdown that clears itself when the wait ends', async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve(
          jsonResponse(200, { data: { maintenance: false, message: null, ends_at: null } }),
        ),
      ),
    );
    vi.spyOn(Math, 'random').mockReturnValue(0);
    render(<SystemStatusNotice />);
    act(() => reportBusy(10));

    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent('Bếp Việt đang đông khách');
    expect(banner).toHaveTextContent('Tự thử lại sau 10 giây');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(4_000);
    });
    expect(screen.getByRole('status')).toHaveTextContent('Tự thử lại sau 6 giây');

    await act(async () => {
      await vi.advanceTimersByTimeAsync(7_000);
    });
    expect(getSystemStatus().kind).toBe('ok');
    expect(screen.queryByText(/đông khách/)).not.toBeInTheDocument();
  });

  it('keeps maintenance above busy', () => {
    reportMaintenance('Nâng cấp.');
    reportBusy(30);
    expect(getSystemStatus().kind).toBe('maintenance');
  });
});
