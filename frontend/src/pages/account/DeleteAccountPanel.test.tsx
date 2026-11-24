import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { deleteAccount, requestAccountDeletionCode } from '@/features/account/accountApi';
import { I18nProvider } from '@/features/i18n/I18nContext';
import { DeleteAccountPanel } from '@/pages/account/DeleteAccountPanel';

const logout = vi.fn().mockResolvedValue(undefined);

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({ user: null, isLoading: false, logout, updateUser: vi.fn() }),
}));
vi.mock('@/features/account/accountApi', () => ({
  deleteAccount: vi.fn(),
  requestAccountDeletionCode: vi.fn(),
}));

function LoginLanding() {
  const state = useLocation().state as { notice?: string } | null;
  return <p>{state?.notice}</p>;
}

function renderPanel(hasPassword: boolean) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <MemoryRouter initialEntries={['/account/security']}>
          <Routes>
            <Route
              element={<DeleteAccountPanel hasPassword={hasPassword} />}
              path="/account/security"
            />
            <Route element={<LoginLanding />} path="/login" />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('DeleteAccountPanel', () => {
  it('requires the confirmation word before calling the API', () => {
    renderPanel(true);
    fireEvent.click(screen.getByRole('button', { name: /Tôi muốn xóa tài khoản/ }));
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa vĩnh viễn tài khoản' }));
    expect(screen.getByText('Hãy gõ XÓA để xác nhận.')).toBeTruthy();
    expect(deleteAccount).not.toHaveBeenCalled();
  });

  it('deletes with the password, signs out and returns to sign in', async () => {
    vi.mocked(deleteAccount).mockResolvedValue({ message: 'Tài khoản đã được xóa.' });
    renderPanel(true);
    fireEvent.click(screen.getByRole('button', { name: /Tôi muốn xóa tài khoản/ }));
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), { target: { value: 'secret' } });
    fireEvent.change(screen.getByLabelText('Xác nhận'), { target: { value: 'XÓA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa vĩnh viễn tài khoản' }));

    expect(await screen.findByText('Tài khoản đã được xóa.')).toBeTruthy();
    expect(deleteAccount).toHaveBeenCalledWith({ confirmation: 'XÓA', password: 'secret' });
    expect(logout).toHaveBeenCalled();
  });

  it('uses an emailed code for accounts without a password', async () => {
    vi.mocked(requestAccountDeletionCode).mockResolvedValue({
      challenge_id: 'challenge-1',
      development_code: null,
      expires_in: 600,
      message: 'ok',
    });
    vi.mocked(deleteAccount).mockResolvedValue({ message: 'Đã xóa.' });
    renderPanel(false);
    fireEvent.click(screen.getByRole('button', { name: /Tôi muốn xóa tài khoản/ }));
    expect(screen.queryByLabelText('Mật khẩu hiện tại')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác nhận tới email' }));
    fireEvent.change(await screen.findByLabelText('Mã xác nhận'), { target: { value: '12345' } });
    fireEvent.change(screen.getByLabelText('Xác nhận'), { target: { value: 'XÓA' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa vĩnh viễn tài khoản' }));

    await waitFor(() =>
      expect(deleteAccount).toHaveBeenCalledWith({
        confirmation: 'XÓA',
        challenge_id: 'challenge-1',
        code: '12345',
      }),
    );
  });
});
