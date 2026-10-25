import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { apiPost } from '@/lib/api/client';
import { ForgotPasswordPage } from '@/pages/auth/ForgotPasswordPage';

vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn() }));

function LoginLanding() {
  const location = useLocation();
  const state = location.state as { email?: string } | null;
  return <p>{state?.email}</p>;
}

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
  });

  it('resets the password and carries the same registered email into sign in', async () => {
    vi.mocked(apiPost)
      .mockResolvedValueOnce({
        challenge_id: 'challenge-id',
        development_code: '12345',
        expires_in: 300,
        message: 'Mã khôi phục thử nghiệm đã sẵn sàng.',
      })
      .mockResolvedValueOnce({
        reset_token: 'a-valid-reset-token-that-is-long-enough',
        expires_in: 600,
        message: 'Email đã được xác minh. Hãy tạo mật khẩu mới.',
      })
      .mockResolvedValueOnce({ message: 'Mật khẩu đã được cập nhật.' });

    render(
      <MemoryRouter initialEntries={['/forgot-password']}>
        <Routes>
          <Route element={<ForgotPasswordPage />} path="/forgot-password" />
          <Route element={<LoginLanding />} path="/login" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Email đăng ký / đăng nhập'), {
      target: { value: 'LAN.NGUYEN@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã OTP qua email' }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenNthCalledWith(1, '/auth/forgot-password', {
        email: 'LAN.NGUYEN@example.com',
      }),
    );

    fireEvent.change(screen.getByLabelText('Mã xác thực email'), {
      target: { value: '12345' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Xác minh email' }));
    await waitFor(() =>
      expect(apiPost).toHaveBeenNthCalledWith(2, '/auth/forgot-password/verify-code', {
        challenge_id: 'challenge-id',
        code: '12345',
      }),
    );

    fireEvent.change(screen.getByLabelText('Mật khẩu mới'), {
      target: { value: 'New-Test-Only-No-Login-2026!' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'New-Test-Only-No-Login-2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Cập nhật mật khẩu' }));

    expect(await screen.findByText('lan.nguyen@example.com')).toBeInTheDocument();
    expect(apiPost).toHaveBeenNthCalledWith(3, '/auth/reset-password', {
      token: 'a-valid-reset-token-that-is-long-enough',
      new_password: 'New-Test-Only-No-Login-2026!',
    });

    fireEvent.click(screen.getByRole('link', { name: 'Đăng nhập bằng email này' }));
    expect(await screen.findByText('lan.nguyen@example.com')).toBeInTheDocument();
  });
});
