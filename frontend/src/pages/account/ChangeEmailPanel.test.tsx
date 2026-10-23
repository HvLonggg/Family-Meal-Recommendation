import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { confirmEmailChange, requestEmailChange } from '@/features/account/accountApi';
import { ChangeEmailPanel } from '@/pages/account/ChangeEmailPanel';

const { updateUser } = vi.hoisted(() => ({ updateUser: vi.fn() }));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'user-1', email: 'lan@example.com', full_name: 'Lan', role: 'user' },
    updateUser,
  }),
}));

vi.mock('@/features/account/accountApi', () => ({
  requestEmailChange: vi.fn(),
  confirmEmailChange: vi.fn(),
}));

function renderPanel(hasPassword = true) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <ChangeEmailPanel hasPassword={hasPassword} />
    </QueryClientProvider>,
  );
}

describe('ChangeEmailPanel', () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('sends a code to the new email, then confirms the change', async () => {
    vi.mocked(requestEmailChange).mockResolvedValue({
      challenge_id: 'challenge-1',
      development_code: null,
      expires_in: 300,
      message: 'ok',
    });
    vi.mocked(confirmEmailChange).mockResolvedValue({
      id: 'user-1',
      email: 'moi@example.com',
    } as Awaited<ReturnType<typeof confirmEmailChange>>);
    renderPanel();

    fireEvent.change(screen.getByLabelText('Email mới'), {
      target: { value: 'moi@example.com' },
    });
    fireEvent.change(screen.getByLabelText('Mật khẩu hiện tại'), {
      target: { value: 'Test-Only-No-Login-2026!' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác nhận' }));

    await waitFor(() =>
      expect(requestEmailChange).toHaveBeenCalledWith('moi@example.com', 'Test-Only-No-Login-2026!'),
    );
    expect(await screen.findByText('moi@example.com')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Gửi lại mã sau/ })).toHaveProperty('disabled', true);

    fireEvent.change(screen.getByLabelText('Mã xác nhận'), { target: { value: '12a345' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đổi email' }));

    await waitFor(() => expect(confirmEmailChange).toHaveBeenCalledWith('challenge-1', '12345'));
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(
        expect.objectContaining({ email: 'moi@example.com' }),
      ),
    );
    expect(await screen.findByText(/Đã đổi email thành công/)).toBeTruthy();
    expect(screen.getByLabelText('Email mới')).toHaveProperty('value', '');
  });

  it('rejects the current email without calling the API and skips password for social accounts', () => {
    renderPanel(false);
    expect(screen.queryByLabelText('Mật khẩu hiện tại')).toBeNull();

    fireEvent.change(screen.getByLabelText('Email mới'), {
      target: { value: 'LAN@example.com' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi mã xác nhận' }));

    expect(screen.getByText('Email mới phải khác email hiện tại.')).toBeTruthy();
    expect(requestEmailChange).not.toHaveBeenCalled();
  });
});
