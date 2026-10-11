import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { savePreferences } from '@/features/account/accountApi';
import type { UserPreferences } from '@/features/auth/types';
import { SettingsPage } from '@/pages/account/SettingsPage';

const { authState, updateUser, basePreferences } = vi.hoisted(() => ({
  authState: { role: 'user' },
  updateUser: vi.fn(),
  basePreferences: {
    language: 'vi',
    household_description: '',
    household_members: [],
    servings_mode: 'auto',
    manual_servings: 4,
    dietary_tags: [],
    allergies: '',
    spice_level: 'medium',
    preferred_regions: [],
    max_cooking_minutes: 0,
    week_start: 'monday',
    text_size: 'normal',
    reduce_motion: false,
    notify_weekly_plan: true,
    notify_story_updates: true,
    show_name_on_stories: true,
    admin_notify_pending: true,
    admin_landing: 'admin',
    computed_portions: 0,
    computed_servings: 4,
  },
}));

vi.mock('@/features/auth/AuthContext', () => ({
  useAuth: () => ({
    user: {
      id: 'user-1',
      email: 'lan@example.com',
      phone_e164: null,
      full_name: 'Nguyễn Ngọc Lan',
      role: authState.role,
      created_at: '2026-10-01T00:00:00Z',
      preferences: basePreferences,
    },
    isLoading: false,
    updateUser,
  }),
}));

vi.mock('@/features/account/accountApi', () => ({
  savePreferences: vi.fn(),
  exportAccountData: vi.fn(),
}));

function renderSettings() {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.role = 'user';
});

describe('SettingsPage', () => {
  it('turns a household description into members and recommended servings', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve({
        ...preferences,
        computed_servings: 3,
      }),
    );
    renderSettings();

    fireEvent.change(screen.getByLabelText('Mô tả bữa ăn của nhà bạn'), {
      target: { value: 'Gia đình nhỏ 3 người: 2 bố mẹ và bạn nhỏ 12 tuổi' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gợi ý thành viên từ mô tả/ }));

    expect(screen.getByLabelText('Tuổi của Bé')).toHaveValue(12);
    expect(screen.getByText('3 suất')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(savePreferences).mock.calls[0]![0];
    expect(saved.household_members.map((member) => member.label)).toEqual(['Bố', 'Mẹ', 'Bé']);
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
  });

  it('switches to manual servings', () => {
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Tự đặt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    expect(screen.getByText('5 suất')).toBeInTheDocument();
  });

  it('shows administrator settings only to administrators', () => {
    renderSettings();
    expect(screen.queryByText('Thiết lập quản trị')).not.toBeInTheDocument();
    cleanup();

    authState.role = 'admin';
    renderSettings();
    expect(screen.getByText('Thiết lập quản trị')).toBeInTheDocument();
  });
});
