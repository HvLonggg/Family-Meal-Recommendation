import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AdminSupportPage } from '@/pages/admin/AdminSupportPage';
import type * as AdminApi from '@/features/admin/adminApi';

const api = vi.hoisted(() => ({
  listAdminSupport: vi.fn(),
  markSupportTicketViewed: vi.fn(),
  replyToSupportTicket: vi.fn(),
  updateSupportTicket: vi.fn(),
  listSupportRecipients: vi.fn(),
  lookupMealRecipient: vi.fn(),
  listAdminRecipes: vi.fn(),
  sendMealSuggestion: vi.fn(),
  listMealSuggestionHistory: vi.fn(),
}));

vi.mock('@/features/admin/adminApi', async () => ({
  ...(await vi.importActual<typeof AdminApi>('@/features/admin/adminApi')),
  ...api,
}));

const ticket = {
  id: 'support-1',
  name: 'Nguyễn Ngọc Lan',
  email: 'lan@example.com',
  topic: 'recipe' as const,
  subject: 'Cần tư vấn món ăn',
  message: 'Tôi muốn xin gợi ý món cho bữa cơm gia đình cuối tuần.',
  status: 'open' as const,
  admin_note: null,
  created_at: '2026-10-01T08:00:00Z',
  updated_at: '2026-10-01T08:00:00Z',
  notification_attempts: 1,
  notification_sent_at: '2026-10-01T08:00:01Z',
  viewed_at: null,
  reply_status: 'not_sent' as const,
  reply_attempts: 0,
  reply_last_attempt_at: null,
  reply_sent_at: null,
  reply_last_error: null,
  reply_subject: null,
  reply_message: null,
};

const recipe = {
  id: 'recipe-1',
  slug: 'bun-cha-ha-noi',
  catalog_id: 'BV001',
  name: 'Bún chả Hà Nội',
  excerpt: 'Thịt nướng thơm ăn cùng bún tươi và rau sống.',
  region: 'Bắc',
  category: 'Món mặn',
  difficulty: 'Vừa',
  prep_minutes: 20,
  cook_minutes: 30,
  base_servings: 4,
  image_path: '/images/recipes/bun-cha.jpg',
  status: 'published' as const,
  tip: '',
  serving: '',
  updated_at: '2026-10-01T08:00:00Z',
  favorites: 0,
  planned: 0,
  cooked: 0,
};

function renderPage() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <AdminSupportPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  api.listAdminSupport.mockResolvedValue({ data: [ticket], total: 1 });
  api.markSupportTicketViewed.mockResolvedValue({ ...ticket, viewed_at: '2026-10-01T09:00:00Z' });
  api.replyToSupportTicket.mockResolvedValue({ ...ticket, reply_status: 'sent' });
  api.updateSupportTicket.mockResolvedValue(ticket);
  api.listSupportRecipients.mockResolvedValue({
    data: [{ email: 'lan@example.com', name: 'Nguyễn Ngọc Lan', latest_at: ticket.created_at }],
  });
  api.lookupMealRecipient.mockImplementation((email: string) =>
    Promise.resolve(
      email === 'lan@example.com'
        ? { email, name: 'Nguyễn Ngọc Lan', source: 'user' }
        : { email, name: null, source: 'new' },
    ),
  );
  api.listAdminRecipes.mockResolvedValue({ data: [recipe], total: 1 });
  api.sendMealSuggestion.mockResolvedValue({ data: [], sent: 1, failed: 0 });
  api.listMealSuggestionHistory.mockResolvedValue({ data: [], total: 0 });
});

afterEach(cleanup);

describe('AdminSupportPage', () => {
  it('marks an opened support request as read and sends an email reply', async () => {
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: /Mở yêu cầu/ }));
    await waitFor(() => expect(api.markSupportTicketViewed).toHaveBeenCalledWith('support-1'));

    fireEvent.change(await screen.findByLabelText('Nội dung phản hồi'), {
      target: { value: 'Bếp Việt cảm ơn bạn. Chúng tôi đã gửi thêm gợi ý món ăn phù hợp.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Gửi phản hồi/ }));

    await waitFor(() =>
      expect(api.replyToSupportTicket).toHaveBeenCalledWith('support-1', {
        subject: '[BV-SUPPORT1] Re: Cần tư vấn món ăn',
        message: 'Bếp Việt cảm ơn bạn. Chúng tôi đã gửi thêm gợi ý món ăn phù hợp.',
      }),
    );
  });

  it('sends a personalized meal email to a selected recipient with a chosen recipe', async () => {
    renderPage();
    fireEvent.click(await screen.findByRole('tab', { name: /Gửi gợi ý bữa ăn/ }));

    const addEmail = (email: string) => {
      fireEvent.change(screen.getByLabelText('Nhập email người dùng'), {
        target: { value: email },
      });
      fireEvent.click(screen.getByRole('button', { name: /Thêm email/ }));
    };
    addEmail('lan@example.com');
    addEmail('moi@example.com');
    addEmail('trong@example.com');

    const recipients = screen.getByRole('list', { name: 'Người nhận đã chọn' });
    // Tài khoản có sẵn dùng tên trong hệ thống, không cho sửa.
    expect(await within(recipients).findByText('Tài khoản Bếp Việt')).toBeInTheDocument();
    expect(within(recipients).getByText('Nguyễn Ngọc Lan')).toBeInTheDocument();
    expect(
      within(recipients).queryByLabelText('Tên gọi trong lời chào cho lan@example.com'),
    ).not.toBeInTheDocument();
    // Email mới có ô nhập tên; để trống thì lời chào là “bạn”.
    expect(await within(recipients).findAllByText('Email mới')).toHaveLength(2);
    fireEvent.change(
      within(recipients).getByLabelText('Tên gọi trong lời chào cho moi@example.com'),
      { target: { value: 'Chị Hoa' } },
    );
    expect(within(recipients).getByText('Lời chào: “Chào Chị Hoa,”')).toBeInTheDocument();
    expect(within(recipients).getByText('Lời chào: “Chào bạn,”')).toBeInTheDocument();

    fireEvent.click(await screen.findByRole('button', { name: /Bún chả Hà Nội/ }));
    expect(screen.getByText('Món sẽ xuất hiện trong email')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Gửi email gợi ý/ }));

    await waitFor(() => expect(api.sendMealSuggestion).toHaveBeenCalled());
    expect(api.sendMealSuggestion.mock.calls[0]?.[0]).toEqual({
      recipient_emails: ['lan@example.com', 'moi@example.com', 'trong@example.com'],
      recipient_names: { 'moi@example.com': 'Chị Hoa' },
      meal_type: 'dinner',
      recipe_slugs: ['bun-cha-ha-noi'],
      subject: 'Gợi ý bữa tối hôm nay từ Bếp Việt',
      intro_message:
        'Bếp Việt trân trọng gửi bạn một vài gợi ý cho bữa tối hôm nay. Các món được đề xuất để bạn dễ kết hợp thành bữa cơm ngon miệng tại nhà.',
      closing_message: 'Chúc bạn và gia đình có bữa ăn thật ngon miệng!',
    });
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Đã gửi 1 email; 0 email chưa gửi được.',
    );
  });
});
