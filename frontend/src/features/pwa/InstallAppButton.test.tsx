import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { InstallAppButton } from './InstallAppButton';
import { detectInstallPlatform, getInstallState, resetInstallStateForTest } from './installPrompt';

vi.mock('@/features/i18n/I18nContext', () => ({
  useI18n: () => ({ language: 'vi', t: (text: string) => text }),
}));

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0 Mobile/15E148 Safari/604.1';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15';

function stubUserAgent(userAgent: string) {
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(userAgent);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  act(() => resetInstallStateForTest());
});

describe('detectInstallPlatform', () => {
  it('tells iOS Safari, other iOS browsers, Android and desktop apart', () => {
    expect(detectInstallPlatform(IPHONE)).toBe('ios-safari');
    expect(detectInstallPlatform(IPHONE_CHROME)).toBe('ios-other');
    expect(detectInstallPlatform(IPAD_DESKTOP_UA, 5)).toBe('ios-safari');
    expect(detectInstallPlatform(IPAD_DESKTOP_UA, 0)).toBe('desktop');
    expect(detectInstallPlatform(ANDROID)).toBe('android');
  });
});

describe('InstallAppButton', () => {
  it('opens the native install prompt when the browser offers one', async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = { prompt, userChoice: Promise.resolve({ outcome: 'accepted' as const }) };
    act(() => resetInstallStateForTest({ deferred: event as never }));
    render(<InstallAppButton />);

    fireEvent.click(screen.getByRole('button', { name: /Tải ứng dụng Bếp Việt/ }));

    await waitFor(() => expect(prompt).toHaveBeenCalledTimes(1));
    expect(getInstallState().installed).toBe(true);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Đã cài xong thì nút tự ẩn.
    await waitFor(() => expect(screen.queryByRole('button')).toBeNull());
  });

  it('shows Safari "Add to Home Screen" steps on iPhone', () => {
    stubUserAgent(IPHONE);
    render(<InstallAppButton />);

    fireEvent.click(screen.getByRole('button', { name: /Tải ứng dụng Bếp Việt/ }));

    const dialog = screen.getByRole('dialog', { name: 'Cài trên iPhone / iPad' });
    expect(dialog.textContent).toContain('Thêm vào MH chính');
    fireEvent.click(screen.getByRole('button', { name: 'Đã hiểu' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('falls back to browser-menu steps on Android without a native prompt', () => {
    stubUserAgent(ANDROID);
    render(<InstallAppButton />);

    fireEvent.click(screen.getByRole('button', { name: /Tải ứng dụng Bếp Việt/ }));

    expect(screen.getByRole('dialog', { name: 'Cài trên Android' }).textContent).toContain(
      'Cài đặt ứng dụng',
    );
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('is hidden inside the installed app', () => {
    act(() => resetInstallStateForTest({ installed: true }));
    render(<InstallAppButton />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
