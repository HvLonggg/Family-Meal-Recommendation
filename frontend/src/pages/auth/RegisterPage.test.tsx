import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Route, Routes, useLocation } from 'react-router';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { LEGAL_VERSION } from '@/pages/legal/legalTypes';
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

  afterEach(cleanup);

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
    fireEvent.change(screen.getByLabelText('Mật khẩu'), {
      target: { value: 'Test-Only-No-Login-2026!' },
    });
    fireEvent.change(screen.getByLabelText('Nhập lại mật khẩu'), {
      target: { value: 'Test-Only-No-Login-2026!' },
    });
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Tạo tài khoản' }));

    await waitFor(() =>
      expect(apiPost).toHaveBeenCalledWith('/auth/register', {
        full_name: 'Nguyễn Ngọc Lan',
        email: 'lan@example.com',
        password: 'Test-Only-No-Login-2026!',
        accepted_terms_version: LEGAL_VERSION,
      }),
    );
    expect(await screen.findByText('Tài khoản đã được tạo thành công.')).toBeInTheDocument();
    expect(screen.getByText('lan@example.com')).toBeInTheDocument();
    expect(screen.queryByLabelText(/mã xác thực|otp/i)).not.toBeInTheDocument();
  });

  it('links the consent line to the public terms and privacy pages', () => {
    render(
      <MemoryRouter initialEntries={['/register']}>
        <Routes>
          <Route element={<RegisterPage />} path="/register" />
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByRole('link', { name: 'Điều khoản' })).toHaveAttribute('href', '/terms');
    expect(screen.getByRole('link', { name: 'Chính sách quyền riêng tư' })).toHaveAttribute(
      'href',
      '/privacy',
    );
  });

  it('báo lỗi ngay khi rời ô và giữ đường quay lại khi chuyển sang đăng nhập', async () => {
    render(
      <MemoryRouter initialEntries={['/register?next=%2Fplanner']}>
        <Routes>
          <Route element={<RegisterPage />} path="/register" />
        </Routes>
      </MemoryRouter>,
    );
    expect(document.title).toBe('Đăng ký · Bếp Việt');

    const email = screen.getByLabelText('Địa chỉ email');
    fireEvent.change(email, { target: { value: 'khong-hop-le' } });
    fireEvent.blur(email);
    const password = screen.getByLabelText('Mật khẩu');
    fireEvent.change(password, { target: { value: 'abc' } });
    fireEvent.blur(password);
    const confirm = screen.getByLabelText('Nhập lại mật khẩu');
    fireEvent.change(confirm, { target: { value: 'abd' } });
    fireEvent.blur(confirm);

    expect(await screen.findByText('Email chưa đúng định dạng.')).toBeInTheDocument();
    expect(await screen.findByText('Mật khẩu cần ít nhất 8 ký tự.')).toBeInTheDocument();
    expect(await screen.findByText('Hai mật khẩu chưa trùng nhau.')).toBeInTheDocument();
    expect(email).toHaveAttribute('aria-invalid', 'true');
    expect(email).toHaveAttribute('aria-describedby', 'register-email-error');
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Đăng nhập' })).toHaveAttribute(
      'href',
      '/login?next=%2Fplanner',
    );
  });
});
