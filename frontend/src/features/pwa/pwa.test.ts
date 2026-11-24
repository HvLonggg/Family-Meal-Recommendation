import { afterEach, describe, expect, it } from 'vitest';

import {
  INSTALL_DISMISS_KEY,
  INSTALL_SNOOZE_MS,
  installDismissedRecently,
  isIosSafari,
  rememberInstallDismissed,
} from '@/features/pwa/pwa';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

describe('isIosSafari', () => {
  it('nhận Safari trên iPhone và iPad (giả Mac)', () => {
    expect(isIosSafari(IPHONE)).toBe(true);
    expect(
      isIosSafari(
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.4 Safari/605.1.15',
        5,
      ),
    ).toBe(true);
  });

  it('bỏ qua Chrome iOS, Mac thường và Android', () => {
    expect(isIosSafari(IPHONE.replace('Version/17.4', 'CriOS/120.0'))).toBe(false);
    expect(isIosSafari('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15', 0)).toBe(
      false,
    );
    expect(isIosSafari('Mozilla/5.0 (Linux; Android 14) Chrome/120 Mobile Safari/537.36')).toBe(
      false,
    );
  });
});

describe('ghi nhớ lựa chọn "Để sau"', () => {
  afterEach(() => localStorage.removeItem(INSTALL_DISMISS_KEY));

  it('im lặng trong thời gian chờ rồi mới hỏi lại', () => {
    expect(installDismissedRecently()).toBe(false);
    rememberInstallDismissed(1_000);
    expect(installDismissedRecently(1_000 + INSTALL_SNOOZE_MS - 1)).toBe(true);
    expect(installDismissedRecently(1_000 + INSTALL_SNOOZE_MS + 1)).toBe(false);
  });
});
