import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { MemoryRouter } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RegisterPage } from '@/pages/auth/RegisterPage';
import { apiPost } from '@/lib/api/client';

vi.mock('@/lib/api/client', () => ({ apiPost: vi.fn() }));

function LoginLanding() {
  const location = useLocation();
  const state = location.state as { email?: string; notice?: string } | null;
  return (
    <div>
      <p>{state?.notice}</p>
      <p>{state?.email}</p>
    </div>
  );
}

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.mocked(apiPost).mockReset();
  });

  it('creates the account without an OTP step and redirects to sign in', async () => {
    vi.mocked(apiPost).mockResolvedValue({ message: 'Tài khoản đã được tạo thành công.' });
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route element={<RegisterPage />} path="/register" />
          <Route element={<LoginLanding />} path="/login" />
        </Routes>
      </MemoryRouter>,
    );

    fireEvent.change(screen.getByLabelText('Họ và tên'), { target: { value: 'Nguyễn Ngọc Lan' } });
    fireEvent.change(screen.getByLabelText('Địa chỉ email'), {
      target: { value: 'lan@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu'), { target: { value: 'BepViet2026' } });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'BepViet2026' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/auth/register', {
        full_name: 'Nguyễn Ngọc Lan',
        email: 'lan@example.com',
        password: 'BepViet2026',
      }),
    );
    expect(await screen.findByText('Tài khoản đã được tạo thành công.')).toBeInTheDocument();
    expect(screen.getByText('lan@example.com')).toBeInTheDocument();
    expect(screen.queryByLabelText(/mã xác thực|otp/i)).not.toBeInTheDocument();
  });
});
