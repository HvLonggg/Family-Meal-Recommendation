import { StrictMode } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { PwaPrompts } from './PwaPrompts';
import { beginUpdate } from './updateState';

const worker = vi.hoisted(() => ({ state: 'installed' }));
const mocks = vi.hoisted(() => ({
  activate: vi.fn(),
  notify: null as null | ((worker: ServiceWorker) => void),
}));
vi.mock('@/features/i18n/I18nContext', () => ({ useI18n: () => ({ language: 'vi' }) }));
vi.mock('@/features/pwa/pwa', () => ({
  activateUpdate: mocks.activate,
  isStandalone: () => true,
  isIosSafari: () => false,
  installDismissedRecently: () => false,
  rememberInstallDismissed: vi.fn(),
  registerAppWorker: (notify: (worker: ServiceWorker) => void) => {
    mocks.notify = notify;
    notify(worker as ServiceWorker);
    return Promise.resolve({ waiting: worker, update: vi.fn().mockResolvedValue(undefined) });
  },
}));
beforeEach(() => {
  vi.stubEnv('PROD', true);
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ build: 'next-build' }) }),
  );
  mocks.activate.mockReset();
  sessionStorage.clear();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  sessionStorage.clear();
});

it('does not offer an update when a waiting worker belongs to the current build', async () => {
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ build: __APP_BUILD__ }),
  } as Response);
  render(<PwaPrompts />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByText('Đã có phiên bản mới')).toBeNull();
});

it('shows the progress screen while activation is pending', async () => {
  mocks.activate.mockImplementation(() => new Promise(() => undefined));
  render(<PwaPrompts />);
  fireEvent.click(await screen.findByText('Cập nhật ngay'));
  await waitFor(() =>
    expect(screen.getByRole('progressbar').getAttribute('aria-valuenow')).toBe('35'),
  );
  expect(screen.queryByText('Đã có phiên bản mới')).toBeNull();
});

it('shows a retryable error instead of success when activation fails', async () => {
  mocks.activate.mockRejectedValue(new Error('timeout'));
  render(<PwaPrompts />);
  fireEvent.click(await screen.findByText('Cập nhật ngay'));
  expect(await screen.findByText('Chưa cập nhật được. Vui lòng thử lại.')).toBeTruthy();
  expect(screen.queryByRole('progressbar')).toBeNull();
});

it('shows completion once after reload, including StrictMode, without offering the same build', async () => {
  beginUpdate('previous-build');
  vi.mocked(fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ build: __APP_BUILD__ }),
  } as Response);
  const view = render(
    <StrictMode>
      <PwaPrompts />
    </StrictMode>,
  );
  expect(await screen.findByText('Ứng dụng đã cập nhật')).toBeTruthy();
  fireEvent.click(screen.getByText('Đóng'));
  view.unmount();
  render(<PwaPrompts />);
  await waitFor(() => expect(fetch).toHaveBeenCalled());
  expect(screen.queryByText('Ứng dụng đã cập nhật')).toBeNull();
  expect(screen.queryByText('Đã có phiên bản mới')).toBeNull();
});
