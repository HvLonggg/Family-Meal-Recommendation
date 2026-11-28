import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { exportAccountData, savePreferences } from '@/features/account/accountApi';
import type * as AccountReport from '@/features/account/accountReport';
import { printAccountReport } from '@/features/account/accountReport';
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
    calendar_mode: 'solar',
    vegetarian_lunar_days: false,
    email_meal_plan_reminders: true,
    text_size: 'normal',
    reduce_motion: false,
    notify_weekly_plan: true,
    notify_story_updates: true,
    show_name_on_stories: true,
    assistant_sassy: false,
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

vi.mock('@/features/account/accountReport', async (importOriginal) => ({
  ...(await importOriginal<typeof AccountReport>()),
  printAccountReport: vi.fn(() => true),
}));

function renderSettings(tab?: string, entry = '/account/settings') {
  const view = render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={[entry]}>
        <SettingsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
  if (tab) fireEvent.click(screen.getByRole('tab', { name: new RegExp(tab) }));
  return view;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authState.role = 'user';
});

describe('SettingsPage', () => {
  it('starts with an empty household and lets the user add and remove members', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Bữa ăn');

    expect(screen.getByText(/Chưa có thành viên nào/)).toBeInTheDocument();
    expect(screen.queryByText('Gia đình nhỏ')).not.toBeInTheDocument();
    const add = screen.getByRole('button', { name: /Thêm thành viên/ });
    fireEvent.click(add);
    fireEvent.click(add);
    fireEvent.click(add);

    fireEvent.change(screen.getByLabelText('Tên gọi thành viên 1'), { target: { value: 'Mẹ' } });
    fireEvent.change(screen.getByLabelText('Tuổi của Thành viên 2'), { target: { value: '8' } });
    fireEvent.change(screen.getByLabelText('Sức ăn của Mẹ'), { target: { value: 'light' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xóa Thành viên 3' }));
    // 0,8 (Mẹ ăn ít) + 0,7 (bé 8 tuổi) ≈ 1,5 → làm tròn 2 suất.
    expect(screen.getByText('2 suất')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(savePreferences).mock.calls[0]![0];
    expect(saved.household_members).toEqual([
      { label: 'Mẹ', age: 30, appetite: 'light' },
      { label: 'Thành viên 2', age: 8, appetite: 'normal' },
    ]);
    expect(saved.servings_mode).toBe('auto');
  });

  it('lets the member age be cleared while typing and commits the typed number', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Bữa ăn');

    fireEvent.click(screen.getByRole('button', { name: /Thêm thành viên/ }));
    const age = screen.getByLabelText('Tuổi của Thành viên 1');
    expect(age).toHaveValue('30');
    fireEvent.change(age, { target: { value: '' } });
    expect(age).toHaveValue('');
    fireEvent.change(age, { target: { value: '2' } });
    fireEvent.change(age, { target: { value: '23' } });
    expect(age).toHaveValue('23');
    fireEvent.change(age, { target: { value: '999' } });
    expect(age).toHaveValue('120');
    fireEvent.change(age, { target: { value: '23' } });
    fireEvent.change(age, { target: { value: '' } });
    fireEvent.blur(age);
    expect(age).toHaveValue('23');

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    expect(vi.mocked(savePreferences).mock.calls[0]![0].household_members).toEqual([
      { label: 'Thành viên 1', age: 23, appetite: 'normal' },
    ]);
  });

  it('turns allergy chips and custom entries into the free-text allergies field', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Bữa ăn');

    fireEvent.click(screen.getByRole('button', { name: 'tôm' }));
    fireEvent.click(screen.getByRole('button', { name: 'đậu phộng' }));
    expect(screen.getByRole('button', { name: 'tôm' })).toHaveAttribute('aria-pressed', 'true');
    const custom = screen.getByLabelText('Thêm dị ứng khác');
    fireEvent.change(custom, { target: { value: 'nấm' } });
    fireEvent.keyDown(custom, { key: 'Enter' });
    fireEvent.change(custom, { target: { value: 'kiwi,' } });
    expect(screen.getByRole('button', { name: 'Bỏ nấm' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bỏ nấm' }));
    fireEvent.click(screen.getByRole('button', { name: 'đậu phộng' }));

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    expect(vi.mocked(savePreferences).mock.calls[0]![0].allergies).toBe('tôm, kiwi');
  });

  it('saves the lunar calendar and automatic vegetarian days', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Thông báo');

    expect(screen.getByText(/Lịch chạy theo giờ Việt Nam \(GMT\+7\)/)).toBeInTheDocument();
    expect(screen.getByText(/Hôm nay .* · Ngày \d+ tháng \d+/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Âm lịch' }));
    expect(screen.getByRole('button', { name: 'Âm lịch' })).toHaveAttribute('aria-pressed', 'true');
    const lunarSwitch = screen.getByRole('switch', { name: /Tự đánh dấu ngày 1 và 15/ });
    expect(lunarSwitch).not.toBeChecked();
    fireEvent.click(lunarSwitch);

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(savePreferences).mock.calls[0]![0];
    expect(saved.calendar_mode).toBe('lunar');
    expect(saved.vegetarian_lunar_days).toBe(true);
  });

  it('saves fixed vegetarian weekdays, month days and months from the chips', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Thông báo');
    const panel = within(screen.getByRole('region', { name: 'Ngày ăn chay' }));

    expect(panel.getByText('Chưa có ngày ăn chay cố định.')).toBeInTheDocument();
    fireEvent.click(panel.getByRole('button', { name: 'Thứ Hai' }));
    fireEvent.click(panel.getByRole('button', { name: 'Ngày 15' }));
    fireEvent.click(panel.getByRole('button', { name: 'Ngày 1' }));
    expect(panel.getByRole('button', { name: 'Thứ Hai' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(panel.getByRole('radio', { name: 'Chọn tháng' }));
    fireEvent.click(panel.getByRole('button', { name: 'Tháng 7' }));
    fireEvent.click(panel.getByRole('button', { name: 'Tháng 1' }));
    expect(
      panel.getByText('Áp dụng: Thứ Hai hằng tuần, ngày 1 và 15 hằng tháng — tháng 1, 7'),
    ).toBeInTheDocument();
    expect(panel.getByText(/^Sắp tới:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));
    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(savePreferences).mock.calls[0]![0];
    expect(saved.vegetarian_weekdays).toEqual([0]);
    expect(saved.vegetarian_month_days).toEqual([1, 15]);
    expect(saved.vegetarian_months).toEqual([1, 7]);
    expect(saved.vegetarian_lunar_days).toBe(false);
    await waitFor(() => expect(updateUser).toHaveBeenCalled());
  });

  it('offers the data download as a printable PDF report only', async () => {
    vi.mocked(exportAccountData).mockResolvedValue({
      profile: {
        full_name: 'Nguyễn Ngọc Lan',
        email: 'lan@example.com',
        role: 'user',
        created_at: '2026-10-01T00:00:00Z',
      },
      meal_plans: [{ date: '2026-11-29', meal_type: 'lunch', recipe_name: 'Canh chua' }],
    });
    renderSettings('Thông báo');

    expect(screen.queryByText(/JSON/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Tải dữ liệu của tôi \(PDF\)/ }));

    await waitFor(() => expect(printAccountReport).toHaveBeenCalledTimes(1));
    const [html, title] = vi.mocked(printAccountReport).mock.calls[0]!;
    expect(html).toContain('lan@example.com');
    expect(html).toContain('Canh chua');
    expect(title).toContain('Nguyễn Ngọc Lan');
  });

  it('enables daily meal reminders by default and lets the user disable them', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Thông báo');

    const reminderToggle = screen.getByRole('switch', {
      name: /Email nhắc món trong kế hoạch/,
    });
    expect(reminderToggle).toBeChecked();
    fireEvent.click(screen.getByText('Email nhắc món trong kế hoạch'));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    const saved = vi.mocked(savePreferences).mock.calls[0]![0];
    expect(saved.email_meal_plan_reminders).toBe(false);
  });

  it('turns on the sassy assistant mode', async () => {
    vi.mocked(savePreferences).mockImplementation((preferences: UserPreferences) =>
      Promise.resolve(preferences),
    );
    renderSettings('Chú Rồng');

    const sassy = screen.getByRole('switch', { name: /Chế độ trả treo/ });
    expect(sassy).not.toBeChecked();
    expect(screen.getByText(/trả lời thông minh, dí dỏm/)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Chế độ trả treo'));
    expect(screen.getByText(/láo nhưng vẫn trả lời đúng/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Lưu cài đặt' }));

    await waitFor(() => expect(savePreferences).toHaveBeenCalledTimes(1));
    expect(vi.mocked(savePreferences).mock.calls[0]![0].assistant_sassy).toBe(true);
  });

  it('switches to manual servings', () => {
    renderSettings('Bữa ăn');
    fireEvent.click(screen.getByRole('button', { name: 'Tự đặt' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tăng khẩu phần' }));
    expect(screen.getByText('5 suất')).toBeInTheDocument();
  });

  it('shows administrator settings only to administrators', () => {
    renderSettings();
    expect(screen.queryByRole('tab', { name: /Quản trị/ })).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Bữa ăn/ })).toBeInTheDocument();
    cleanup();

    authState.role = 'admin';
    renderSettings();
    expect(screen.getByText('Ngôn ngữ & hiển thị')).toBeInTheDocument();
    // Quản trị viên không cần phần cá nhân hóa bữa ăn của người dùng.
    expect(screen.queryByRole('tab', { name: /Bữa ăn/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Thông báo/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('tab', { name: /Quản trị/ }));
    expect(screen.getByText('Thiết lập quản trị')).toBeInTheDocument();
    expect(screen.queryByText('Ngôn ngữ & hiển thị')).not.toBeInTheDocument();
  });

  it('shows one group at a time and opens the tab a link points to', () => {
    renderSettings();
    expect(screen.getByText('Ngôn ngữ & hiển thị')).toBeInTheDocument();
    expect(screen.queryByText('Gia đình & khẩu phần')).not.toBeInTheDocument();
    cleanup();

    renderSettings(undefined, '/account/settings#memories');
    expect(screen.getByRole('tab', { name: /Chú Rồng/ })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Tính cách Chú Rồng')).toBeInTheDocument();
    expect(screen.queryByText('Ngôn ngữ & hiển thị')).not.toBeInTheDocument();
  });
});
